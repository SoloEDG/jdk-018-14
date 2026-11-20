import type { VariantTrace } from "../../../shared/document";
import type { RasterResult } from "./rasterize";

export interface DiffuseResult {
  /** 每个单元的字符色阶（0..levelCount-1） */
  levels: Uint16Array;
  trace: VariantTrace;
  grain: number;
  speckles: number;
  dropped: number;
  blockedEdges: number;
  protectedCells: number;
  sealedCells: number;
}

/** Floyd–Steinberg 权重（蛇形扫描，反向行做水平镜像）；出槽序号即权重序号 */
export const FS_FWD: [number, number, number][] = [
  [1, 0, 7 / 16],
  [-1, 1, 3 / 16],
  [0, 1, 5 / 16],
  [1, 1, 1 / 16],
];
export const FS_REV: [number, number, number][] = [
  [-1, 0, 7 / 16],
  [1, 1, 3 / 16],
  [0, 1, 5 / 16],
  [-1, 1, 1 / 16],
];

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function quantize(v: number, levelCount: number): number {
  if (levelCount < 2) return 0;
  const t = Math.max(0, Math.min(1, v));
  return Math.round(t * (levelCount - 1));
}

/**
 * 蛇形误差扩散。raster 为 null 时是连续扩散（整幅传递）；
 * 否则为分区扩散：屏障边、保护区、隔离单元都会截断误差。
 * 被截断的误差直接丢弃并计入 dropped，不会绕行、不会跨越边界。
 * 每处理 32 行让出一次事件循环，并检查 shouldAbort（旧任务提前放弃）。
 */
export async function diffuse(
  tones: Float32Array,
  columns: number,
  rows: number,
  levelCount: number,
  raster: RasterResult | null,
  shouldAbort: () => boolean,
): Promise<DiffuseResult | null> {
  const n = columns * rows;
  const mode = raster ? raster.mode : new Uint8Array(n);
  const zoneId = raster ? raster.zoneId : new Int16Array(n);
  const blockR = raster ? raster.blockR : new Uint16Array(n);
  const blockD = raster ? raster.blockD : new Uint16Array(n);
  const err = new Float32Array(n);
  const levels = new Uint16Array(n);
  const trace: VariantTrace = {
    mode,
    zoneId,
    inSrc: new Int32Array(n * 4).fill(-1),
    inW: new Float32Array(n * 4),
    inV: new Float32Array(n * 4),
    outDst: new Int32Array(n * 4).fill(-1),
    outW: new Float32Array(n * 4),
    outV: new Float32Array(n * 4),
    outStatus: new Uint8Array(n * 4),
    outLine: new Uint16Array(n * 4),
  };
  let dropped = 0;
  const span = levelCount > 1 ? levelCount - 1 : 1;

  for (let y = 0; y < rows; y++) {
    if (y % 32 === 31) {
      await tick();
      if (shouldAbort()) return null;
    }
    const fwd = (y & 1) === 0;
    const weights = fwd ? FS_FWD : FS_REV;
    for (let xi = 0; xi < columns; xi++) {
      const x = fwd ? xi : columns - 1 - xi;
      const i = y * columns + x;
      if (mode[i] !== 0) {
        // 保护区 / 隔离单元：保持原来的直接映射，既不接收也不外发误差
        levels[i] = quantize(tones[i]!, levelCount);
        continue;
      }
      const v = tones[i]! + err[i]!;
      const lv = quantize(v, levelCount);
      levels[i] = lv;
      const e = levelCount > 1 ? v - lv / span : 0;
      if (e === 0) continue;
      for (let s = 0; s < 4; s++) {
        const [dx, dy, w] = weights[s]!;
        const amount = e * w;
        const o = i * 4 + s;
        trace.outW[o] = w;
        trace.outV[o] = amount;
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || nx >= columns || ny >= rows) {
          trace.outStatus[o] = 3;
          dropped += Math.abs(amount);
          continue;
        }
        const j = ny * columns + nx;
        trace.outDst[o] = j;
        if (mode[j] !== 0) {
          trace.outStatus[o] = 2;
          dropped += Math.abs(amount);
          continue;
        }
        const line = edgeBlock(blockR, blockD, i, x, y, dx, dy, columns);
        if (line !== 0) {
          trace.outStatus[o] = 1;
          trace.outLine[o] = line;
          dropped += Math.abs(amount);
          continue;
        }
        err[j] = err[j]! + amount;
        const base = j * 4;
        for (let slot = 0; slot < 4; slot++) {
          if (trace.inSrc[base + slot] === -1) {
            trace.inSrc[base + slot] = i;
            trace.inW[base + slot] = w;
            trace.inV[base + slot] = amount;
            break;
          }
        }
      }
    }
  }

  // —— 颗粒感：相邻单元量化亮度的平均绝对差；斑点：与全部邻居都差 1.5 阶以上 ——
  let grainSum = 0,
    grainN = 0,
    speckles = 0;
  const q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = levels[i]! / span;
  const step = levelCount > 1 ? (1 / span) * 1.5 : Infinity;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const i = y * columns + x;
      const here = q[i]!;
      let neighbors = 0,
        far = 0;
      if (x + 1 < columns) {
        const d = Math.abs(here - q[i + 1]!);
        grainSum += d;
        grainN++;
        neighbors++;
        if (d > step) far++;
      }
      if (y + 1 < rows) {
        const d = Math.abs(here - q[i + columns]!);
        grainSum += d;
        grainN++;
        neighbors++;
        if (d > step) far++;
      }
      if (x > 0) {
        neighbors++;
        if (Math.abs(here - q[i - 1]!) > step) far++;
      }
      if (y > 0) {
        neighbors++;
        if (Math.abs(here - q[i - columns]!) > step) far++;
      }
      if (neighbors > 0 && far === neighbors) speckles++;
    }
  }

  return {
    levels,
    trace,
    grain: grainN ? grainSum / grainN : 0,
    speckles,
    dropped,
    blockedEdges: raster ? raster.blockedEdges : 0,
    protectedCells: raster ? raster.protectedCells : 0,
    sealedCells: raster ? raster.sealedCells : 0,
  };
}

/**
 * 判断 i → (x+dx, y+dy) 的传递是否被屏障边截断，返回线序号（0=开放）。
 * 斜向传递经过单元角：只要源单元该角相邻的两条边之一被封即视为截断，
 * 防止误差从角点渗漏（保守取舍，与求交规则一致）。
 */
function edgeBlock(
  blockR: Uint16Array,
  blockD: Uint16Array,
  i: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  columns: number,
): number {
  if (dy === 0) return dx > 0 ? blockR[i]! : blockR[i - 1]!;
  if (dx === 0) return blockD[i]!;
  const side = dx > 0 ? blockR[i]! : blockR[i - 1]!;
  return side !== 0 ? side : blockD[i]!;
}
