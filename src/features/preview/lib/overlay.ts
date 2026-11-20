import type { BarrierLine, Crop, Grid, ProtectZone } from "../../../shared/document";
import type { Inspection } from "./inspect";

export interface OverlayOpts {
  grid: Grid;
  crop: Crop;
  barriers: BarrierLine[];
  zones: ProtectZone[];
  showBoundaries: boolean;
  inspection: Inspection | null;
  /** 预览缩放（%），用于让线宽与文字在视觉上保持恒定 */
  zoom: number;
}

const CELL_W = 8,
  CELL_H = 16;

/**
 * 预览覆盖层：边界线、保护区、隔离单元与单元检查标注。
 * 绘制在独立画布上，导出（PNG/文本）只使用 drawGrid，覆盖层不会进入下载。
 */
export function drawOverlay(canvas: HTMLCanvasElement, opts: OverlayOpts) {
  const { grid, crop, barriers, zones, showBoundaries, inspection, zoom } = opts;
  canvas.width = grid.columns * CELL_W;
  canvas.height = grid.rows * CELL_H;
  const g = canvas.getContext("2d")!;
  const k = 100 / Math.max(25, zoom); // 视觉恒定补偿
  const px = (x: number) => ((x - crop.x) / crop.width) * grid.columns * CELL_W;
  const py = (y: number) => ((y - crop.y) / crop.height) * grid.rows * CELL_H;

  if (showBoundaries) {
    const d = grid.diffusion;
    const variant = d ? (d.active === "zoned" ? d.zoned : d.continuous) : undefined;
    if (variant) {
      g.fillStyle = "rgba(255,122,89,0.85)";
      for (let i = 0; i < variant.trace.mode.length; i++) {
        if (variant.trace.mode[i] === 2) {
          const x = i % grid.columns,
            y = Math.floor(i / grid.columns);
          g.beginPath();
          g.arc(x * CELL_W + CELL_W / 2, y * CELL_H + CELL_H / 2, 1.6 * k, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    for (const z of zones) {
      const x = px(z.x),
        y = py(z.y),
        w = px(z.x + z.width) - x,
        h = py(z.y + z.height) - y;
      g.fillStyle = "rgba(255,196,0,0.10)";
      g.fillRect(x, y, w, h);
      g.strokeStyle = "rgba(255,196,0,0.75)";
      g.lineWidth = 1.2 * k;
      g.setLineDash([4 * k, 3 * k]);
      g.strokeRect(x, y, w, h);
      g.setLineDash([]);
    }
    g.strokeStyle = "#ff7a59";
    g.lineWidth = 1.6 * k;
    g.lineCap = "round";
    barriers.forEach((l, i) => {
      g.beginPath();
      l.points.forEach((p, j) => {
        if (j === 0) g.moveTo(px(p.x), py(p.y));
        else g.lineTo(px(p.x), py(p.y));
      });
      g.stroke();
      const a = l.points[0]!,
        b = l.points[l.points.length - 1]!;
      label(g, `#${i + 1}`, (px(a.x) + px(b.x)) / 2, (py(a.y) + py(b.y)) / 2, k);
    });
    zones.forEach((z, i) => {
      label(g, `区${i + 1}`, px(z.x + z.width / 2), py(z.y + z.height / 2), k);
    });
  }

  if (inspection) {
    const { x, y } = inspection;
    const cx = x * CELL_W + CELL_W / 2,
      cy = y * CELL_H + CELL_H / 2;
    g.strokeStyle = "#ddf191";
    g.lineWidth = 1.6 * k;
    g.strokeRect(x * CELL_W + 0.5, y * CELL_H + 0.5, CELL_W - 1, CELL_H - 1);
    for (const f of inspection.received) {
      arrow(g, f.fx * CELL_W + CELL_W / 2, f.fy * CELL_H + CELL_H / 2, cx, cy, "rgba(155,227,107,0.9)", 1.4 * k);
    }
    for (const f of inspection.sent) {
      if (f.status === 0 && f.tx >= 0) {
        arrow(g, cx, cy, f.tx * CELL_W + CELL_W / 2, f.ty * CELL_H + CELL_H / 2, "rgba(106,168,255,0.55)", 1.1 * k);
      } else if (f.status !== 0) {
        // 截断：从单元中心画到被封锁的边/角，末端打 ✕
        const ex = cx + f.dx * CELL_W * 0.5,
          ey = cy + f.dy * CELL_H * 0.5;
        g.strokeStyle = "#ff5a5a";
        g.lineWidth = 1.6 * k;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(ex, ey);
        g.stroke();
        cross(g, ex, ey, 3.2 * k);
      }
    }
  }
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, k: number) {
  g.font = `${9 * k}px monospace`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const w = g.measureText(text).width + 6 * k;
  g.fillStyle = "rgba(16,18,22,0.85)";
  g.fillRect(x - w / 2, y - 6 * k, w, 12 * k);
  g.fillStyle = "#ffb09a";
  g.fillText(text, x, y);
}

function arrow(
  g: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  width: number,
) {
  const dx = x1 - x0,
    dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len,
    uy = dy / len;
  // 两端各留 1/4 格，避免盖住字符
  const sx = x0 + ux * len * 0.25,
    sy = y0 + uy * len * 0.25,
    ex = x1 - ux * len * 0.25,
    ey = y1 - uy * len * 0.25;
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(sx, sy);
  g.lineTo(ex, ey);
  g.stroke();
  const a = Math.atan2(uy, ux),
    s = 3 * width;
  g.beginPath();
  g.moveTo(ex, ey);
  g.lineTo(ex - s * Math.cos(a - 0.5), ey - s * Math.sin(a - 0.5));
  g.moveTo(ex, ey);
  g.lineTo(ex - s * Math.cos(a + 0.5), ey - s * Math.sin(a + 0.5));
  g.stroke();
}

function cross(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.beginPath();
  g.moveTo(x - s, y - s);
  g.lineTo(x + s, y + s);
  g.moveTo(x + s, y - s);
  g.lineTo(x - s, y + s);
  g.stroke();
}
