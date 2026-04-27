import type { ChartMarkerDefinition, ChartTheme, PriceLineDefinition, SeriesGeometry } from "../../types";
import { fontSpec } from "../theme/ChartTheme";

interface PriceAnnotationRendererOptions {
    theme: ChartTheme;
    geometry: SeriesGeometry;
    width: number;
    height: number;
    priceLines: readonly PriceLineDefinition[];
    markers: readonly ChartMarkerDefinition[];
    priceToWorldY: (price: number, geometry: SeriesGeometry) => number;
    timeToWorldX: (time: number | string, geometry: SeriesGeometry) => number | null;
    worldToCanvasPoint: (worldX: number, worldY: number, width: number, height: number) => { x: number; y: number };
    formatPrice: (price: number) => string;
}

export function renderPriceAnnotations(ctx: CanvasRenderingContext2D, options: PriceAnnotationRendererOptions): void {
    renderPriceLines(ctx, options);
    renderMarkers(ctx, options);
}

function renderPriceLines(ctx: CanvasRenderingContext2D, options: PriceAnnotationRendererOptions): void {
    for (const line of options.priceLines) {
        if (!Number.isFinite(line.price)) {
            continue;
        }

        const worldY = options.priceToWorldY(line.price, options.geometry);
        const canvasPoint = options.worldToCanvasPoint(options.geometry.candles[0]?.x ?? 0, worldY, options.width, options.height);
        if (!Number.isFinite(canvasPoint.y) || canvasPoint.y < -16 || canvasPoint.y > options.height + 16) {
            continue;
        }

        ctx.save();
        ctx.strokeStyle = line.color ?? options.theme.drawings.line;
        ctx.lineWidth = line.width;
        if (line.dash?.length) {
            ctx.setLineDash(line.dash);
        }
        ctx.beginPath();
        ctx.moveTo(0, canvasPoint.y);
        ctx.lineTo(options.width, canvasPoint.y);
        ctx.stroke();
        ctx.setLineDash([]);

        const label = line.label ? `${line.label} ${options.formatPrice(line.price)}` : options.formatPrice(line.price);
        if (line.axisLabel) {
            ctx.font = fontSpec(options.theme.typography.axisSize, options.theme);
            const textWidth = ctx.measureText(label).width;
            const boxWidth = textWidth + 12;
            const boxHeight = 18;
            const boxX = Math.max(6, options.width - boxWidth - 4);
            const boxY = Math.max(4, Math.min(options.height - boxHeight - 4, canvasPoint.y - (boxHeight * 0.5)));
            ctx.fillStyle = options.theme.axes.labelBackground;
            ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
            ctx.fillStyle = options.theme.axes.labelText;
            ctx.fillText(label, boxX + 6, boxY + 12);
        }
        ctx.restore();
    }
}

function renderMarkers(ctx: CanvasRenderingContext2D, options: PriceAnnotationRendererOptions): void {
    for (const marker of options.markers) {
        const worldX = options.timeToWorldX(marker.time, options.geometry);
        if (worldX === null || !Number.isFinite(marker.price)) {
            continue;
        }
        const worldY = options.priceToWorldY(marker.price, options.geometry);
        const point = options.worldToCanvasPoint(worldX, worldY, options.width, options.height);
        if (
            !Number.isFinite(point.x) || !Number.isFinite(point.y)
            || point.x < -24 || point.x > options.width + 24
            || point.y < -24 || point.y > options.height + 24
        ) {
            continue;
        }

        const color = marker.color ?? options.theme.selection.labelText;
        const textColor = marker.textColor ?? options.theme.surface.menuText;
        const size = marker.size;

        ctx.save();
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;

        if (marker.shape === "circle") {
            ctx.beginPath();
            ctx.arc(point.x, point.y, size * 0.5, 0, Math.PI * 2);
            ctx.fill();
        } else {
            const direction = marker.shape === "arrowUp" ? -1 : 1;
            ctx.beginPath();
            ctx.moveTo(point.x, point.y + (direction * size));
            ctx.lineTo(point.x - (size * 0.7), point.y - (direction * size * 0.35));
            ctx.lineTo(point.x + (size * 0.7), point.y - (direction * size * 0.35));
            ctx.closePath();
            ctx.fill();
        }

        if (marker.label) {
            ctx.font = fontSpec(options.theme.typography.tooltipSize, options.theme);
            const textWidth = ctx.measureText(marker.label).width;
            const boxWidth = textWidth + 10;
            const boxHeight = 18;
            const offsetY = marker.shape === "arrowDown" ? 12 : -24;
            const boxX = Math.max(4, Math.min(options.width - boxWidth - 4, point.x - (boxWidth * 0.5)));
            const boxY = Math.max(4, Math.min(options.height - boxHeight - 4, point.y + offsetY));
            ctx.fillStyle = options.theme.tooltip.background;
            ctx.strokeStyle = options.theme.tooltip.border;
            ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
            ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
            ctx.fillStyle = textColor;
            ctx.fillText(marker.label, boxX + 5, boxY + 12);
        }

        ctx.restore();
    }
}
