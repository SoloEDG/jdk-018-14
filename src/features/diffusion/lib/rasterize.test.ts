import { describe, it, expect } from "vitest";
import { rasterize } from "./rasterize";
import type { BarrierLine, Crop, ProtectZone } from "../../../shared/document";

const FULL: Crop = { x: 0, y: 0, width: 1, height: 1 };
let id = 0;
function line(...pts: [number, number][]): BarrierLine {
  return { id: ++id, points: pts.map(([x, y]) => ({ x, y })) };
}
function zone(x: number, y: number, width: number, height: number): ProtectZone {
  return { id: ++id, x, y, width, height };
}
function make(
  barriers: BarrierLine[] = [],
  zones: ProtectZone[] = [],
  crop: Crop = FULL,
  columns = 4,
  rows = 4,
) {
  return rasterize({ barriers, zones, crop, columns, rows });
}

describe("rasterize · 边界求交", () => {
  it("水平线封锁沿途垂直网格线对应的单元右边", () => {
    // 网格坐标 y=0.8，穿过 x=1,2,3 三条竖线 → 第 0 行前三个单元的右边
    const r = make([line([0, 0.2], [1, 0.2])]);
    expect(r.blockR[0]).toBe(1);
    expect(r.blockR[1]).toBe(1);
    expect(r.blockR[2]).toBe(1);
    expect(r.blockedEdges).toBe(3);
    expect([...r.blockD]).toEqual(new Array(16).fill(0));
    expect(r.sealedCells).toBe(0);
  });

  it("恰好压在网格线上的竖线封锁沿途所有单元边（不静默漏线）", () => {
    // 网格坐标 x=2，正好在网格线上
    const r = make([line([0.5, 0], [0.5, 1])]);
    for (let j = 0; j < 4; j++) expect(r.blockR[j * 4 + 1]).toBe(1);
    expect(r.blockedEdges).toBe(4);
  });

  it("恰好压在网格线上的水平线封锁沿途单元下边", () => {
    const r = make([line([0, 0.5], [1, 0.5])]);
    for (let i = 0; i < 4; i++) expect(r.blockD[1 * 4 + i]).toBe(1);
    expect(r.blockedEdges).toBe(4);
  });

  it("线端点落在单元内部（穿过半个单元）→ 该单元整格隔离", () => {
    // 网格坐标 (0.4,0.4)→(1.6,0.4)：跨过 x=1，两端都在单元内部
    const r = make([line([0.1, 0.1], [0.4, 0.1])]);
    expect(r.blockR[0]).toBe(1); // 交点封边
    expect(r.mode[0]).toBe(2); // 起点所在单元隔离
    expect(r.mode[1]).toBe(2); // 终点所在单元隔离
    expect(r.sealedCells).toBe(2);
  });

  it("完全位于一个单元内的短线不会被静默丢弃 → 隔离该单元", () => {
    const r = make([line([0.05, 0.05], [0.1, 0.05])]);
    expect(r.blockedEdges).toBe(0);
    expect(r.mode[0]).toBe(2);
    expect(r.sealedCells).toBe(1);
  });

  it("退化成点的线段按端点规则隔离所在单元", () => {
    const r = make([line([0.15, 0.15], [0.15, 0.15])]);
    expect(r.mode[0]).toBe(2);
  });

  it("完全落在裁剪区外的线计数但不参与生成", () => {
    const crop: Crop = { x: 0.5, y: 0, width: 0.5, height: 1 };
    const r = make([line([0, 0.1], [0.4, 0.1])], [], crop);
    expect(r.outsideLines).toBe(1);
    expect(r.blockedEdges).toBe(0);
  });

  it("改变裁剪后对同一原图坐标重新求交", () => {
    const l = line([0.25, 0.5], [0.75, 0.5]);
    const a = make([l]);
    // 全图：网格 (1,2)→(3,2)，压在 y=2 网格线上 → 第 1 行第 1、2 列的下边
    expect(a.blockD[1 * 4 + 1]).toBe(1);
    expect(a.blockD[1 * 4 + 2]).toBe(1);
    expect(a.blockD[1 * 4 + 0]).toBe(0);
    // 裁剪右半幅：同一条线映射到网格 (0,2)→(2,2) → 第 1 行第 0、1 列的下边
    const b = make([l], [], { x: 0.5, y: 0, width: 0.5, height: 1 });
    expect(b.blockD[1 * 4 + 0]).toBe(1);
    expect(b.blockD[1 * 4 + 1]).toBe(1);
    expect(b.blockD[1 * 4 + 2]).toBe(0);
  });

  it("改变字符密度后求交结果随网格缩放", () => {
    const l = line([0, 0.5], [1, 0.5]);
    expect(make([l], [], FULL, 4, 4).blockedEdges).toBe(4);
    expect(make([l], [], FULL, 8, 8).blockedEdges).toBe(8);
  });

  it("对角线经过角点时确定性封锁相邻边（含终点角点）", () => {
    // 网格 (0,0)→(2,2)，经过角点 (1,1)，终点恰在角点 (2,2)
    const r = make([line([0, 0], [0.5, 0.5])]);
    expect(r.blockR[1 * 4 + 0]).toBe(1); // 角点 (1,1) 向下取格
    expect(r.blockD[0 * 4 + 1]).toBe(1); // 角点 (1,1) 向右取格
    expect(r.blockR[2 * 4 + 1]).toBe(1); // 终点角点 (2,2) 向下取格
    expect(r.blockD[1 * 4 + 2]).toBe(1); // 终点角点 (2,2) 向右取格
    expect(r.blockedEdges).toBe(4);
  });

  it("保护区按面积重叠保护单元，完全在外则计数", () => {
    const r = make([], [zone(0.1, 0.1, 0.15, 0.15)]);
    // 网格 [0.4,1.0]×[0.4,1.0]：只与单元 (0,0) 有面积重叠
    expect(r.mode[0]).toBe(1);
    expect(r.zoneId[0]).toBe(1);
    expect(r.protectedCells).toBe(1);
    const out = make([], [zone(1.2, 0, 0.1, 0.1)]);
    expect(out.outsideZones).toBe(1);
    expect(out.protectedCells).toBe(0);
  });

  it("保护区与屏障端点重叠时保护优先，不降级为隔离", () => {
    const r = make([line([0.15, 0.15], [0.3, 0.3])], [zone(0, 0, 0.25, 0.25)]);
    expect(r.mode[0]).toBe(1); // 仍是保护区
  });
});
