import type { HoveredCandle, IndicatorSeries } from "../../types";
import type { IndicatorPaneRect } from "../indicators/IndicatorOverlayRenderer";

export interface TooltipOverlayApi {
    formatPrice(value: number): string;
    rectsOverlap(
        x: number,
        y: number,
        width: number,
        height: number,
        other: { x: number; y: number; width: number; height: number }
    ): boolean;
    getAnalyticsPanelBounds(width: number, height: number): { x: number; y: number; width: number; height: number } | null;
}

export interface TooltipOverlayParams {
    showTooltip: boolean;
    tooltipMode: "follow" | "fixed";
    showControlBar: boolean;
    selectedCandleIndex: number | null;
    hoveredCandle: HoveredCandle | null;
    selectedCandle: HoveredCandle | null;
    hoverCanvasX: number | null;
    hoverCanvasY: number | null;
    indicatorPane: IndicatorPaneRect | null;
    lowerIndicators: IndicatorSeries[];
}

export function renderTooltipOverlay(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    params: TooltipOverlayParams,
    api: TooltipOverlayApi
): void {
    const activeCandle = params.tooltipMode === "fixed"
        ? (params.selectedCandle ?? params.hoveredCandle)
        : (params.hoveredCandle ?? params.selectedCandle);

    if (!params.showTooltip || !activeCandle) {
        return;
    }

    const hoverInLowerPane = !!(
        params.indicatorPane
        && params.hoverCanvasY !== null
        && params.hoverCanvasY >= params.indicatorPane.y
    );

    const anchorX = params.hoverCanvasX ?? activeCandle.screenX;
    const anchorY = params.hoverCanvasY ?? activeCandle.screenY;
    const delta = activeCandle.close - activeCandle.open;
    const deltaPercent = activeCandle.open !== 0 ? (delta / activeCandle.open) * 100.0 : 0.0;
    const range = activeCandle.high - activeCandle.low;
    const lines = [
        `T ${activeCandle.time}`,
        `O ${api.formatPrice(activeCandle.open)}`,
        `H ${api.formatPrice(activeCandle.high)}`,
        `L ${api.formatPrice(activeCandle.low)}`,
        `C ${api.formatPrice(activeCandle.close)}`,
        `D ${delta >= 0 ? "+" : ""}${api.formatPrice(delta)} (${deltaPercent.toFixed(2)}%)`,
        `R ${api.formatPrice(range)}`,
    ];

    ctx.save();
    ctx.font = "12px 'Segoe UI', sans-serif";

    if (hoverInLowerPane && params.indicatorPane) {
        const indicatorLines: string[] = [];
        for (const indicator of params.lowerIndicators) {
            const value = indicator.values[activeCandle.index];
            if (!Number.isFinite(value ?? NaN)) {
                continue;
            }
            indicatorLines.push(`${indicator.type.toUpperCase()} ${Number(value).toFixed(2)}`);
        }
        if (indicatorLines.length === 0) {
            ctx.restore();
            return;
        }

        const timeLabel = `T ${activeCandle.time}`;
        const allLines = [timeLabel, ...indicatorLines];
        const maxWidth = Math.max(...allLines.map((line) => ctx.measureText(line).width));
        const boxWidth = maxWidth + 18;
        const boxHeight = 18 + (allLines.length * 14);
        const boxX = Math.min(width - boxWidth - 10, anchorX + 14);
        const boxY = Math.max(
            params.indicatorPane.y + 6,
            Math.min(params.indicatorPane.y + params.indicatorPane.height - boxHeight - 6, anchorY - 10)
        );

        ctx.fillStyle = "rgba(7, 18, 34, 0.92)";
        ctx.strokeStyle = "rgba(120, 148, 188, 0.45)";
        ctx.lineWidth = 1;
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

        ctx.fillStyle = "#9bd1ff";
        ctx.fillText(allLines[0], boxX + 9, boxY + 14);
        ctx.fillStyle = "#dce7ff";
        for (let i = 1; i < allLines.length; i += 1) {
            ctx.fillText(allLines[i], boxX + 9, boxY + 14 + (i * 14));
        }
        ctx.restore();
        return;
    }

    const maxWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const boxWidth = maxWidth + 18;
    const boxHeight = 18 + (lines.length * 14);
    const analyticsPanel = api.getAnalyticsPanelBounds(width, height);
    let boxX = 12;
    let boxY = 10;

    if (params.tooltipMode === "fixed") {
        const topInset = params.showControlBar
            ? (params.selectedCandleIndex !== null ? 62 : 38)
            : 10;
        boxY = Math.max(10, Math.min(height - boxHeight - 10, topInset));
    } else {
        boxX = Math.min(width - boxWidth - 10, anchorX + 14);
        boxY = Math.max(10, Math.min(height - boxHeight - 10, anchorY - 10));
    }

    if (analyticsPanel && api.rectsOverlap(boxX, boxY, boxWidth, boxHeight, analyticsPanel)) {
        if (params.tooltipMode === "fixed") {
            boxY = Math.min(height - boxHeight - 10, analyticsPanel.y + analyticsPanel.height + 10);
            boxX = 12;
        } else {
            boxX = Math.max(10, anchorX - boxWidth - 14);
        }
    }
    if (analyticsPanel && api.rectsOverlap(boxX, boxY, boxWidth, boxHeight, analyticsPanel)) {
        boxY = Math.min(height - boxHeight - 10, analyticsPanel.y + analyticsPanel.height + 10);
    }

    ctx.fillStyle = "rgba(7, 18, 34, 0.92)";
    ctx.strokeStyle = "rgba(120, 148, 188, 0.45)";
    ctx.lineWidth = 1;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

    ctx.fillStyle = delta >= 0 ? "#49d17f" : "#ff6a7a";
    ctx.fillText(lines[0], boxX + 9, boxY + 14);
    ctx.fillStyle = "#dce7ff";
    for (let i = 1; i < lines.length; i += 1) {
        ctx.fillText(lines[i], boxX + 9, boxY + 14 + (i * 14));
    }

    ctx.restore();
}

