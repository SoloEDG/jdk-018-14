export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Asset {
  name: string;
  url: string;
  width: number;
  height: number;
  image: HTMLImageElement;
}
export type Engine = "direct" | "diffusion";
export type Scope = "zoned" | "continuous";
export interface Settings {
  columns: number;
  charset: string;
  custom: string;
  contrast: number;
  gamma: number;
  invert: boolean;
  color: boolean;
  background: string;
  engine: Engine;
  scope: Scope;
  compare: boolean;
}
/** 禁止误差跨越的线，坐标为原图归一化坐标（0..1，相对完整原图） */
export interface BarrierLine {
  id: number;
  points: { x: number; y: number }[];
}
/** 文字保护区（区内保持直接映射），坐标为原图归一化坐标 */
export interface ProtectZone {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Cell {
  glyph: string;
  color: string;
}
/** 每个单元的误差传播轨迹：4 个入槽 + 4 个出槽（Floyd–Steinberg 每格最多 4 进 4 出） */
export interface VariantTrace {
  /** 0=参与扩散 1=保护区（直接映射） 2=被屏障线端点隔离 */
  mode: Uint8Array;
  /** 保护区序号+1（0=不在保护区），对应生成时 doc.zones 的顺序 */
  zoneId: Int16Array;
  inSrc: Int32Array;
  inW: Float32Array;
  inV: Float32Array;
  outDst: Int32Array;
  outW: Float32Array;
  outV: Float32Array;
  /** 0=已传递 1=被屏障线截断 2=目标是保护/隔离单元 3=网格边缘 */
  outStatus: Uint8Array;
  /** 截断该传播的屏障线序号+1（0=无），对应生成时 doc.barriers 的顺序 */
  outLine: Uint16Array;
}
export interface DiffusionVariant {
  cells: Cell[];
  levels: Uint16Array;
  /** 字符色阶总数（生成时的字符集大小） */
  levelCount: number;
  /** 颗粒感：相邻单元量化亮度的平均绝对差（0..1，越小越平滑） */
  grain: number;
  /** 斑点数：与全部相邻单元都相差超过 1.5 个色阶的单元数 */
  speckles: number;
  /** 在边界处被丢弃的误差总量（|误差| 求和） */
  dropped: number;
  blockedEdges: number;
  protectedCells: number;
  sealedCells: number;
  trace: VariantTrace;
}
export interface DiffusionResult {
  active: Scope;
  zoned?: DiffusionVariant;
  continuous?: DiffusionVariant;
  /** 完全落在裁剪区外、未参与本次生成的边界数量 */
  outsideLines: number;
  outsideZones: number;
}
export interface Grid {
  columns: number;
  rows: number;
  cells: Cell[];
  revision: number;
  tones?: Float32Array;
  diffusion?: DiffusionResult;
}
export interface StudioDocument {
  asset: Asset | null;
  crop: Crop;
  settings: Settings;
  barriers: BarrierLine[];
  zones: ProtectZone[];
  grid: Grid | null;
  revision: number;
}
