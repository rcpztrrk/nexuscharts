import type {
    AccessibilityOptions,
    AnalyticsOptions,
    ChartWatermarkOptions,
    TimeAxisOptions,
    TimeAxisState,
    UiOptions,
    UiState,
} from "../../types";
import { trimObserverFramesToLimit, type NormalizedObserverFrame } from "../analytics/ObserverAnalytics";
import { persistChartState } from "../ui/Persistence";

export interface ChartConfigurationApiOptions {
    getCanvasId: () => string;
    getUiOptions: () => Required<UiOptions>;
    setUiOptions: (options: Required<UiOptions>) => void;
    normalizeUiOptions: (options: UiOptions) => Required<UiOptions>;
    getAnalyticsOptions: () => Required<AnalyticsOptions>;
    setAnalyticsOptions: (options: Required<AnalyticsOptions>) => void;
    normalizeAnalyticsOptions: (options: AnalyticsOptions) => Required<AnalyticsOptions>;
    observerFrames: NormalizedObserverFrame[];
    getTimeAxisOptions: () => Required<TimeAxisOptions>;
    setTimeAxisOptions: (options: Required<TimeAxisOptions>) => void;
    normalizeTimeAxisOptions: (options: TimeAxisOptions) => Required<TimeAxisOptions>;
    getAccessibilityOptions: () => Required<AccessibilityOptions>;
    setAccessibilityOptions: (options: Required<AccessibilityOptions>) => void;
    normalizeAccessibilityOptions: (options: AccessibilityOptions) => Required<AccessibilityOptions>;
    applyAccessibilityOptions: () => void;
    getWatermarkOptions: () => Required<ChartWatermarkOptions>;
    setWatermarkOptions: (options: Required<ChartWatermarkOptions>) => void;
    normalizeWatermarkOptions: (options: ChartWatermarkOptions) => Required<ChartWatermarkOptions>;
    clearControlButtons: () => void;
    invalidateTimeScale: () => void;
    requestHoverRefresh: () => void;
    requestRedraw: () => void;
    requestVisibleRangeEmit: () => void;
}

export class ChartConfigurationApi {
    constructor(private readonly options: ChartConfigurationApiOptions) {}

    public configureAccessibility(input: AccessibilityOptions): void {
        this.options.setAccessibilityOptions(this.options.normalizeAccessibilityOptions({
            ...this.options.getAccessibilityOptions(),
            ...input,
        }));
        this.options.applyAccessibilityOptions();
    }

    public configureWatermark(input: ChartWatermarkOptions): void {
        this.options.setWatermarkOptions(this.options.normalizeWatermarkOptions({
            ...this.options.getWatermarkOptions(),
            ...input,
        }));
        this.options.requestRedraw();
    }

    public getWatermark(): Required<ChartWatermarkOptions> {
        return { ...this.options.getWatermarkOptions() };
    }

    public configureTimeAxis(input: TimeAxisOptions): void {
        this.options.setTimeAxisOptions(this.options.normalizeTimeAxisOptions(input));
        this.options.invalidateTimeScale();
        this.options.requestHoverRefresh();
        this.options.requestRedraw();
        this.options.requestVisibleRangeEmit();
    }

    public getTimeAxis(): TimeAxisState {
        return { ...this.options.getTimeAxisOptions() };
    }

    public configureUi(input: UiOptions): void {
        const uiOptions = this.options.normalizeUiOptions(input);
        this.options.setUiOptions(uiOptions);
        if (!uiOptions.showControlBar) {
            this.options.clearControlButtons();
        }
        this.persist();
        this.options.requestRedraw();
    }

    public getUiState(): UiState {
        const uiOptions = this.options.getUiOptions();
        const analyticsOptions = this.options.getAnalyticsOptions();
        return {
            showAxes: uiOptions.showAxes,
            showCrosshair: uiOptions.showCrosshair,
            showTooltip: uiOptions.showTooltip,
            showControlBar: uiOptions.showControlBar,
            tooltipMode: uiOptions.tooltipMode,
            persistState: uiOptions.persistState,
            autoScaleY: uiOptions.autoScaleY,
            showHeatmap: analyticsOptions.showHeatmap,
            showAnalyticsPanel: analyticsOptions.showRewardCurve || analyticsOptions.showPnlCurve,
        };
    }

    public configureAnalytics(input: AnalyticsOptions): void {
        const analyticsOptions = this.options.normalizeAnalyticsOptions(input);
        this.options.setAnalyticsOptions(analyticsOptions);
        trimObserverFramesToLimit(this.options.observerFrames, analyticsOptions.maxFrames);
        this.persist();
        this.options.requestRedraw();
    }

    private persist(): void {
        persistChartState(
            this.options.getCanvasId(),
            this.options.getUiOptions(),
            this.options.getAnalyticsOptions()
        );
    }
}
