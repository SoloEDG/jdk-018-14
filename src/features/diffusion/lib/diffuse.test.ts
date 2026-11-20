import { describe, it, expect } from "vitest";
import { diffuse, type DiffuseResult } from "./diffuse";
import { rasterize, type RasterResult } from "./rasterize";
import type { Crop } from "../../../shared/document";

const FULL: Crop = { x: 0, y: 0, width: 1, height: 1 };
const NONE = () => false;

function emptyRaster(columns: number, rows: number): RasterResult {
  return {
    mode: new Uint8Array(columns * rows),
    zoneId: new Int16Array(columns * rows),
    blockR: new Uint16Array(columns * rows),
    blockD: new Uint16Array(columns * rows),
    protectedCells: 0,
    sealedCells: 0,
    blockedEdges: 0,
    outsideLines: 0,
    outsideZones: 0,
  };
}

function tonesOf(columns: number, rows: number, v: number): Float32Array {
  return new Float32Array(columns * rows).fill(v);
}

describe("diffuse · 误差扩散", () => {
  it("连续扩散：色阶在合法范围内，常量输入不产生斑点", async () => {
    const r = (await diffuse(tonesOf(8, 8, 0.5), 8, 8, 10, null, NONE))!;
    expect(r).not.toBeNull();
    for (const lv of r.levels) {
      expect(lv).toBeGreaterThanOrEqual(0);
      expect(lv).toBeLessThanOrEqual(9);
    }
    expect(r.speckles).toBe(0);
    expect(r.grain).toBeGreaterThanOrEqual(0);
  });

  it("屏障线截断误差：右侧单元收不到左侧误差，截断处留痕", async () => {
    const columns = 4,
      rows = 1;
    const raster = emptyRaster(columns, rows);
    raster.blockR[1] = 1; // 第 1 列与第 2 列之间被屏障线 #1 封锁
    raster.blockedEdges = 1;
    const tones = new Float32Array([0.9, 0.9, 0, 0]);
    const r = (await diffuse(tones, columns, rows, 2, raster, NONE))!;
    // (1,0) 向右的传递被屏障线 #1 截断
    expect(r.trace.outStatus[1 * 4 + 0]).toBe(1);
    expect(r.trace.outLine[1 * 4 + 0]).toBe(1);
    // (2,0) 没有收到任何传入误差
    expect([...r.trace.inSrc.slice(2 * 4, 2 * 4 + 4)]).toEqual([-1, -1, -1, -1]);
    expect(r.dropped).toBeGreaterThan(0);
  });

  it("保护区单元保持直接映射，误差不进不出", async () => {
    const columns = 4,
      rows = 1;
    const raster = emptyRaster(columns, rows);
    raster.mode[2] = 1;
    raster.zoneId[2] = 1;
    raster.protectedCells = 1;
    const tones = new Float32Array([0.9, 0.9, 0.5, 0.9]);
    const r = (await diffuse(tones, columns, rows, 2, raster, NONE))!;
    // 保护区单元按自身亮度直接量化（0.5 → 色阶 1），不接收误差
    expect(r.levels[2]).toBe(1);
    expect([...r.trace.inSrc.slice(2 * 4, 2 * 4 + 4)]).toEqual([-1, -1, -1, -1]);
    // (1,0) 试图推向保护区 → 状态 2
    expect(r.trace.outStatus[1 * 4 + 0]).toBe(2);
    // 保护区自身没有任何外发记录
    expect([...r.trace.outW.slice(2 * 4, 2 * 4 + 4)]).toEqual([0, 0, 0, 0]);
  });

  it("蛇形扫描：反向行的误差来自右侧与上方邻居", async () => {
    const columns = 2,
      rows = 2;
    const r = (await diffuse(tonesOf(columns, rows, 0.9), columns, rows, 2, null, NONE))!;
    // 左下单元 (0,1) 应收到来自 (0,0)、(1,0)、(1,1) 的三笔传入
    const srcs = [...r.trace.inSrc.slice(2 * 4, 2 * 4 + 4)].filter((s) => s >= 0);
    expect(new Set(srcs)).toEqual(new Set([0, 1, 3]));
    const sum = [...r.trace.inV.slice(2 * 4, 2 * 4 + 4)].reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(-0.12434, 3);
  });

  it("轨迹自洽：每笔传入都能在来源单元找到对应的外发记录", async () => {
    const columns = 8,
      rows = 8;
    const tones = new Float32Array(columns * rows);
    for (let i = 0; i < tones.length; i++) {
      const v = Math.sin(i * 12.9898) * 43758.5453;
      tones[i] = v - Math.floor(v);
    }
    const raster = rasterize({
      barriers: [
        { id: 1, points: [{ x: 0.5, y: 0 }, { x: 0.5, y: 1 }] },
        { id: 2, points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }] },
      ],
      zones: [{ id: 3, x: 0.1, y: 0.1, width: 0.2, height: 0.2 }],
      crop: FULL,
      columns,
      rows,
    });
    const r = (await diffuse(tones, columns, rows, 5, raster, NONE))!;
    const t = r.trace;
    for (let j = 0; j < columns * rows; j++) {
      for (let s = 0; s < 4; s++) {
        const src = t.inSrc[j * 4 + s]!;
        if (src < 0) continue;
        const amount = t.inV[j * 4 + s]!;
        let found = false;
        for (let so = 0; so < 4; so++) {
          if (
            t.outDst[src * 4 + so] === j &&
            t.outStatus[src * 4 + so] === 0 &&
            Math.abs(t.outV[src * 4 + so]! - amount) < 1e-6
          )
            found = true;
        }
        expect(found, `单元 ${j} 的传入应能在来源 ${src} 找到外发`).toBe(true);
      }
    }
  });

  it("旧任务中止：shouldAbort 为真时返回 null", async () => {
    const tones = tonesOf(2, 64, 0.5);
    const aborted = await diffuse(tones, 2, 64, 10, null, () => true);
    expect(aborted).toBeNull();
    const done = await diffuse(tones, 2, 64, 10, null, NONE);
    expect(done).not.toBeNull();
    expect(done!.levels.length).toBe(128);
  });

  it("渐变输入下连续扩散的颗粒感有界且平滑", async () => {
    const columns = 16,
      rows = 16;
    const tones = new Float32Array(columns * rows);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < columns; x++) tones[y * columns + x] = x / (columns - 1);
    const r = (await diffuse(tones, columns, rows, 10, null, NONE))!;
    expect(r.grain).toBeLessThan(0.2);
    expect(r.speckles).toBe(0);
  });
});
