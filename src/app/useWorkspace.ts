import { reactive, ref, provide, watch } from "vue";
import { createDocument } from "../shared/defaults";
import { studioKey } from "../shared/context";
import { generate } from "../features/mapping";
export function useWorkspace() {
  const doc = reactive(createDocument());
  const busy = ref(false),
    notice = ref("所有处理均在你的浏览器中完成");
  let timer: ReturnType<typeof setTimeout>;
  let taskId = 0;
  function invalidate() {
    doc.revision++;
    busy.value = true;
    clearTimeout(timer);
    const id = ++taskId;
    const revision = doc.revision;
    timer = setTimeout(() => {
      void (async () => {
        try {
          const grid = await generate(doc, () => id !== taskId);
          // 旧任务（例如快速拖动伽马期间发起的）结果直接丢弃，不得覆盖新结果
          if (id !== taskId || revision !== doc.revision) return;
          if (grid) doc.grid = grid;
        } catch (e) {
          if (id === taskId)
            notice.value = e instanceof Error ? e.message : "生成失败";
        } finally {
          if (id === taskId) busy.value = false;
        }
      })();
    }, 60);
  }
  watch(() => doc.settings.background, invalidate);
  provide(studioKey, { doc, busy, notice, invalidate });
  return { doc, busy, notice };
}
