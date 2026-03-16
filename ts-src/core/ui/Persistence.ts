import type { AnalyticsOptions, UiOptions, UiState } from "../../types";

export interface PersistedChartState {
    ui: Pick<
        UiState,
        "showAxes" | "showCrosshair" | "showTooltip" | "showControlBar" | "tooltipMode" | "persistState" | "autoScaleY"
    >;
    analytics: Pick<AnalyticsOptions, "showHeatmap" | "showRewardCurve" | "showPnlCurve">;
}

function getStorageKey(canvasId: string): string {
    return `nexuscharts:ui:${canvasId}`;
}

export function loadPersistedChartState(canvasId: string): PersistedChartState | null {
    if (typeof window === "undefined" || !window.localStorage) {
        return null;
    }

    try {
        const raw = window.localStorage.getItem(getStorageKey(canvasId));
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw) as PersistedChartState;
        if (!parsed || typeof parsed !== "object") {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function persistChartState(
    canvasId: string,
    uiOptions: Required<UiOptions>,
    analyticsOptions: Required<AnalyticsOptions>
): void {
    if (typeof window === "undefined" || !window.localStorage) {
        return;
    }

    if (!uiOptions.persistState) {
        try {
            window.localStorage.removeItem(getStorageKey(canvasId));
        } catch {
            // Ignore storage failures.
        }
        return;
    }

    const state: PersistedChartState = {
        ui: {
            showAxes: uiOptions.showAxes,
            showCrosshair: uiOptions.showCrosshair,
            showTooltip: uiOptions.showTooltip,
            showControlBar: uiOptions.showControlBar,
            tooltipMode: uiOptions.tooltipMode,
            persistState: uiOptions.persistState,
            autoScaleY: uiOptions.autoScaleY,
        },
        analytics: {
            showHeatmap: analyticsOptions.showHeatmap,
            showRewardCurve: analyticsOptions.showRewardCurve,
            showPnlCurve: analyticsOptions.showPnlCurve,
        },
    };

    try {
        window.localStorage.setItem(getStorageKey(canvasId), JSON.stringify(state));
    } catch {
        // Ignore storage quota/privacy mode failures and keep runtime behavior.
    }
}

