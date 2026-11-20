<script setup lang="ts">
import { X } from "lucide-vue-next";
import type { Inspection } from "../lib/inspect";
import { dirLabel, weightLabel, statusLabel } from "../lib/inspect";

defineProps<{ inspection: Inspection }>();
const emit = defineEmits<{ close: [] }>();

function fmt(v: number): string {
  return (v >= 0 ? "+" : "") + v.toFixed(4);
}
function modeText(m: number, zone: number): string {
  if (m === 1) return `保护区 ${zone ? "#" + zone : ""} · 直接映射，误差不进不出`;
  if (m === 2) return "被屏障线端点穿过 · 整格隔离，误差不进不出";
  if (m === 0) return "参与误差扩散";
  return "直接映射引擎 · 无误差传播";
}
</script>
<template>
  <div class="inspector" data-testid="cell-inspector">
    <div class="inspector-head">
      <span class="mono">
        单元 ({{ inspection.x }}, {{ inspection.y }}) · 字符
        <b class="glyph">{{ inspection.glyph === " " ? "␣" : inspection.glyph }}</b>
        <template v-if="inspection.tone !== null">
          · 亮度 {{ inspection.tone.toFixed(3) }}
        </template>
        <template v-if="inspection.level !== null">
          → 色阶 {{ inspection.level }}/{{ inspection.levelCount - 1 }}
        </template>
      </span>
      <button class="icon-button" aria-label="关闭检查器" @click="emit('close')">
        <X :size="13" />
      </button>
    </div>
    <div class="inspector-mode">{{ modeText(inspection.mode, inspection.zone) }}</div>
    <div class="inspector-cols">
      <div>
        <div class="inspector-title">误差来源 ←</div>
        <template v-if="inspection.received.length">
          <div v-for="(f, i) in inspection.received" :key="i" class="flow">
            <span class="dir">{{ dirLabel(f.dx, f.dy) }}侧 ({{ f.fx }}, {{ f.fy }})</span>
            <span class="mono">{{ weightLabel(f.weight) }} · {{ fmt(f.amount) }}</span>
          </div>
        </template>
        <small v-else class="muted">
          {{ inspection.mode === 0 ? "无传入（首格或边界后）" : "不接收误差" }}
        </small>
      </div>
      <div>
        <div class="inspector-title">误差去向 →</div>
        <template v-if="inspection.sent.length">
          <div
            v-for="(f, i) in inspection.sent"
            :key="i"
            class="flow"
            :class="{ blocked: f.status !== 0 }"
          >
            <span class="dir">{{ dirLabel(f.dx, f.dy) }}</span>
            <span class="mono">{{ weightLabel(f.weight) }} · {{ fmt(f.amount) }}</span>
            <span class="reason" :class="{ cut: f.status !== 0 }">{{ statusLabel(f) }}</span>
          </div>
        </template>
        <small v-else class="muted">
          {{ inspection.mode === 0 ? "量化误差为 0，无外发" : "不外发误差" }}
        </small>
      </div>
    </div>
    <div v-if="inspection.droppedHere > 0" class="inspector-dropped mono">
      本单元被截断误差合计 {{ inspection.droppedHere.toFixed(4) }}，已在边界处丢弃，不会跨越。
    </div>
  </div>
</template>
