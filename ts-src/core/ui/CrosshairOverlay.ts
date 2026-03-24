import type { ChartTheme, HoveredCandle, IndicatorSeries, SeriesGeometry } from "../../types";
import type { IndicatorPaneRect } from "../indicators/IndicatorOverlayRenderer";
import { fontSpec } from "../theme/ChartTheme";

export interface CrosshairOverlayApi {
    clamp(value: number, min: number, max: number): number;
    canvasToWorldPoint(canvasX: number, canvasY: number, width: number, height: number): { x: number; y: number };
    worldYToPriceValueInternal(worldY: number, geometry: SeriesGeometry): number;
    formatPrice(value: number): string;
    formatTimeLabel(value: number | string): string;
}

export interface CrosshairOverlayParams {
    showCrosshair: boolean;
    geometry: SeriesGeometry;
    activeCandle: HoveredCandle;
    activeY: number;
    hoverCanvasY: number | null;
    indicatorPane: IndicatorPaneRect | null;
    lowerIndicators: IndicatorSeries[];
    theme: ChartTheme;
}

export function renderCrosshairOverlay(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    params: CrosshairOverlayParams,
    api: CrosshairOverlayApi
): void {
    if (!params.showCrosshair) {
        return;
    }

    const hoverInLowerPane = !!(
        params.indicatorPane
        && params.hoverCanvasY !== null
        && params.hoverCanvasY >= params.indicatorPane.y
    );
    const paneTop = hoverInLowerPane && params.indicatorPane ? params.indicatorPane.y : 0;
    const paneBottom = hoverInLowerPane && params.indicatorPane
        ? params.indicatorPane.y + params.indicatorPane.height
        : (params.indicatorPane ? params.indicatorPane.y : height);
    const lineY = api.clamp(params.activeY, paneTop + 2, paneBottom - 2);

    ctx.save();
    ctx.strokeStyle = params.theme.crosshair.line;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);

    ctx.beginPath();
    ctx.moveTo(params.activeCandle.screenX, 0);
    ctx.lineTo(params.activeCandle.screenX, height);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, paneTop, width, Math.max(0, paneBottom - paneTop));
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(0, lineY);
    ctx.lineTo(width, lineY);
    ctx.stroke();
    ctx.restore();

    ctx.setLineDash([]);
    ctx.fillStyle = params.theme.crosshair.point;
    ctx.beginPath();
    ctx.arc(params.activeCandle.screenX, lineY, 3, 0, Math.PI * 2);
    ctx.fill();

    const timeText = api.formatTimeLabel(params.activeCandle.time);

    ctx.font = fontSpec(params.theme.typography.crosshairSize, params.theme);

    if (!hoverInLowerPane) {
        const worldAtCursor = api.canvasToWorldPoint(params.activeCandle.screenX, lineY, width, height);
        const priceAtCursor = api.worldYToPriceValueInternal(worldAtCursor.y, params.geometry);
        const priceText = api.formatPrice(priceAtCursor);
        const priceTextWidth = ctx.measureText(priceText).width;
        const priceBoxWidth = priceTextWidth + 12;
        const priceBoxHeight = 18;
        const priceBoxX = width - priceBoxWidth - 4;
        const priceBoxY = Math.max(4, Math.min(height - priceBoxHeight - 24, lineY - 9));

        ctx.fillStyle = params.theme.crosshair.labelBackground;
        ctx.strokeStyle = params.theme.crosshair.labelBorder;
        ctx.lineWidth = 1;
        ctx.fillRect(priceBoxX, priceBoxY, priceBoxWidth, priceBoxHeight);
        ctx.strokeRect(priceBoxX, priceBoxY, priceBoxWidth, priceBoxHeight);
        ctx.fillStyle = params.theme.crosshair.labelText;
        ctx.fillText(priceText, priceBoxX + 6, priceBoxY + 13);
    } else if (params.indicatorPane && params.lowerIndicators.length > 0) {
        let minValue = Number.POSITIVE_INFINITY;
        let maxValue = Number.NEGATIVE_INFINITY;
        let allRsi = true;
        for (const indicator of params.lowerIndicators) {
            if (indicator.type !== "rsi") {
                allRsi = false;
            }
            for (const value of indicator.values) {
                if (!Number.isFinite(value ?? NaN)) {
                    continue;
                }
                minValue = Math.min(minValue, value as number);
                maxValue = Math.max(maxValue, value as number);
            }
        }
        if (allRsi) {
            minValue = 0;
            maxValue = 100;
        } else if (Math.abs(maxValue - minValue) < 1e-6) {
            maxValue += 1;
            minValue -= 1;
        }

        if (Number.isFinite(minValue) && Number.isFinite(maxValue)) {
            const t = api.clamp(
                1 - ((lineY - params.indicatorPane.innerY) / Math.max(1, params.indicatorPane.innerHeight)),
                0,
                1
            );
            const valueAtCursor = minValue + (t * (maxValue - minValue));
            const labelPrefix = allRsi ? "RSI" : "V";
            const labelText = `${labelPrefix} ${valueAtCursor.toFixed(2)}`;

            const labelWidth = ctx.measureText(labelText).width + 12;
            const labelHeight = 18;
            const labelX = width - labelWidth - 4;
            const labelY = Math.max(
                params.indicatorPane.y + 4,
                Math.min(params.indicatorPane.y + params.indicatorPane.height - labelHeight - 4, lineY - 9)
            );

            ctx.fillStyle = params.theme.crosshair.labelBackground;
            ctx.strokeStyle = params.theme.crosshair.labelBorder;
            ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
            ctx.strokeRect(labelX, labelY, labelWidth, labelHeight);
            ctx.fillStyle = params.theme.crosshair.labelText;
            ctx.fillText(labelText, labelX + 6, labelY + 13);
        }
    }

    const timeTextWidth = ctx.measureText(timeText).width;
    const timeBoxWidth = timeTextWidth + 12;
    const timeBoxHeight = 16;
    const timeBoxX = Math.max(4, Math.min(width - timeBoxWidth - 4, params.activeCandle.screenX - (timeBoxWidth * 0.5)));
    const timeBoxY = height - timeBoxHeight - 2;

    ctx.fillStyle = params.theme.crosshair.labelBackground;
    ctx.strokeStyle = params.theme.crosshair.labelBorder;
    ctx.fillRect(timeBoxX, timeBoxY, timeBoxWidth, timeBoxHeight);
    ctx.strokeRect(timeBoxX, timeBoxY, timeBoxWidth, timeBoxHeight);
    ctx.fillStyle = params.theme.crosshair.labelText;
    ctx.fillText(timeText, timeBoxX + 6, timeBoxY + 12);
    ctx.restore();
}
