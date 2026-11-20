import type { BarrierLine, Crop, ProtectZone } from "../../../shared/document";

/**
 * 把原图坐标下的边界（屏障线 / 保护区）求交到当前字符网格。
 * 每次裁剪或字符密度变化后由 generate 重新调用。
 *
 * 求交规则（全部在连续浮点网格坐标下进行，不做坐标四舍五入）：
 * 1. 线段与单元之间的网格线求交，交点所在的单元边被封锁，误差不得跨越；
 * 2. 线段端点落在某个单元内部（线只穿过半个单元）时，该单元被整格隔离，
 *    误差不进不出 —— 宁可多挡一格，也不把端点悄悄吸附到网格线上、更不漏挡；
 * 3. 完全位于某个单元内部的短线同理隔离该单元，不会被静默丢弃；
 * 4. 恰好压在网格线上的线段，封锁它沿途覆盖的所有单元边；
 * 5. 完全落在裁剪区外的边界不参与本次生成，但会计数并展示（outsideLines /
 *    outsideZones），不会被静默忽略；
 * 6. 保护区按“碰到即保护”处理：与单元面积有重叠即保护该单元，
 *    最多向外多保护不到一格。
 */
export interface RasterInput {
  barriers: BarrierLine[];
  zones: ProtectZone[];
  crop: Crop;
  columns: number;
  rows: number;
}
export interface RasterResult {
  /** 0=参与扩散 1=保护区 2=被屏障端点隔离 */
  mode: Uint8Array;
  /** 保护区序号+1（0=不在保护区） */
  zoneId: Int16Array;
  /** 单元右侧边被哪条屏障线封锁（线序号+1，0=开放） */
  blockR: Uint16Array;
  /** 单元下侧边被哪条屏障线封锁（线序号+1，0=开放） */
  blockD: Uint16Array;
  protectedCells: number;
  sealedCells: number;
  blockedEdges: number;
  outsideLines: number;
  outsideZones: number;
}

const EPS = 1e-9;

interface Seg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 原始端点是否在裁剪后仍保留（裁剪产生的新端点不触发整格隔离） */
  headKept: boolean;
  tailKept: boolean;
}

