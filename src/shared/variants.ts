import type { Scope, StudioDocument } from "./document";
/**
 * 切换当前展示的扩散变体。
 * 两个变体来自同一次传播任务，若都已在 grid 中则原地切换（不重新生成），
 * 返回 true；若目标变体不存在（例如刚打开对比开关），返回 false，调用方应 invalidate()。
 */
export function applyScope(doc: StudioDocument, scope: Scope): boolean {
  doc.settings.scope = scope;
  const g = doc.grid;
  const d = g?.diffusion;
  if (!g || !d) return false;
  if (d.active === scope) return true;
  const v = scope === "zoned" ? d.zoned : d.continuous;
  if (!v) return false;
  doc.grid = { ...g, cells: v.cells, diffusion: { ...d, active: scope } };
  return true;
}
