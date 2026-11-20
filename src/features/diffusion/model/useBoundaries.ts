import { ref } from "vue";
import { useStudio } from "../../../shared/useStudio";
import type { BarrierLine, ProtectZone } from "../../../shared/document";

export type BoundaryTool = "line" | "zone" | "select";
export interface Selection {
  kind: "line" | "zone";
  id: number;
}

let nextId = 1;

/** 边界绘制：坐标一律以原图归一化坐标（0..1）保存，与裁剪无关 */
export function useBoundaries() {
  const { doc, invalidate } = useStudio();
  const tool = ref<BoundaryTool>("line");
  const draftLine = ref<{ x: number; y: number }[] | null>(null);
  const draftZone = ref<ProtectZone | null>(null);
  const selected = ref<Selection | null>(null);

  function point(e: PointerEvent) {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)),
      y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)),
    };
  }
  function down(e: PointerEvent) {
    if (tool.value === "select") {
      selected.value = null;
      return;
    }
    const p = point(e);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (tool.value === "line") draftLine.value = [p, p];
    else draftZone.value = { id: 0, x: p.x, y: p.y, width: 0, height: 0 };
  }
  function move(e: PointerEvent) {
    const p = point(e);
    if (draftLine.value) draftLine.value = [draftLine.value[0]!, p];
    else if (draftZone.value) {
      const z = draftZone.value;
      draftZone.value = {
        id: 0,
        x: Math.min(z.x, p.x),
        y: Math.min(z.y, p.y),
        width: Math.abs(p.x - z.x),
        height: Math.abs(p.y - z.y),
      };
    }
  }
  function up() {
    if (draftLine.value) {
      const [a, b] = draftLine.value;
      draftLine.value = null;
      // 过短的拖动视为误触，忽略
      if (a && b && Math.hypot(b.x - a.x, b.y - a.y) > 0.004) {
        const line: BarrierLine = { id: nextId++, points: [a, b] };
        doc.barriers = [...doc.barriers, line];
        invalidate();
      }
    } else if (draftZone.value) {
      const z = draftZone.value;
      draftZone.value = null;
      if (z.width > 0.004 && z.height > 0.004) {
        doc.zones = [...doc.zones, { ...z, id: nextId++ }];
        invalidate();
      }
    }
  }
  function cancel() {
    draftLine.value = null;
    draftZone.value = null;
  }
  function select(kind: "line" | "zone", id: number) {
    if (tool.value === "select") selected.value = { kind, id };
  }
  function remove(sel: Selection) {
    if (sel.kind === "line") removeLine(sel.id);
    else removeZone(sel.id);
  }
  function removeLine(id: number) {
    doc.barriers = doc.barriers.filter((l) => l.id !== id);
    if (selected.value?.kind === "line" && selected.value.id === id)
      selected.value = null;
    invalidate();
  }
  function removeZone(id: number) {
    doc.zones = doc.zones.filter((z) => z.id !== id);
    if (selected.value?.kind === "zone" && selected.value.id === id)
      selected.value = null;
    invalidate();
  }
  function clearAll() {
    if (!doc.barriers.length && !doc.zones.length) return;
    doc.barriers = [];
    doc.zones = [];
    selected.value = null;
    invalidate();
  }
  return {
    doc,
    tool,
    draftLine,
    draftZone,
    selected,
    down,
    move,
    up,
    cancel,
    select,
    remove,
    removeLine,
    removeZone,
    clearAll,
  };
}
