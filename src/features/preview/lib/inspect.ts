import type { Grid } from "../../../shared/document";
import { FS_FWD, FS_REV } from "../../diffusion/lib/diffuse";

export interface FlowIn {
  from: number;
  fx: number;
  fy: number;
  dx: number;
  dy: number;
  weight: number;
  amount: number;
}
export interface FlowOut {
  to: number;
  tx: number;
  ty: number;
  dx: number;
  dy: number;
  weight: number;
  amount: number;
  /** 0=已传递 1=被屏障线截断 2=目标是保护/隔离单元 3=网格边缘 */
  status: number;
  line: number;
}
export interface Inspection {
  index: number;
  x: number;
  y: number;
  glyph: string;
  color: string;
  tone: number | null;
  level: number | null;
  levelCount: number;
  /** -1=直接映射引擎 0=扩散 1=保护区 2=隔离 */
  mode: number;
  zone: number;
  received: FlowIn[];
  sent: FlowOut[];
  droppedHere: number;
}

export function dirLabel(dx: number, dy: number): string {
  const v = dy < 0 ? "上" : dy > 0 ? "下" : "";
  const h = dx < 0 ? "左" : dx > 0 ? "右" : "";
  return h + v || "自身";
}
export function weightLabel(w: number): string {
  return `${Math.round(w * 16)}/16`;
}
export function statusLabel(out: FlowOut): string {
  if (out.status === 1) return `被屏障线 #${out.line} 截断`;
  if (out.status === 2) return "目标是保护/隔离单元";
  if (out.status === 3) return "网格边缘";
  return "已传递";
}

export function inspectCell(grid: Grid, index: number): Inspection | null {
  if (index < 0 || index >= grid.cells.length) return null;
  const columns = grid.columns;
  const x = index % columns,
    y = Math.floor(index / columns);
  const cell = grid.cells[index]!;
  const d = grid.diffusion;
  const variant = d ? (d.active === "zoned" ? d.zoned : d.continuous) : undefined;
  const trace = variant?.trace;
  const received: FlowIn[] = [];
  const sent: FlowOut[] = [];
  let droppedHere = 0;
  let mode = -1,
    zone = 0,
    level: number | null = null;
  if (trace) {
    mode = trace.mode[index]!;
    zone = trace.zoneId[index]!;
    level = variant!.levels[index]!;
    const weights = (y & 1) === 0 ? FS_FWD : FS_REV;
    for (let s = 0; s < 4; s++) {
      const src = trace.inSrc[index * 4 + s]!;
      if (src >= 0) {
        const fx = src % columns,
          fy = Math.floor(src / columns);
        received.push({
          from: src,
          fx,
          fy,
          // 来源相对本单元的方位（用于“误差从何而来”的方位标注）
          dx: fx - x,
          dy: fy - y,
          weight: trace.inW[index * 4 + s]!,
          amount: trace.inV[index * 4 + s]!,
        });
      }
      const status = trace.outStatus[index * 4 + s]!;
      const w = trace.outW[index * 4 + s]!;
      if (w === 0 && status === 0) continue;
      const to = trace.outDst[index * 4 + s]!;
      const amount = trace.outV[index * 4 + s]!;
      if (status !== 0) droppedHere += Math.abs(amount);
      const [dx, dy] = weights[s]!;
      sent.push({
        to,
        tx: to >= 0 ? to % columns : -1,
        ty: to >= 0 ? Math.floor(to / columns) : -1,
        dx,
        dy,
        weight: w,
        amount,
        status,
        line: trace.outLine[index * 4 + s]!,
      });
    }
  }
  return {
    index,
    x,
    y,
    glyph: cell.glyph,
    color: cell.color,
    tone: grid.tones ? grid.tones[index]! : null,
    level,
    levelCount: variant ? variant.levelCount : 0,
    mode,
    zone,
    received,
    sent,
    droppedHere,
  };
}
