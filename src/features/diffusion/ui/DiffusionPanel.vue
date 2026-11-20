<script setup lang="ts">
import { computed } from "vue";
import { Route, Slash, BoxSelect, MousePointer2, Trash2 } from "lucide-vue-next";
import { useStudio } from "../../../shared/useStudio";
import { applyScope } from "../../../shared/variants";
import { useBoundaries } from "../model/useBoundaries";
import BoundaryEditor from "./BoundaryEditor.vue";

const { doc, invalidate } = useStudio();
const b = useBoundaries();

const stats = computed(() => {
  const d = doc.grid?.diffusion;
  if (!d) return null;
  const v = d.active === "zoned" ? d.zoned : d.continuous;
  return { d, v };
});

function setScope(scope: "zoned" | "continuous") {
  // 两个变体都已生成时原地切换（同一任务），否则重新生成
  if (!applyScope(doc, scope)) invalidate();
}
</script>
<template>
  <section class="panel">
    <div class="section-title"><span>04 / DIFFUSION</span><Route :size="15" /></div>
    <label class="toggle-row"
      ><span>误差扩散（减少渐变色带）</span
      ><input
        aria-label="误差扩散"
        type="checkbox"
        :checked="doc.settings.engine === 'diffusion'"
        @change="
          doc.settings.engine = ($event.target as HTMLInputElement).checked
            ? 'diffusion'
            : 'direct';
          invalidate();
        "
    /></label>
    <template v-if="doc.settings.engine === 'diffusion'">
      <label class="field"
        >扩散范围
        <select
          aria-label="扩散范围"
          :value="doc.settings.scope"
          @change="setScope(($event.target as HTMLSelectElement).value as 'zoned' | 'continuous')"
        >
          <option value="zoned">分区扩散 · 遵守边界</option>
          <option value="continuous">连续扩散 · 整幅传递</option>
        </select>
      </label>
      <label class="toggle-row"
        ><span>对比两种扩散的颗粒感</span
        ><input
          aria-label="对比扩散"
          type="checkbox"
          v-model="doc.settings.compare"
          @change="invalidate"
      /></label>
      <div class="tool-row">
        <button
          class="tool"
          :class="{ active: b.tool.value === 'line' }"
          @click="b.tool.value = 'line'"
        >
          <Slash :size="13" /> 屏障线</button
        ><button
          class="tool"
          :class="{ active: b.tool.value === 'zone' }"
          @click="b.tool.value = 'zone'"
        >
          <BoxSelect :size="13" /> 保护区</button
        ><button
          class="tool"
          :class="{ active: b.tool.value === 'select' }"
          @click="b.tool.value = 'select'"
        >
          <MousePointer2 :size="13" /> 选择</button
        ><button
          class="icon-button"
          aria-label="清空边界"
          title="清空全部边界"
          @click="b.clearAll"
        >
          <Trash2 :size="13" />
        </button>
      </div>
      <BoundaryEditor
        v-if="doc.asset"
        :asset="doc.asset"
        :crop="doc.crop"
        :barriers="doc.barriers"
        :zones="doc.zones"
        :tool="b.tool.value"
        :draft-line="b.draftLine.value"
        :draft-zone="b.draftZone.value"
        :selected="b.selected.value"
        @down="b.down"
        @move="b.move"
        @up="b.up"
        @cancel="b.cancel"
        @select="b.select"
      />
      <small v-else class="muted">载入图片后可在原图上绘制边界</small>
      <div v-if="doc.barriers.length || doc.zones.length" class="boundary-list">
        <div v-for="(l, i) in doc.barriers" :key="l.id" class="boundary-item">
          <span class="mono">#{{ i + 1 }} 屏障线</span>
          <button
            class="icon-button"
            :aria-label="`删除屏障线 ${i + 1}`"
            @click="b.removeLine(l.id)"
          >
            <Trash2 :size="12" />
          </button>
        </div>
        <div v-for="(z, i) in doc.zones" :key="z.id" class="boundary-item">
          <span class="mono">区{{ i + 1 }} 保护区 · 直接映射</span>
          <button
            class="icon-button"
            :aria-label="`删除保护区 ${i + 1}`"
            @click="b.removeZone(z.id)"
          >
            <Trash2 :size="12" />
          </button>
        </div>
        <button
          v-if="b.selected.value"
          class="secondary danger"
          @click="b.remove(b.selected.value)"
        >
          删除所选
        </button>
      </div>
      <small v-if="stats?.d && (stats.d.outsideLines || stats.d.outsideZones)" class="mono muted">
        裁剪外未参与：线 {{ stats.d.outsideLines }} · 区 {{ stats.d.outsideZones }}
      </small>
      <small v-if="stats?.v" class="mono muted">
        本次生成：阻挡边 {{ stats.v.blockedEdges }} · 保护单元
        {{ stats.v.protectedCells }} · 隔离单元 {{ stats.v.sealedCells }} · 截断误差
        {{ stats.v.dropped.toFixed(3) }}
      </small>
      <small class="rules">
        求交规则：线段在连续坐标下与网格求交，不做四舍五入；交点所在单元边被封锁；
        线端点落在单元内部时该单元整格隔离（宁可多挡一格，不漏挡）；压在网格线上的线封锁沿途单元边；
        保护区内保持直接映射，误差不进不出。
      </small>
    </template>
    <small v-else class="muted"
      >当前为逐格直接映射。开启误差扩散后，可在原图上绘制屏障线与文字保护区。</small
    >
  </section>
</template>
