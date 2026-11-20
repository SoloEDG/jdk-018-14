import { ref, computed } from "vue";
import { useStudio } from "../../../shared/useStudio";
import { applyScope } from "../../../shared/variants";
import type { Scope } from "../../../shared/document";
import { inspectCell } from "../lib/inspect";
export function usePreview() {
  const { doc, busy, invalidate } = useStudio();
  const mode = ref<"art" | "text">("art");
  const zoom = ref(100);
  const overlay = ref(true);
  const inspectIdx = ref<number | null>(null);
  const count = computed(() => doc.grid?.cells.length.toLocaleString() ?? "0");
  const diffusion = computed(() => doc.grid?.diffusion ?? null);
  const activeVariant = computed(() => {
    const d = diffusion.value;
    if (!d) return null;
    return (d.active === "zoned" ? d.zoned : d.continuous) ?? null;
  });
  const inspection = computed(() =>
    inspectIdx.value !== null && doc.grid
      ? inspectCell(doc.grid, inspectIdx.value)
      : null,
  );
  function setScope(scope: Scope) {
    // 变体已在当前任务中产出的就原地切换；没有则重新生成
    if (!applyScope(doc, scope)) invalidate();
  }
  function inspectAt(index: number | null) {
    inspectIdx.value = index;
  }
  return {
    doc,
    busy,
    mode,
    zoom,
    overlay,
    count,
    diffusion,
    activeVariant,
    inspection,
    inspectIdx,
    setScope,
    inspectAt,
  };
}
