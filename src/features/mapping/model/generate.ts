import type { StudioDocument, Grid, Cell, DiffusionVariant } from "../../../shared/document";
import { glyphs } from "../lib/charsets";
import { gridSize } from "../lib/gridSize";
import { sample } from "../lib/sample";
import { tone, luminance } from "../lib/tone";
import { rasterize } from "../../diffusion/lib/rasterize";
import { diffuse, type DiffuseResult } from "../../diffusion/lib/diffuse";

/**
 * 生成字符网格。异步执行：误差扩散按行分片让出事件循环，
 * isStale() 返回 true 时（已有更新的任务）立即放弃，返回 null，
 * 保证快速调整伽马等参数时旧任务不会覆盖新结果。
 */
export async function generate(
  doc: StudioDocument,
  isStale: () => boolean = () => false,
): Promise<Grid | null> {
  if (!doc.asset) return null;
  // 任务开始时快照输入：边界数组在编辑器中只做不可变替换，引用即快照
  const revision = doc.revision;
  const s = { ...doc.settings };
  const crop = { ...doc.crop };
  const barriers = doc.barriers;
  const zones = doc.zones;
  const asset = doc.asset;
  const size = gridSize(
    asset.width * crop.width,
    asset.height * crop.height,
    s.columns,
  );
  const pixels = sample(asset, crop, size.columns, size.rows, s.background);
  const chars = glyphs(s.charset, s.custom);
  const n = size.columns * size.rows;
  const tones = new Float32Array(n);
  const colors = new Array<string>(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = pixels[p]!,
      g = pixels[p + 1]!,
      b = pixels[p + 2]!;
    tones[i] = tone(luminance(r, g, b), s.contrast, s.gamma, s.invert);
    colors[i] = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  if (isStale()) return null;

  const buildCells = (levels: Uint16Array | null): Cell[] => {
    const cells = new Array<Cell>(n);
    for (let i = 0; i < n; i++) {
      const lv = levels ? levels[i]! : Math.round(tones[i]! * (chars.length - 1));
      cells[i] = { glyph: chars[lv]!, color: colors[i]! };
    }
    return cells;
  };

  if (s.engine === "direct") {
    return { ...size, cells: buildCells(null), revision, tones };
  }

  const wantZoned = s.compare || s.scope === "zoned";
  const wantContinuous = s.compare || s.scope === "continuous";
  // 边界按原图坐标保存，此处依据当前裁剪与密度重新求交
  const raster = rasterize({ barriers, zones, crop, columns: size.columns, rows: size.rows });
  const toVariant = (d: DiffuseResult): DiffusionVariant => ({
    cells: buildCells(d.levels),
    levels: d.levels,
    levelCount: chars.length,
    grain: d.grain,
    speckles: d.speckles,
    dropped: d.dropped,
    blockedEdges: d.blockedEdges,
    protectedCells: d.protectedCells,
    sealedCells: d.sealedCells,
    trace: d.trace,
  });
  const zoned = wantZoned
    ? await diffuse(tones, size.columns, size.rows, chars.length, raster, isStale)
    : null;
  if (wantZoned && !zoned) return null;
  const continuous = wantContinuous
    ? await diffuse(tones, size.columns, size.rows, chars.length, null, isStale)
    : null;
  if (wantContinuous && !continuous) return null;
  if (isStale()) return null;

  const zv = zoned ? toVariant(zoned) : undefined;
  const cv = continuous ? toVariant(continuous) : undefined;
  const active = s.scope === "continuous" && cv ? "continuous" : "zoned";
  const current = active === "zoned" ? zv : cv;
  if (!current) return null;
  // 字符画布与纯文本都读取同一个 grid.cells —— 来自同一次传播任务
  return {
    ...size,
    cells: current.cells,
    revision,
    tones,
    diffusion: {
      active,
      zoned: zv,
      continuous: cv,
      outsideLines: raster.outsideLines,
      outsideZones: raster.outsideZones,
    },
  };
}
