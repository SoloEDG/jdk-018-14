<script setup lang="ts">
import { computed } from "vue";
import { Code2, Scan, Minus, Plus, Layers } from "lucide-vue-next";
import { usePreview } from "../model/usePreview";
import { gridRows } from "../lib/rows";
import ArtCanvas from "./ArtCanvas.vue";
import OverlayCanvas from "./OverlayCanvas.vue";
import CellInspector from "./CellInspector.vue";
const p = usePreview();
const text = computed(() =>
  p.doc.grid ? gridRows(p.doc.grid).join("\n") : "",
);
const wrapStyle = computed(() => {
  const g = p.doc.grid;
  if (!g) return {};
  return {
    width: (g.columns * 8 * p.zoom.value) / 100 + "px",
    height: (g.rows * 16 * p.zoom.value) / 100 + "px",
  };
});
function onArtClick(e: MouseEvent) {
  const g = p.doc.grid;
  if (!g) return;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const x = Math.floor(((e.clientX - rect.left) / rect.width) * g.columns);
  const y = Math.floor(((e.clientY - rect.top) / rect.height) * g.rows);
  if (x < 0 || x >= g.columns || y < 0 || y >= g.rows) return;
  const idx = y * g.columns + x;
  p.inspectAt(p.inspectIdx.value === idx ? null : idx);
}
function grain(v: number): string {
  return v.toFixed(4);
}
</script>
<template>
  <main class="workspace">
    <div class="preview-toolbar">
      <div class="tabs">
        <button
          :class="{ active: p.mode.value === 'art' }"
          @click="p.mode.value = 'art'"
        >
          <Scan :size="14" /> 字符预览</button
        ><button
          :class="{ active: p.mode.value === 'text' }"
          @click="p.mode.value = 'text'"
        >
          <Code2 :size="14" /> 纯文本
        </button>
      </div>
      <div class="toolbar-right">
        <label v-if="p.diffusion.value" class="color-toggle"
          ><Layers :size="12" /> 边界覆盖层<input
            aria-label="边界覆盖层"
            type="checkbox"
            v-model="p.overlay.value"
        /></label>
        <label class="color-toggle"
          ><span class="color-dot" /> 彩色<input
            aria-label="彩色预览"
            type="checkbox"
            v-model="p.doc.settings.color"
        /></label>
      </div>
    </div>
    <div
      v-if="p.diffusion.value?.continuous && p.diffusion.value?.zoned"
      class="compare-bar"
    >
      <div class="tabs">
        <button
          :class="{ active: p.diffusion.value.active === 'zoned' }"
          @click="p.setScope('zoned')"
        >
          分区扩散</button
        ><button
          :class="{ active: p.diffusion.value.active === 'continuous' }"
          @click="p.setScope('continuous')"
        >
          连续扩散
        </button>
      </div>
      <span class="mono muted compare-metrics">
        颗粒感 分区 {{ grain(p.diffusion.value.zoned!.grain) }} · 连续
        {{ grain(p.diffusion.value.continuous.grain) }} ｜ 斑点
        {{ p.diffusion.value.zoned!.speckles }} /
        {{ p.diffusion.value.continuous.speckles }} ｜ 同一传播任务
      </span>
    </div>
    <div class="art-stage">
      <div class="stage-label">OUTPUT / LIVE RENDER <span>●</span></div>
      <div class="art-scroll">
        <div
          v-if="p.doc.grid && p.mode.value === 'art'"
          class="art-wrap"
          :style="wrapStyle"
          @click="onArtClick"
        >
          <ArtCanvas
            :grid="p.doc.grid"
            :color="p.doc.settings.color"
            :background="p.doc.settings.background"
            :zoom="p.zoom.value"
          />
          <OverlayCanvas
            v-if="p.diffusion.value && (p.overlay.value || p.inspection.value)"
            :grid="p.doc.grid"
            :crop="p.doc.crop"
            :barriers="p.doc.barriers"
            :zones="p.doc.zones"
            :show-boundaries="p.overlay.value"
            :inspection="p.inspection.value"
            :zoom="p.zoom.value"
          />
        </div>
        <pre
          v-else-if="p.doc.grid"
          data-testid="text-preview"
          :style="{
            fontSize: (14 * p.zoom.value) / 100 + 'px',
            lineHeight: (16 * p.zoom.value) / 100 + 'px',
          }"
          >{{ text }}</pre
        >
        <span v-else>正在准备字符画…</span>
      </div>
      <div class="stage-corner">
        {{ p.doc.grid?.columns }} COL × {{ p.doc.grid?.rows }} ROW
      </div>
    </div>
    <CellInspector
      v-if="p.inspection.value"
      :inspection="p.inspection.value"
      @close="p.inspectAt(null)"
    />
    <div v-else-if="p.diffusion.value" class="inspect-hint">
      点击画面中的单元，查看误差从何而来、为何在此截断
    </div>
    <div class="preview-bottom">
      <span class="mono"
        ><i class="status-dot" />{{
          p.busy.value
            ? "生成中"
            : p.doc.grid?.revision === p.doc.revision
              ? "已同步"
              : "待重新生成"
        }}
        <span class="muted">/ {{ p.count.value }} 个字符</span></span
      >
      <div class="zoom">
        <button
          aria-label="缩小"
          @click="p.zoom.value = Math.max(25, p.zoom.value - 25)"
        >
          <Minus :size="14" /></button
        ><span>{{ p.zoom.value }}%</span
        ><button
          aria-label="放大"
          @click="p.zoom.value = Math.min(200, p.zoom.value + 25)"
        >
          <Plus :size="14" />
        </button>
      </div>
    </div>
    <div class="workspace-note">
      <span>从像素，到字符。</span
      ><small>每一个符号，都是光影的另一种表达。</small
      ><span class="note-symbol">{ Aa }</span>
    </div>
  </main>
</template>
