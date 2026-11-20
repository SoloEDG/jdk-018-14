<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import type { BarrierLine, Crop, Grid, ProtectZone } from "../../../shared/document";
import type { Inspection } from "../lib/inspect";
import { drawOverlay } from "../lib/overlay";

const props = defineProps<{
  grid: Grid;
  crop: Crop;
  barriers: BarrierLine[];
  zones: ProtectZone[];
  showBoundaries: boolean;
  inspection: Inspection | null;
  zoom: number;
}>();
const canvas = ref<HTMLCanvasElement>();
function draw() {
  if (canvas.value) drawOverlay(canvas.value, props);
}
onMounted(draw);
watch(
  () => [
    props.grid,
    props.crop,
    props.barriers,
    props.zones,
    props.showBoundaries,
    props.inspection,
    props.zoom,
  ],
  draw,
);
</script>
<template>
  <canvas ref="canvas" class="overlay-canvas" aria-hidden="true" />
</template>
