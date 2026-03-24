import type { AgentAction, AnalyticsOptions, ChartTheme, DrawingPoint, ObserverFrame } from "../../types";
import { fontSpec } from "../theme/ChartTheme";

export interface NormalizedObserverFrame {
    time: number;
    reward: number;
    pnl: number;
    confidence: number;
    action: AgentAction;
    x: number;
    y: number;
}

export interface OverlayRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type ClampFn = (value: number, minValue: number, maxValue: number) => number;

function defaultObserverX(sequenceIndex: number, maxFrames: number, clamp: ClampFn): number {
    const span = Math.max(1, maxFrames - 1);
    const wrapped = sequenceIndex % Math.max(1, maxFrames);
    return clamp(-0.9 + ((1.8 * wrapped) / span), -0.95, 0.95);
}

function defaultObserverY(action: AgentAction): number {
    if (action === "buy") return 0.45;
    if (action === "sell") return -0.45;
    return 0.0;
}

export function normalizeObserverFrame(
    frame: ObserverFrame,
    sequenceIndex: number,
    maxFrames: number,
    clamp: ClampFn
): NormalizedObserverFrame | null {
    const reward = Number(frame.reward);
    const pnl = Number(frame.pnl);
    if (!Number.isFinite(reward) || !Number.isFinite(pnl)) {
        return null;
    }

    const parsedTime = Number(frame.time);
    const time = Number.isFinite(parsedTime) ? parsedTime : sequenceIndex;
    const confidenceRaw = Number(frame.confidence ?? 0.65);
    const confidence = clamp(Number.isFinite(confidenceRaw) ? confidenceRaw : 0.65, 0, 1);

    const action: AgentAction = frame.action ?? (reward > 0 ? "buy" : reward < 0 ? "sell" : "hold");
    const xRaw = Number(frame.x);
    const yRaw = Number(frame.y);

    const x = Number.isFinite(xRaw) ? clamp(xRaw, -1, 1) : defaultObserverX(sequenceIndex, maxFrames, clamp);
    const y = Number.isFinite(yRaw) ? clamp(yRaw, -1, 1) : defaultObserverY(action);

    return { time, reward, pnl, confidence, action, x, y };
}

export function trimObserverFramesToLimit(frames: NormalizedObserverFrame[], maxFrames: number): void {
    const overflow = frames.length - maxFrames;
    if (overflow > 0) {
        frames.splice(0, overflow);
    }
}

export function getAnalyticsPanelBounds(
    frameCount: number,
    options: Required<AnalyticsOptions>,
    width: number,
    height: number
): OverlayRect | null {
    if (frameCount === 0) {
        return null;
    }
    if (!options.showRewardCurve && !options.showPnlCurve) {
        return null;
    }

    const panelWidth = Math.max(220, Math.min(340, width * 0.36));
    const panelHeight = Math.max(120, Math.min(180, height * 0.30));
    return {
        x: width - panelWidth - 12,
        y: 12,
        width: panelWidth,
        height: panelHeight,
    };
}

export function renderAnalyticsOverlay(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    frames: NormalizedObserverFrame[],
    options: Required<AnalyticsOptions>,
    toCanvas: (point: DrawingPoint) => { x: number; y: number },
    theme: ChartTheme
): void {
    if (frames.length === 0) {
        return;
    }

    const slice = frames.slice(-options.maxFrames);

    if (options.showHeatmap) {
        for (const frame of slice) {
            const point = toCanvas({ x: frame.x, y: frame.y });
            const radius = 2.5 + (frame.confidence * 4.5);
            let color = theme.analytics.heatmapHold;
            if (frame.action === "buy") color = theme.analytics.heatmapBuy;
            if (frame.action === "sell") color = theme.analytics.heatmapSell;

            ctx.save();
            ctx.globalAlpha = 0.12 + (frame.confidence * 0.35);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    if (!options.showRewardCurve && !options.showPnlCurve) {
        return;
    }

    const analyticsPanel = getAnalyticsPanelBounds(slice.length, options, width, height);
    if (!analyticsPanel) {
        return;
    }

    const panelWidth = analyticsPanel.width;
    const panelHeight = analyticsPanel.height;
    const panelX = analyticsPanel.x;
    const panelY = analyticsPanel.y;

    const plotPadL = 12;
    const plotPadR = 8;
    const plotPadT = 26;
    const plotPadB = 24;
    const plotX = panelX + plotPadL;
    const plotY = panelY + plotPadT;
    const plotW = panelWidth - plotPadL - plotPadR;
    const plotH = panelHeight - plotPadT - plotPadB;

    let minValue = Number.POSITIVE_INFINITY;
    let maxValue = Number.NEGATIVE_INFINITY;
    for (const frame of slice) {
        if (options.showRewardCurve) {
            minValue = Math.min(minValue, frame.reward);
            maxValue = Math.max(maxValue, frame.reward);
        }
        if (options.showPnlCurve) {
            minValue = Math.min(minValue, frame.pnl);
            maxValue = Math.max(maxValue, frame.pnl);
        }
    }

    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
        return;
    }
    if (Math.abs(maxValue - minValue) < 1e-6) {
        maxValue += 1;
        minValue -= 1;
    }

    const xForIndex = (index: number): number => {
        const d = Math.max(1, slice.length - 1);
        return plotX + ((index / d) * plotW);
    };
    const yForValue = (value: number): number => {
        const t = (value - minValue) / (maxValue - minValue);
        return plotY + ((1 - t) * plotH);
    };

    ctx.save();
    ctx.fillStyle = theme.analytics.panelBackground;
    ctx.strokeStyle = theme.analytics.panelBorder;
    ctx.lineWidth = 1;
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

    if (minValue <= 0 && maxValue >= 0) {
        ctx.strokeStyle = theme.analytics.zeroLine;
        ctx.setLineDash([4, 3]);
        const y0 = yForValue(0);
        ctx.beginPath();
        ctx.moveTo(plotX, y0);
        ctx.lineTo(plotX + plotW, y0);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    const drawCurve = (extract: (frame: NormalizedObserverFrame) => number, color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < slice.length; i += 1) {
            const x = xForIndex(i);
            const y = yForValue(extract(slice[i]));
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
    };

    if (options.showRewardCurve) {
        drawCurve((frame) => frame.reward, theme.analytics.rewardCurve);
    }
    if (options.showPnlCurve) {
        drawCurve((frame) => frame.pnl, theme.analytics.pnlCurve);
    }

    const last = slice[slice.length - 1];
    ctx.font = fontSpec(theme.typography.analyticsSize, theme);
    ctx.fillStyle = theme.analytics.panelText;
    ctx.fillText("Observer Analytics", panelX + 10, panelY + 16);

    let metricsX = panelX + 10;
    if (options.showRewardCurve) {
        ctx.fillStyle = theme.analytics.rewardCurve;
        ctx.fillText(`R ${last.reward.toFixed(2)}`, metricsX, panelY + panelHeight - 8);
        metricsX += 70;
    }
    if (options.showPnlCurve) {
        ctx.fillStyle = theme.analytics.pnlCurve;
        ctx.fillText(`P ${last.pnl.toFixed(2)}`, metricsX, panelY + panelHeight - 8);
    }

    ctx.restore();
}
