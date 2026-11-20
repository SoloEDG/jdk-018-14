<script setup lang="ts">
import type {
  Asset,
  BarrierLine,
  Crop,
  ProtectZone,
} from "../../../shared/document";
import type { BoundaryTool, Selection } from "../model/useBoundaries";

const props = defineProps<{
  asset: Asset;
  crop: Crop;
  barriers: BarrierLine[];
  zones: ProtectZone[];
  tool: BoundaryTool;
  draftLine: { x: number; y: number }[] | null;
  draftZone: ProtectZone | null;
  selected: Selection | null;
}>();
const emit = defineEmits<{
  down: [e: PointerEvent];
  move: [e: PointerEvent];
  up: [e: PointerEvent];
  cancel: [e: PointerEvent];
  select: [kind: "line" | "zone", id: number];
}>();
function pts(line: BarrierLine): string {
  return line.points.map((p) => `${p.x},${p.y}`).join(" ");
}
function mid(line: BarrierLine): { x: number; y: number } {
  const a = line.points[0]!,
    b = line.points[line.points.length - 1]!;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
function isLineSel(id: number): boolean {
  return props.selected?.kind === "line" && props.selected.id === id;
}
function isZoneSel(id: number): boolean {
  return props.selected?.kind === "zone" && props.selected.id === id;
}
</script>
<template>
  <div
    class="boundary-editor"
    :class="[`tool-${tool}`]"
    @pointerdown="emit('down', $event)"
    @pointermove="emit('move', $event)"
    @pointerup="emit('up', $event)"
    @pointercancel="emit('cancel', $event)"
  >
    <img :src="asset.url" :alt="asset.name" draggable="false" />
    <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
      <rect
        class="crop-ref"
        :x="crop.x"
        :y="crop.y"
        :width="crop.width"
        :height="crop.height"
      />
      <rect
        v-for="(z, i) in zones"
        :key="z.id"
        class="zone"
        :class="{ picked: isZoneSel(z.id) }"
        :x="z.x"
        :y="z.y"
        :width="z.width"
        :height="z.height"
        @pointerdown.stop="emit('select', 'zone', z.id)"
      >
        <title>保护区 #{{ i + 1 }}</title>
      </rect>
      <template v-for="(l, i) in barriers" :key="l.id">
        <polyline
          class="barrier-hit"
          :class="{ pickable: tool === 'select' }"
          :points="pts(l)"
          @pointerdown.stop="emit('select', 'line', l.id)"
        />
        <polyline
          class="barrier"
          :class="{ picked: isLineSel(l.id) }"
          :points="pts(l)"
        >
          <title>屏障线 #{{ i + 1 }}</title>
        </polyline>
      </template>
      <polyline
        v-if="draftLine"
        class="draft"
        :points="`${draftLine[0]!.x},${draftLine[0]!.y} ${draftLine[1]!.x},${draftLine[1]!.y}`"
      />
      <rect
        v-if="draftZone"
        class="draft-zone"
        :x="draftZone.x"
        :y="draftZone.y"
        :width="draftZone.width"
        :height="draftZone.height"
      />
    </svg>
    <span
      v-for="(l, i) in barriers"
      :key="'t' + l.id"
      class="line-tag"
      :style="{ left: mid(l).x * 100 + '%', top: mid(l).y * 100 + '%' }"
      >#{{ i + 1 }}</span
    >
    <span
      v-for="(z, i) in zones"
      :key="'z' + z.id"
      class="zone-tag"
      :style="{ left: (z.x + z.width / 2) * 100 + '%', top: (z.y + z.height / 2) * 100 + '%' }"
      >区{{ i + 1 }}</span
    >
  </div>
</template>