/** Liang–Barsky：把线段裁剪到 [0,columns]×[0,rows]，返回 null 表示完全在外 */
function clipSegment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  columns: number,
  rows: number,
): Seg | null {
  const dx = x1 - x0,
    dy = y1 - y0;
  let t0 = 0,
    t1 = 1;
  const checks: [number, number][] = [
    [-dx, x0],
    [dx, columns - x0],
    [-dy, y0],
    [dy, rows - y0],
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < EPS) {
      if (q < 0) return null;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  return {
    x0: x0 + t0 * dx,
    y0: y0 + t0 * dy,
    x1: x0 + t1 * dx,
    y1: y0 + t1 * dy,
    headKept: t0 < EPS,
    tailKept: t1 > 1 - EPS,
  };
}

function frac(v: number): number {
  return v - Math.floor(v);
}

export function rasterize(input: RasterInput): RasterResult {
  const { barriers, zones, crop, columns, rows } = input;
  const n = columns * rows;
  const mode = new Uint8Array(n);
  const zoneId = new Int16Array(n);
  const blockR = new Uint16Array(n);
  const blockD = new Uint16Array(n);
  let protectedCells = 0,
    sealedCells = 0,
    blockedEdges = 0,
    outsideLines = 0,
    outsideZones = 0;

  const gx = (x: number) => ((x - crop.x) / crop.width) * columns;
  const gy = (y: number) => ((y - crop.y) / crop.height) * rows;

  // —— 保护区：碰到即保护（与单元面积有重叠即保护） ——
  zones.forEach((z, zi) => {
    const x0 = Math.max(0, gx(z.x)),
      x1 = Math.min(columns, gx(z.x + z.width));
    const y0 = Math.max(0, gy(z.y)),
      y1 = Math.min(rows, gy(z.y + z.height));
    if (x1 - x0 < EPS || y1 - y0 < EPS) {
      outsideZones++;
      return;
    }
    for (let j = Math.max(0, Math.floor(y0)); j <= Math.min(rows - 1, Math.ceil(y1) - 1); j++) {
      if (j + 1 <= y0 + EPS || j >= y1 - EPS) continue;
      for (let i = Math.max(0, Math.floor(x0)); i <= Math.min(columns - 1, Math.ceil(x1) - 1); i++) {
        if (i + 1 <= x0 + EPS || i >= x1 - EPS) continue;
        const idx = j * columns + i;
        if (mode[idx] !== 1) {
          mode[idx] = 1;
          zoneId[idx] = zi + 1;
          protectedCells++;
        }
      }
    }
  });

  const blockEdge = (arr: Uint16Array, idx: number, line: number) => {
    if (arr[idx] === 0) {
      arr[idx] = line;
      blockedEdges++;
    }
  };
  /** 端点落入单元内部 → 整格隔离（规则 2/3）；保护区优先，不降级 */
  const sealAt = (px: number, py: number) => {
    if (px < EPS || px > columns - EPS || py < EPS || py > rows - EPS) return;
    const fx = frac(px),
      fy = frac(py);
    if (fx < EPS || fx > 1 - EPS || fy < EPS || fy > 1 - EPS) return; // 在网格线上：由边的封锁精确处理
    const idx = Math.floor(py) * columns + Math.floor(px);
    if (mode[idx] === 0) {
      mode[idx] = 2;
      sealedCells++;
    }
  };

  barriers.forEach((line, li) => {
    const id = li + 1;
    let anyInside = false;
    const pts = line.points;
    for (let s = 0; s + 1 < pts.length; s++) {
      const a = pts[s]!,
        b = pts[s + 1]!;
      const seg = clipSegment(gx(a.x), gy(a.y), gx(b.x), gy(b.y), columns, rows);
      if (!seg) continue;
      anyInside = true;
      cutSegment(seg, id);
    }
    if (!anyInside) outsideLines++;
  });

  function cutSegment(seg: Seg, id: number) {
    const { x0, y0, x1, y1 } = seg;
    const dx = x1 - x0,
      dy = y1 - y0;
    if (dx * dx + dy * dy < EPS) {
      // 退化成一个点：按端点规则隔离所在单元
      if (seg.headKept || seg.tailKept) sealAt(x0, y0);
      return;
    }
    // 规则 4：恰好压在网格线上的水平 / 垂直线段
    if (Math.abs(dy) < EPS && Math.abs(frac(y0)) < EPS) {
      const h = Math.round(y0);
      if (h >= 1 && h <= rows - 1) {
        const a = Math.max(0, Math.min(x0, x1)),
          b = Math.min(columns, Math.max(x0, x1));
        for (let i = Math.floor(a); i <= Math.ceil(b) - 1; i++) {
          if (i + 1 <= a + EPS || i >= b - EPS) continue;
          if (i >= 0 && i < columns) blockEdge(blockD, (h - 1) * columns + i, id);
        }
      }
      return;
    }
    if (Math.abs(dx) < EPS && Math.abs(frac(x0)) < EPS) {
      const k = Math.round(x0);
      if (k >= 1 && k <= columns - 1) {
        const a = Math.max(0, Math.min(y0, y1)),
          b = Math.min(rows, Math.max(y0, y1));
        for (let j = Math.floor(a); j <= Math.ceil(b) - 1; j++) {
          if (j + 1 <= a + EPS || j >= b - EPS) continue;
          if (j >= 0 && j < rows) blockEdge(blockR, j * columns + (k - 1), id);
        }
      }
      return;
    }
    // 规则 1：与垂直网格线 x=k 求交 → 封锁 (k-1, row) 的右边
    if (Math.abs(dx) > EPS) {
      const lo = Math.min(x0, x1),
        hi = Math.max(x0, x1);
      for (let k = Math.ceil(lo - EPS); k <= Math.floor(hi + EPS); k++) {
        if (k < 1 || k > columns - 1) continue;
        const t = (k - x0) / dx;
        if (t < -EPS || t > 1 + EPS) continue;
        const yc = y0 + Math.min(1, Math.max(0, t)) * dy;
        if (yc < -EPS || yc > rows + EPS) continue;
        // 交点恰好落在水平网格线上（角点）时向下取格，确定性规则
        const row = Math.min(rows - 1, Math.max(0, Math.floor(yc + EPS)));
        blockEdge(blockR, row * columns + (k - 1), id);
      }
    }
    // 与水平网格线 y=h 求交 → 封锁 (col, h-1) 的下边
    if (Math.abs(dy) > EPS) {
      const lo = Math.min(y0, y1),
        hi = Math.max(y0, y1);
      for (let h = Math.ceil(lo - EPS); h <= Math.floor(hi + EPS); h++) {
        if (h < 1 || h > rows - 1) continue;
        const t = (h - y0) / dy;
        if (t < -EPS || t > 1 + EPS) continue;
        const xc = x0 + Math.min(1, Math.max(0, t)) * dx;
        if (xc < -EPS || xc > columns + EPS) continue;
        const col = Math.min(columns - 1, Math.max(0, Math.floor(xc + EPS)));
        blockEdge(blockD, (h - 1) * columns + col, id);
      }
    }
    // 规则 2：保留下来的原始端点若落在单元内部 → 整格隔离
    if (seg.headKept) sealAt(x0, y0);
    if (seg.tailKept) sealAt(x1, y1);
  }

  return {
    mode,
    zoneId,
    blockR,
    blockD,
    protectedCells,
    sealedCells,
    blockedEdges,
    outsideLines,
    outsideZones,
  };
}
