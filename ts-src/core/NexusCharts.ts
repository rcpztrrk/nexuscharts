import type {
    InitOptions,
    UiOptions,
    UiState,
    AnalyticsOptions,
    CandleDataPoint,
    ChartEventHandler,
    ChartEventMap,
    ChartEventName,
    ChartTheme,
    ChartDrawingUpdateMode,
    SeriesType,
    ObserverFrame,
    ObserverMetrics,
    PerfMetrics,
    WorldPoint,
    ScreenPoint,
    HoveredCandle,
    SeriesOptions,
    SeriesValueKey,
    CustomSeriesPoint,
    CustomSeriesContext,
    SeriesGeometry,
    NormalizedCandleDataPoint,
    IndicatorDefinition,
    IndicatorSeries,
    SeriesApi,
    DrawingPoint,
    DrawingStyle,
    DrawingType,
    DrawingDefinition,
    ThemeInput,
    TimeAxisOptions,
    TimeAxisState,
} from "../types";

import { PerfTracker } from "./perf/PerfTracker";
import { DrawingManager, type DrawingHitTestApi } from "./drawings/DrawingManager";
import {
    applyAnchorsToDrawing,
    applyDragToDrawing,
    distancePointToSegment,
    resolveDrawingPoint,
    resolveDrawingWorldX,
    resolveDrawingWorldY,
    type DrawingCoordinateApi,
} from "./drawings/DrawingEngine";
import { createDrawingContextMenu } from "./drawings/DrawingMenu";
import { renderDrawingOverlay } from "./drawings/DrawingOverlayRenderer";
import { IndicatorPaneManager } from "./indicators/IndicatorPaneManager";
import type { IndicatorPaneRect } from "./indicators/IndicatorOverlayRenderer";
import { renderIndicatorOverlay } from "./indicators/IndicatorOverlayRenderer";
import { SeriesManager } from "./series/SeriesManager";
import { NexusChartUpdateBatch } from "./NexusChartUpdateBatch";
import {
    buildPrimarySeriesGeometry,
    buildPrimarySeriesStats,
    type PrimarySeriesStats,
} from "./series/PrimarySeriesGeometry";
import { createChartTheme, fontSpec } from "./theme/ChartTheme";
import { renderControlBar, type ControlButtonState } from "./ui/ControlBar";
import { renderCrosshairOverlay as renderCrosshairOverlayUi } from "./ui/CrosshairOverlay";
import {
    renderSelectedCandleOverlay,
    resolveBoundarySelectionIndex,
    resolveClickedSelectionIndex,
    resolveSteppedSelectionIndex,
} from "./ui/CandleSelection";
import { renderTooltipOverlay as renderTooltipOverlayUi } from "./ui/TooltipOverlay";
import { loadPersistedChartState, persistChartState } from "./ui/Persistence";
import { NexusWasmBridge } from "./wasm/NexusWasmBridge";
import {
    getAnalyticsPanelBounds as getAnalyticsPanelBoundsUi,
    normalizeObserverFrame as normalizeObserverFrameUi,
    renderAnalyticsOverlay as renderAnalyticsOverlayUi,
    trimObserverFramesToLimit as trimObserverFramesToLimitUi,
    type NormalizedObserverFrame,
} from "./analytics/ObserverAnalytics";

interface OverlayRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface TimeAxisLabel {
    x: number;
    text: string;
}

export class NexusCharts {
    private canvas: HTMLCanvasElement | null = null;
    private overlayCanvas: HTMLCanvasElement | null = null;
    private overlayCtx: CanvasRenderingContext2D | null = null;
    private readonly canvasId: string;
    private readonly width?: number;
    private readonly height?: number;
    private readonly autoResize: boolean;
    private readonly pixelRatio?: number;
    private readonly wasmScriptPath: string;
    private readonly wasmBinaryPath: string;
    private readonly enableInteraction: boolean;
    private readonly onReadyCallback?: (chart: NexusCharts) => void;
    private currentZoomX: number = 4 / 3;
    private currentZoomY: number = 1.0;
    private currentCenterX: number = 0.0;
    private currentCenterY: number = 0.0;
    private isDragging: boolean = false;
    private draggedDuringPointer: boolean = false;
    private lastPointerX: number = 0;
    private lastPointerY: number = 0;
    private hoverCanvasX: number | null = null;
    private hoverCanvasY: number | null = null;
    private hoveredCandle: HoveredCandle | null = null;
    private selectedCandleIndex: number | null = null;
    private cleanupHandlers: Array<() => void> = [];
    private readonly eventListeners: Partial<Record<ChartEventName, Set<(payload: unknown) => void>>> = {};
    private lastVisibleRangeKey: string | null = null;
    private lastTimeScaleKey: string | null = null;
    private readonly seriesManager = new SeriesManager();
    private primarySeriesStatsCache:
        | { seriesId: string; revision: number; gapMode: "compress" | "preserve"; stats: PrimarySeriesStats | null }
        | null = null;
    private geometryCache: { seriesId: string; revision: number; geometry: SeriesGeometry | null } | null = null;
    private timeSeriesCache:
        | { seriesId: string; revision: number; series: Array<{ time: number | string; numeric: number | null; x: number }> }
        | null = null;
    private readonly drawingManager = new DrawingManager();
    private readonly drawingCoordinateApi: DrawingCoordinateApi = {
        timeToWorldX: (time, geometry) => this.timeToWorldXInternal(time, geometry),
        worldXToTime: (worldX, geometry) => this.worldXToTimeInternal(worldX, geometry),
        priceToWorldY: (price, geometry) => this.priceToWorldYValue(price, geometry),
        worldYToPrice: (worldY, geometry) => this.worldYToPriceValueInternal(worldY, geometry),
    };
    private readonly drawingHitTestApi: DrawingHitTestApi = {
        getWorldUnitsPerPixel: (width, height) => this.getWorldUnitsPerPixel(width, height),
        resolveDrawingPoint: (point, geometry) => resolveDrawingPoint(point, geometry, this.drawingCoordinateApi),
        resolveDrawingWorldX: (drawing, geometry) => resolveDrawingWorldX(drawing, geometry, this.drawingCoordinateApi),
        resolveDrawingWorldY: (drawing, geometry) => resolveDrawingWorldY(drawing, geometry, this.drawingCoordinateApi),
        distancePointToSegment,
    };
    private readonly wasmBridge = new NexusWasmBridge();
    private theme: ChartTheme = createChartTheme();
    private readonly observerFrames: NormalizedObserverFrame[] = [];
    private readonly indicatorPaneManager = new IndicatorPaneManager();
    private controlButtons: ControlButtonState[] = [];
    private analyticsOptions: Required<AnalyticsOptions> = {
        showRewardCurve: true,
        showPnlCurve: true,
        showHeatmap: true,
        maxFrames: 240,
    };
    private uiOptions: Required<UiOptions> = {
        showAxes: true,
        showCrosshair: true,
        showTooltip: true,
        showControlBar: true,
        tooltipMode: "follow",
        persistState: true,
        autoScaleY: false,
        axisTickCount: 5,
        pricePrecision: 2,
    };
    private timeAxisOptions: Required<TimeAxisOptions> = this.normalizeTimeAxisOptions();
    private readonly perfTracker = new PerfTracker(360);
    private readonly updateBatch: NexusChartUpdateBatch;
    private idCounter: number = 0;
    private readonly readyPromise: Promise<void>;
    private resolveReady!: () => void;

    constructor(options: InitOptions) {
        this.canvasId = options.canvasId;
        this.width = options.width;
        this.height = options.height;
        this.autoResize = options.autoResize ?? (options.width === undefined && options.height === undefined);
        this.pixelRatio = options.pixelRatio;
        this.wasmScriptPath = options.wasmScriptPath ?? "wasm/nexuscharts.js";
        this.wasmBinaryPath = options.wasmBinaryPath ?? "wasm/nexuscharts.wasm";
        this.enableInteraction = options.enableInteraction ?? true;
        this.onReadyCallback = options.onReady;
        const persisted = loadPersistedChartState(this.canvasId);
        if (persisted?.ui) {
            this.uiOptions = this.normalizeUiOptions(persisted.ui);
        }
        if (persisted?.analytics) {
            this.analyticsOptions = this.normalizeAnalyticsOptions(persisted.analytics);
        }
        if (options.analytics) {
            this.analyticsOptions = this.normalizeAnalyticsOptions(options.analytics);
        }
        if (options.ui) {
            this.uiOptions = this.normalizeUiOptions(options.ui);
        }
        if (options.theme) {
            this.theme = createChartTheme(options.theme);
        }
        if (options.timeAxis) {
            this.timeAxisOptions = this.normalizeTimeAxisOptions(options.timeAxis);
        }
        this.readyPromise = new Promise<void>((resolve) => {
            this.resolveReady = resolve;
        });
        this.updateBatch = new NexusChartUpdateBatch({
            syncAllSeries: () => this.syncAllSeriesToEngine(),
            recomputeIndicators: () => this.recomputeIndicators(),
            syncAllObserverFrames: () => this.syncAllObserverFramesToEngine(),
            autoScaleVisibleY: () => this.autoScaleVisibleY(),
            refreshHoverFromStoredPointer: () => this.refreshHoverFromStoredPointer(),
            redrawDrawings: () => this.redrawDrawings(),
            emitVisibleRangeChange: () => this.emitVisibleRangeChange(),
        });

        this.canvas = document.getElementById(options.canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            console.error(`[NexusCharts] Canvas with ID '${options.canvasId}' not found!`);
            return;
        }
        this.canvas.style.touchAction = "none";

        this.initializeOverlayCanvas(this.canvas);
        this.attachResizeHandling();
        this.syncCanvasSize();
        this.applyCanvasTheme();
        void this.initEngine();
    }

    public waitUntilReady(): Promise<void> {
        return this.readyPromise;
    }

    public isReady(): boolean {
        return this.wasmBridge.isReady();
    }

    public destroy(): void {
        this.detachInteractionHandlers();
        this.wasmBridge.destroy();
        if (this.overlayCanvas?.parentElement) {
            this.overlayCanvas.parentElement.removeChild(this.overlayCanvas);
        }
        this.overlayCanvas = null;
        this.overlayCtx = null;
    }

    public resize(): void {
        this.syncCanvasSize();
    }

    public batchUpdates<T>(callback: () => T): T {
        return this.updateBatch.run(callback);
    }

    public pan(deltaX: number, deltaY: number): void {
        if (!this.wasmBridge.isReady()) {
            return;
        }
        this.currentCenterX += deltaX;
        this.currentCenterY += deltaY;
        this.wasmBridge.panCamera(deltaX, deltaY);
        this.autoScaleVisibleY();
        this.refreshHoverFromStoredPointer();
        this.redrawDrawings();
        this.requestVisibleRangeEmit();
    }

    public zoom(zoomFactor: number, axis: "x" | "y" | "both" = "x"): void {
        if (!this.wasmBridge.isReady()) {
            return;
        }
        const surface = this.overlayCanvas ?? this.canvas;
        const anchorX = this.hoverCanvasX ?? (surface ? surface.width * 0.5 : null);
        const anchorY = this.hoverCanvasY ?? (surface ? surface.height * 0.5 : null);
        const anchoredWorld = (surface && anchorX !== null && anchorY !== null)
            ? this.canvasToWorldPoint(anchorX, anchorY, surface.width, surface.height)
            : null;

        const nextZoomX = axis === "y"
            ? this.currentZoomX
            : Math.min(5.0, Math.max(0.2, this.currentZoomX * zoomFactor));
        const nextZoomY = axis === "x"
            ? this.currentZoomY
            : Math.min(5.0, Math.max(0.2, this.currentZoomY * zoomFactor));

        this.currentZoomX = nextZoomX;
        this.currentZoomY = nextZoomY;

        if (surface && anchoredWorld && anchorX !== null && anchorY !== null) {
            const halfWidth = this.currentZoomX;
            const halfHeight = this.currentZoomY;
            const normalizedX = anchorX / Math.max(1, surface.width);
            const normalizedY = (surface.height - anchorY) / Math.max(1, surface.height);
            const left = anchoredWorld.x - (normalizedX * halfWidth * 2.0);
            const bottom = anchoredWorld.y - (normalizedY * halfHeight * 2.0);
            this.currentCenterX = left + halfWidth;
            this.currentCenterY = bottom + halfHeight;
            this.applyCameraView();
            this.autoScaleVisibleY();
        } else {
            this.wasmBridge.zoomCamera(zoomFactor);
        }

        this.refreshHoverFromStoredPointer();
        this.redrawDrawings();
        this.requestVisibleRangeEmit();
    }

    public screenToWorld(clientX: number, clientY: number): WorldPoint | null {
        const surface = this.overlayCanvas ?? this.canvas;
        if (!surface) {
            return null;
        }

        const rect = surface.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            return null;
        }

        const canvasX = ((clientX - rect.left) / rect.width) * surface.width;
        const canvasY = ((clientY - rect.top) / rect.height) * surface.height;
        return this.canvasToWorldPoint(canvasX, canvasY, surface.width, surface.height);
    }

    public worldToScreen(worldX: number, worldY: number): ScreenPoint | null {
        const surface = this.overlayCanvas ?? this.canvas;
        if (!surface) {
            return null;
        }
        return this.worldToCanvasPoint(worldX, worldY, surface.width, surface.height);
    }

    public timeToWorldX(time: number | string): number | null {
        const geometry = this.buildSeriesGeometry();
        if (!geometry) {
            return null;
        }
        return this.timeToWorldXInternal(time, geometry);
    }

    public worldXToTime(worldX: number): number | string | null {
        const geometry = this.buildSeriesGeometry();
        if (!geometry) {
            return null;
        }
        return this.worldXToTimeInternal(worldX, geometry);
    }

    public priceToWorldY(price: number): number | null {
        const geometry = this.buildSeriesGeometry();
        if (!geometry || !Number.isFinite(price)) {
            return null;
        }
        return this.priceToWorldYValue(price, geometry);
    }

    public worldYToPriceValue(worldY: number): number | null {
        const geometry = this.buildSeriesGeometry();
        if (!geometry || !Number.isFinite(worldY)) {
            return null;
        }
        return this.worldYToPriceValueInternal(worldY, geometry);
    }

    public timeToScreen(time: number | string, price: number): ScreenPoint | null {
        const geometry = this.buildSeriesGeometry();
        const surface = this.overlayCanvas ?? this.canvas;
        if (!geometry || !surface || !Number.isFinite(price)) {
            return null;
        }
        const worldX = this.timeToWorldXInternal(time, geometry);
        if (worldX === null) {
            return null;
        }
        const worldY = this.priceToWorldYValue(price, geometry);
        return this.worldToCanvasPoint(worldX, worldY, surface.width, surface.height);
    }

    public screenToTimePrice(clientX: number, clientY: number): { time: number | string | null; price: number | null } | null {
        const geometry = this.buildSeriesGeometry();
        const world = this.screenToWorld(clientX, clientY);
        if (!geometry || !world) {
            return null;
        }
        return {
            time: this.worldXToTimeInternal(world.x, geometry),
            price: this.worldYToPriceValueInternal(world.y, geometry),
        };
    }

    public getHoveredCandle(): HoveredCandle | null {
        return this.hoveredCandle ? { ...this.hoveredCandle } : null;
    }

    public getSelectedCandle(): HoveredCandle | null {
        const geometry = this.buildSeriesGeometry();
        const candle = this.getCandleByIndex(this.selectedCandleIndex, geometry);
        return candle ? { ...candle } : null;
    }

    public clearSelectedCandle(): void {
        this.setSelectedCandleIndex(null);
    }

    private cloneDrawingDefinition(definition: DrawingDefinition | null | undefined): DrawingDefinition | null {
        if (!definition) {
            return null;
        }

        return {
            ...definition,
            points: definition.points?.map((point) => ({ ...point })),
            style: definition.style
                ? {
                    ...definition.style,
                    dash: definition.style.dash ? [...definition.style.dash] : undefined,
                }
                : undefined,
        };
    }

    private getDrawingSnapshot(id: string | null): DrawingDefinition | null {
        if (!id) {
            return null;
        }
        return this.cloneDrawingDefinition(this.drawingManager.getDrawing(id) ?? null);
    }

    private setActiveDrawingSelection(id: string | null): void {
        const previousId = this.drawingManager.getActiveDrawingId();
        if (previousId === id) {
            return;
        }
        this.drawingManager.setActiveDrawingId(id);
        this.emitDrawingSelected();
    }

    private clearActiveDrawingSelection(): void {
        this.setActiveDrawingSelection(null);
    }

    private clearActiveDrawingInteraction(): void {
        const previousId = this.drawingManager.getActiveDrawingId();
        this.drawingManager.clearActiveInteraction();
        if (previousId !== null) {
            this.emitDrawingSelected();
        }
    }

    private activateHoveredDrawingSelection(): boolean {
        const previousId = this.drawingManager.getActiveDrawingId();
        const activated = this.drawingManager.activateHoveredDrawing();
        if (activated && this.drawingManager.getActiveDrawingId() !== previousId) {
            this.emitDrawingSelected();
        }
        return activated;
    }

    public fitToData(): void {
        const surface = this.overlayCanvas ?? this.canvas;
        const stats = this.getPrimarySeriesStats();
        if (!stats || !surface) {
            return;
        }

        const paddingY = 0.18;
        const paddingX = 0.08;
        const minX = -0.92;
        const maxX = stats.validCount > 1 ? 0.92 : -0.92;
        const minY = -0.85;
        const maxY = 0.85;
        const halfHeightFromY = Math.max(0.35, ((maxY - minY) * 0.5) + paddingY);
        const halfWidthFromX = Math.max(0.35, ((maxX - minX) * 0.5) + paddingX);

        this.currentCenterX = (minX + maxX) * 0.5;
        this.currentCenterY = (minY + maxY) * 0.5;
        this.currentZoomX = Math.min(5.0, Math.max(0.2, halfWidthFromX));
        this.currentZoomY = Math.min(5.0, Math.max(0.2, halfHeightFromY));
        this.applyCameraView();
        this.refreshHoverFromStoredPointer();
        this.redrawDrawings();
        this.requestVisibleRangeEmit();
    }

    public createSeries(options: SeriesOptions = {}): SeriesApi {
        return this.seriesManager.createSeries(options, {
            createId: () => this.nextId("series"),
            isCompleteCandle: (point): point is CandleDataPoint => this.isCompleteCandle(point),
            onSeriesMutated: (seriesId) => {
                const series = this.seriesManager.get(seriesId);
                const primary = this.getPrimaryCandlestickSeriesEntry();
                const touchesPrimaryCandles = !!series && series.type === "candlestick" && primary?.id === seriesId;

                if (touchesPrimaryCandles) {
                    this.queuePrimarySeriesMutation();
                } else {
                    this.requestRedraw();
                }
            },
        }, this.theme);
    }

    public addIndicator(definition: IndicatorDefinition): string {
        const id = this.indicatorPaneManager.addIndicator(definition, () => this.nextId("indicator"), this.theme);
        this.queueIndicatorRecompute();
        this.requestRedraw();
        return id;
    }

    public removeIndicator(id: string): boolean {
        const removed = this.indicatorPaneManager.removeIndicator(id);
        if (removed) {
            this.requestRedraw();
        }
        return removed;
    }

    public clearIndicators(): void {
        this.indicatorPaneManager.clearIndicators();
        this.requestRedraw();
    }

    public getIndicators(): IndicatorSeries[] {
        return this.indicatorPaneManager.getIndicators();
    }

    public addDrawing(definition: DrawingDefinition): string {
        const id = this.drawingManager.addDrawing(definition, () => this.nextId("drawing"));
        this.requestRedraw();
        return id;
    }

    public removeDrawing(id: string, reason: "api" | "contextMenu" = "api"): boolean {
        const removedDrawing = this.getDrawingSnapshot(id);
        const activeDrawingId = this.drawingManager.getActiveDrawingId();
        const removed = this.drawingManager.removeDrawing(id);
        if (removed) {
            this.requestRedraw();
            if (removedDrawing) {
                this.emitDrawingDeleted(removedDrawing, reason);
            }
            if (activeDrawingId === id) {
                this.emitDrawingSelected();
            }
        }
        return removed;
    }

    public clearDrawings(): void {
        const removedDrawings = Array.from(this.drawingManager.values())
            .map((drawing) => this.cloneDrawingDefinition(drawing))
            .filter((drawing): drawing is DrawingDefinition => drawing !== null);
        const hadActiveDrawing = this.drawingManager.getActiveDrawingId() !== null;
        this.drawingManager.clearDrawings();
        this.requestRedraw();
        for (const drawing of removedDrawings) {
            this.emitDrawingDeleted(drawing, "clearAll");
        }
        if (hadActiveDrawing) {
            this.emitDrawingSelected();
        }
    }

    public applyTheme(themeInput: ThemeInput): void {
        this.theme = createChartTheme(themeInput);
        this.applyCanvasTheme();
        this.seriesManager.applyTheme(this.theme);
        this.indicatorPaneManager.applyTheme(this.theme);
        this.drawingManager.applyMenuTheme(this.theme);
        this.requestRedraw();
    }

    public getTheme(): ChartTheme {
        return createChartTheme(this.theme);
    }

    public configureTimeAxis(options: TimeAxisOptions): void {
        this.timeAxisOptions = this.normalizeTimeAxisOptions(options);
        this.primarySeriesStatsCache = null;
        this.geometryCache = null;
        this.timeSeriesCache = null;
        this.lastVisibleRangeKey = null;
        this.lastTimeScaleKey = null;
        this.requestHoverRefresh();
        this.requestRedraw();
        this.requestVisibleRangeEmit();
    }

    public getTimeAxis(): TimeAxisState {
        return { ...this.timeAxisOptions };
    }

    public configureUi(options: UiOptions): void {
        this.uiOptions = this.normalizeUiOptions(options);
        if (!this.uiOptions.showControlBar) {
            this.controlButtons = [];
        }
        persistChartState(this.canvasId, this.uiOptions, this.analyticsOptions);
        this.requestRedraw();
    }

    public getUiState(): UiState {
        return {
            showAxes: this.uiOptions.showAxes,
            showCrosshair: this.uiOptions.showCrosshair,
            showTooltip: this.uiOptions.showTooltip,
            showControlBar: this.uiOptions.showControlBar,
            tooltipMode: this.uiOptions.tooltipMode,
            persistState: this.uiOptions.persistState,
            autoScaleY: this.uiOptions.autoScaleY,
            showHeatmap: this.analyticsOptions.showHeatmap,
            showAnalyticsPanel: this.analyticsOptions.showRewardCurve || this.analyticsOptions.showPnlCurve,
        };
    }

    public configureAnalytics(options: AnalyticsOptions): void {
        this.analyticsOptions = this.normalizeAnalyticsOptions(options);
        trimObserverFramesToLimitUi(this.observerFrames, this.analyticsOptions.maxFrames);
        persistChartState(this.canvasId, this.uiOptions, this.analyticsOptions);
        this.requestRedraw();
    }

    public pushObserverFrame(frame: ObserverFrame): void {
        const normalized = normalizeObserverFrameUi(
            frame,
            this.observerFrames.length,
            this.analyticsOptions.maxFrames,
            this.clamp.bind(this)
        );
        if (!normalized) {
            return;
        }
        this.observerFrames.push(normalized);
        trimObserverFramesToLimitUi(this.observerFrames, this.analyticsOptions.maxFrames);
        if (this.isBatchingUpdates()) {
            this.queueObserverSync();
        } else {
            this.syncObserverFrameToEngine(normalized);
        }
        this.requestRedraw();
    }

    public setObserverFrames(frames: ObserverFrame[]): void {
        this.observerFrames.length = 0;
        for (let i = 0; i < frames.length; i += 1) {
            const normalized = normalizeObserverFrameUi(
                frames[i],
                i,
                this.analyticsOptions.maxFrames,
                this.clamp.bind(this)
            );
            if (normalized) {
                this.observerFrames.push(normalized);
            }
        }
        trimObserverFramesToLimitUi(this.observerFrames, this.analyticsOptions.maxFrames);
        this.queueObserverSync();
        this.requestRedraw();
    }

    public getObserverFrames(): ObserverFrame[] {
        return this.observerFrames.map((frame) => ({ ...frame }));
    }

    public clearObserverFrames(): void {
        this.observerFrames.length = 0;
        this.queueObserverSync();
        this.requestRedraw();
    }

    public getObserverMetrics(window: number = 0): ObserverMetrics {
        const sanitizedWindow = Number.isFinite(window)
            ? Math.max(0, Math.floor(window))
            : 0;

        const wasmMetrics = this.wasmBridge.getObserverMetrics(sanitizedWindow);
        if (wasmMetrics) {
            return wasmMetrics;
        }

        const frameCount = this.observerFrames.length;
        if (frameCount === 0) {
            return {
                frameCount: 0,
                lastReward: 0,
                lastPnl: 0,
                averageReward: 0,
                source: "js",
            };
        }

        const span = sanitizedWindow > 0 ? Math.min(sanitizedWindow, frameCount) : frameCount;
        const start = frameCount - span;
        let rewardSum = 0;
        for (let i = start; i < frameCount; i += 1) {
            rewardSum += this.observerFrames[i].reward;
        }

        const last = this.observerFrames[frameCount - 1];
        return {
            frameCount,
            lastReward: last.reward,
            lastPnl: last.pnl,
            averageReward: rewardSum / span,
            source: "js",
        };
    }

    public getPerfMetrics(window: number = 60): PerfMetrics {
        return this.perfTracker.getMetrics(window);
    }

    public subscribe<K extends ChartEventName>(eventName: K, handler: ChartEventHandler<K>): () => void {
        const listeners = this.eventListeners[eventName] ?? new Set<(payload: unknown) => void>();
        listeners.add(handler as (payload: unknown) => void);
        this.eventListeners[eventName] = listeners;
        return () => {
            this.unsubscribe(eventName, handler);
        };
    }

    public unsubscribe<K extends ChartEventName>(eventName: K, handler: ChartEventHandler<K>): boolean {
        const listeners = this.eventListeners[eventName];
        if (!listeners) {
            return false;
        }
        return listeners.delete(handler as (payload: unknown) => void);
    }

    private async initEngine(): Promise<void> {
        const initialized = await this.wasmBridge.initialize({
            canvasId: this.canvasId,
            width: this.canvas?.width ?? this.width ?? 0,
            height: this.canvas?.height ?? this.height ?? 0,
            canvas: this.canvas,
            wasmScriptPath: this.wasmScriptPath,
            wasmBinaryPath: this.wasmBinaryPath,
        });
        if (!initialized) {
            return;
        }

        try {
            this.syncAllSeriesToEngine();
            this.syncAllObserverFramesToEngine();
            if (this.enableInteraction && this.canvas) {
                this.attachInteractionHandlers(this.canvas);
            }
            this.resolveReady();
            if (this.onReadyCallback) {
                this.onReadyCallback(this);
            }
        } catch (error) {
            console.error("[NexusCharts:JS] Engine bootstrap follow-up failed.", error);
        }
    }

    private attachInteractionHandlers(canvas: HTMLCanvasElement): void {
        let pinchDistance: number | null = null;
        let touchSelectionArmed = false;
        let longPressTimer: number | null = null;
        let longPressTriggered = false;
        let lastTapAt = 0;
        let updatedDrawingIdDuringPointer: string | null = null;
        let dragStartDrawingSnapshot: DrawingDefinition | null = null;
        let lastTapX = 0;
        let lastTapY = 0;
        const longPressDelayMs = 380;
        const touchDragThresholdPx = 8;
        const doubleTapDelayMs = 280;
        const doubleTapDistancePx = 26;

        const clearLongPressTimer = () => {
            if (longPressTimer !== null) {
                window.clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        };

        const beginPointerInteraction = (clientX: number, clientY: number): boolean => {
            if (this.getControlButtonAtClientPosition(clientX, clientY)) {
                return false;
            }

            this.draggedDuringPointer = false;
            this.lastPointerX = clientX;
            this.lastPointerY = clientY;
            this.updateHoverFromClientPosition(clientX, clientY);
            const world = this.screenToWorld(clientX, clientY);
            const surface = this.overlayCanvas ?? canvas;
            const geometry = this.buildSeriesGeometry();
            if (world && surface) {
                const hit = this.drawingManager.hitTestDrawing(
                    world,
                    surface.width,
                    surface.height,
                    geometry,
                    this.drawingHitTestApi
                );
                if (hit) {
                    const drawing = this.drawingManager.getDrawing(hit.id);
                    if (drawing) {
                        applyAnchorsToDrawing(drawing, geometry, this.drawingCoordinateApi);
                        const resolvedPoints = drawing.points
                            ? drawing.points.map((point) => resolveDrawingPoint(point, geometry, this.drawingCoordinateApi))
                            : undefined;
                        const resolvedX = resolveDrawingWorldX(drawing, geometry, this.drawingCoordinateApi);
                        const resolvedY = resolveDrawingWorldY(drawing, geometry, this.drawingCoordinateApi);

                        this.setActiveDrawingSelection(hit.id);
                        updatedDrawingIdDuringPointer = null;
                        dragStartDrawingSnapshot = this.cloneDrawingDefinition(drawing);
                        this.drawingManager.setActiveDrag({
                            id: hit.id,
                            mode: hit.mode,
                            pointIndex: hit.pointIndex,
                            startWorld: world,
                            startPoints: resolvedPoints,
                            startX: resolvedX ?? drawing.x,
                            startY: resolvedY ?? drawing.y,
                        });
                        this.isDragging = false;
                        this.redrawDrawings();
                        return true;
                    }
                }
            }
            this.clearActiveDrawingInteraction();
            dragStartDrawingSnapshot = null;
            this.isDragging = true;
            return true;
        };

        const movePointerInteraction = (clientX: number, clientY: number): void => {
            const activeDrag = this.drawingManager.getActiveDrag();
            if (activeDrag) {
                const world = this.screenToWorld(clientX, clientY);
                if (!world) {
                    return;
                }
                const drag = activeDrag;
                const drawing = this.drawingManager.getDrawing(drag.id);
                if (!drawing) {
                    this.drawingManager.clearActiveInteraction();
                    return;
                }

                const geometry = this.buildSeriesGeometry();
                this.draggedDuringPointer = true;
                applyDragToDrawing(drawing, drag, world, geometry, this.drawingCoordinateApi);
                updatedDrawingIdDuringPointer = drawing.id;
                this.drawingManager.setHoveredDrawingId(drawing.id);
                this.redrawDrawings();
                return;
            }

            if (this.isDragging) {
                const dx = clientX - this.lastPointerX;
                const dy = clientY - this.lastPointerY;
                if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                    this.draggedDuringPointer = true;
                }
                this.lastPointerX = clientX;
                this.lastPointerY = clientY;

                const width = canvas.width || 1;
                const height = canvas.height || 1;
                const aspect = width / height;
                const worldUnitsPerPixelX = (2.0 * this.currentZoomX) / width;
                const worldUnitsPerPixelY = (2.0 * this.currentZoomY) / height;

                this.lastPointerX = clientX;
                this.lastPointerY = clientY;
                const panY = this.uiOptions.autoScaleY ? 0 : (dy * worldUnitsPerPixelY);
                this.pan(-dx * worldUnitsPerPixelX, panY);
                return;
            }

            this.lastPointerX = clientX;
            this.lastPointerY = clientY;
            this.updateHoverFromClientPosition(clientX, clientY);
            this.redrawDrawings();
        };

        const activateSelectionFromPointer = (): void => {
            if (this.activateHoveredDrawingSelection()) {
                this.redrawDrawings();
                return;
            }
            this.clearActiveDrawingSelection();
            const nextIndex = resolveClickedSelectionIndex(
                this.selectedCandleIndex,
                this.hoveredCandle,
                this.draggedDuringPointer
            );
            if (nextIndex === undefined) {
                return;
            }
            this.setSelectedCandleIndex(nextIndex);
        };

        const scheduleLongPress = (clientX: number, clientY: number): void => {
            clearLongPressTimer();
            longPressTriggered = false;
            longPressTimer = window.setTimeout(() => {
                longPressTimer = null;
                if (!touchSelectionArmed || this.draggedDuringPointer) {
                    return;
                }
                this.updateHoverFromClientPosition(clientX, clientY);
                activateSelectionFromPointer();
                stopDragging();
                touchSelectionArmed = false;
                longPressTriggered = true;
            }, longPressDelayMs);
        };

        const onMouseDown = (event: MouseEvent) => {
            beginPointerInteraction(event.clientX, event.clientY);
        };

        const onMouseMove = (event: MouseEvent) => {
            movePointerInteraction(event.clientX, event.clientY);
        };

        const stopDragging = () => {
            this.isDragging = false;
            const activeDrag = this.drawingManager.getActiveDrag();
            if (activeDrag) {
                this.drawingManager.setActiveDrag(null);
                if (updatedDrawingIdDuringPointer === activeDrag.id) {
                    const updatedDrawing = this.getDrawingSnapshot(activeDrag.id);
                    if (updatedDrawing) {
                        this.emitDrawingUpdated(updatedDrawing, "drag", {
                            mode: activeDrag.mode,
                            pointIndex: activeDrag.pointIndex ?? null,
                            previousDrawing: dragStartDrawingSnapshot,
                        });
                    }
                }
            }
            updatedDrawingIdDuringPointer = null;
            dragStartDrawingSnapshot = null;
        };

        const onClick = (event: MouseEvent) => {
            if (this.handleControlBarClick(event.clientX, event.clientY)) {
                return;
            }
            activateSelectionFromPointer();
            this.emitClick(event.clientX, event.clientY, "mouse");
        };

        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            this.updateHoverFromClientPosition(event.clientX, event.clientY);
            const zoomFactor = event.deltaY > 0 ? 1.08 : 0.92;
            const axis = (event.shiftKey || event.altKey) ? "y" : "x";
            this.zoom(zoomFactor, axis);
        };

        const onContextMenu = (event: MouseEvent) => {
            event.preventDefault();
            this.updateHoverFromClientPosition(event.clientX, event.clientY);
            this.drawingManager.showContextMenuForSelection(event.clientX, event.clientY);
        };

        const onGlobalDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            this.drawingManager.dismissContextMenuIfOutside(target);
        };

        const onDoubleClick = () => {
            this.fitToData();
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.repeat) {
                return;
            }

            const target = event.target as HTMLElement | null;
            const tagName = target?.tagName?.toLowerCase();
            if (target?.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select") {
                return;
            }

            switch (event.key.toLowerCase()) {
                case "f":
                    this.fitToData();
                    event.preventDefault();
                    break;
                case "a":
                    this.toggleUiFlag("showAxes");
                    event.preventDefault();
                    break;
                case "c":
                    this.toggleUiFlag("showCrosshair");
                    event.preventDefault();
                    break;
                case "t":
                    this.toggleUiFlag("showTooltip");
                    event.preventDefault();
                    break;
                case "y":
                    this.toggleAutoScaleY();
                    event.preventDefault();
                    break;
                case "m":
                    this.toggleTooltipMode();
                    event.preventDefault();
                    break;
                case "h":
                    this.toggleAnalyticsFlag("showHeatmap");
                    event.preventDefault();
                    break;
                case "g":
                    this.toggleAnalyticsPanel();
                    event.preventDefault();
                    break;
                case "arrowleft":
                    this.moveSelection(-1);
                    event.preventDefault();
                    break;
                case "arrowright":
                    this.moveSelection(1);
                    event.preventDefault();
                    break;
                case "home":
                    this.jumpSelection("start");
                    event.preventDefault();
                    break;
                case "end":
                    this.jumpSelection("end");
                    event.preventDefault();
                    break;
                case "escape":
                    this.clearSelectedCandle();
                    this.drawingManager.hideContextMenu();
                    event.preventDefault();
                    break;
                default:
                    break;
            }
        };

        const clearHover = () => {
            this.hoverCanvasX = null;
            this.hoverCanvasY = null;
            this.hoveredCandle = null;
            this.drawingManager.setHoveredDrawingId(null);
            this.emitCrosshairMove();
            this.redrawDrawings();
        };

        const touchDistance = (touches: TouchList): number => {
            if (touches.length < 2) {
                return 0;
            }
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            return Math.hypot(dx, dy);
        };

        const touchCenter = (touches: TouchList): { x: number; y: number } => {
            if (touches.length === 0) {
                return { x: 0, y: 0 };
            }
            if (touches.length === 1) {
                return { x: touches[0].clientX, y: touches[0].clientY };
            }
            return {
                x: (touches[0].clientX + touches[1].clientX) * 0.5,
                y: (touches[0].clientY + touches[1].clientY) * 0.5,
            };
        };

        const onTouchStart = (event: TouchEvent) => {
            if (event.touches.length === 1) {
                const touch = event.touches[0];
                if (this.handleControlBarClick(touch.clientX, touch.clientY)) {
                    event.preventDefault();
                    touchSelectionArmed = false;
                    clearLongPressTimer();
                    return;
                }

                pinchDistance = null;
                longPressTriggered = false;
                touchSelectionArmed = beginPointerInteraction(touch.clientX, touch.clientY);
                if (touchSelectionArmed) {
                    scheduleLongPress(touch.clientX, touch.clientY);
                }
                event.preventDefault();
                return;
            }

            if (event.touches.length >= 2) {
                clearLongPressTimer();
                const center = touchCenter(event.touches);
                this.updateHoverFromClientPosition(center.x, center.y);
                this.isDragging = false;
                this.drawingManager.setActiveDrag(null);
                this.draggedDuringPointer = true;
                touchSelectionArmed = false;
                pinchDistance = touchDistance(event.touches);
                this.redrawDrawings();
                event.preventDefault();
            }
        };

        const onTouchMove = (event: TouchEvent) => {
            if (event.touches.length >= 2) {
                clearLongPressTimer();
                const nextDistance = touchDistance(event.touches);
                const center = touchCenter(event.touches);
                this.updateHoverFromClientPosition(center.x, center.y);
                if (pinchDistance && nextDistance > 0) {
                    const zoomFactor = pinchDistance / nextDistance;
                    if (Number.isFinite(zoomFactor) && Math.abs(zoomFactor - 1) > 0.001) {
                        this.zoom(zoomFactor, "x");
                    }
                }
                pinchDistance = nextDistance;
                this.draggedDuringPointer = true;
                touchSelectionArmed = false;
                event.preventDefault();
                return;
            }

            if (event.touches.length === 1) {
                const touch = event.touches[0];
                const moveDistance = Math.hypot(touch.clientX - this.lastPointerX, touch.clientY - this.lastPointerY);
                if (moveDistance > touchDragThresholdPx) {
                    clearLongPressTimer();
                    touchSelectionArmed = false;
                }
                movePointerInteraction(touch.clientX, touch.clientY);
                if (this.draggedDuringPointer) {
                    touchSelectionArmed = false;
                    clearLongPressTimer();
                }
                event.preventDefault();
            }
        };

        const onTouchEnd = (event: TouchEvent) => {
            if (event.touches.length >= 2) {
                pinchDistance = touchDistance(event.touches);
                touchSelectionArmed = false;
                clearLongPressTimer();
                event.preventDefault();
                return;
            }

            if (event.touches.length === 1) {
                const touch = event.touches[0];
                pinchDistance = null;
                clearLongPressTimer();
                this.lastPointerX = touch.clientX;
                this.lastPointerY = touch.clientY;
                this.isDragging = true;
                this.drawingManager.setActiveDrag(null);
                this.draggedDuringPointer = true;
                touchSelectionArmed = false;
                event.preventDefault();
                return;
            }

            pinchDistance = null;
            clearLongPressTimer();
            if (longPressTriggered) {
                longPressTriggered = false;
                touchSelectionArmed = false;
                stopDragging();
                event.preventDefault();
                return;
            }

            if (touchSelectionArmed && !this.draggedDuringPointer) {
                activateSelectionFromPointer();
                this.emitClick(this.lastPointerX, this.lastPointerY, "touch");
                const now = performance.now();
                const isDoubleTap = (now - lastTapAt) <= doubleTapDelayMs
                    && Math.hypot(this.lastPointerX - lastTapX, this.lastPointerY - lastTapY) <= doubleTapDistancePx;
                if (isDoubleTap) {
                    this.fitToData();
                    lastTapAt = 0;
                } else {
                    lastTapAt = now;
                    lastTapX = this.lastPointerX;
                    lastTapY = this.lastPointerY;
                }
            }
            touchSelectionArmed = false;
            stopDragging();
            event.preventDefault();
        };

        const onTouchCancel = () => {
            pinchDistance = null;
            touchSelectionArmed = false;
            clearLongPressTimer();
            longPressTriggered = false;
            stopDragging();
        };

        canvas.addEventListener("mousedown", onMouseDown);
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", stopDragging);
        canvas.addEventListener("mouseleave", stopDragging);
        canvas.addEventListener("mouseleave", clearHover);
        canvas.addEventListener("click", onClick);
        canvas.addEventListener("dblclick", onDoubleClick);
        canvas.addEventListener("wheel", onWheel, { passive: false });
        canvas.addEventListener("contextmenu", onContextMenu);
        canvas.addEventListener("touchstart", onTouchStart, { passive: false });
        canvas.addEventListener("touchmove", onTouchMove, { passive: false });
        canvas.addEventListener("touchend", onTouchEnd, { passive: false });
        canvas.addEventListener("touchcancel", onTouchCancel, { passive: false });
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("mousedown", onGlobalDown);

        this.cleanupHandlers.push(() => canvas.removeEventListener("mousedown", onMouseDown));
        this.cleanupHandlers.push(() => window.removeEventListener("mousemove", onMouseMove));
        this.cleanupHandlers.push(() => window.removeEventListener("mouseup", stopDragging));
        this.cleanupHandlers.push(() => canvas.removeEventListener("mouseleave", stopDragging));
        this.cleanupHandlers.push(() => canvas.removeEventListener("mouseleave", clearHover));
        this.cleanupHandlers.push(() => canvas.removeEventListener("click", onClick));
        this.cleanupHandlers.push(() => canvas.removeEventListener("dblclick", onDoubleClick));
        this.cleanupHandlers.push(() => canvas.removeEventListener("wheel", onWheel));
        this.cleanupHandlers.push(() => canvas.removeEventListener("contextmenu", onContextMenu));
        this.cleanupHandlers.push(() => canvas.removeEventListener("touchstart", onTouchStart));
        this.cleanupHandlers.push(() => canvas.removeEventListener("touchmove", onTouchMove));
        this.cleanupHandlers.push(() => canvas.removeEventListener("touchend", onTouchEnd));
        this.cleanupHandlers.push(() => canvas.removeEventListener("touchcancel", onTouchCancel));
        this.cleanupHandlers.push(() => clearLongPressTimer());
        this.cleanupHandlers.push(() => window.removeEventListener("keydown", onKeyDown));
        this.cleanupHandlers.push(() => window.removeEventListener("mousedown", onGlobalDown));
    }

    private detachInteractionHandlers(): void {
        for (const cleanup of this.cleanupHandlers) {
            cleanup();
        }
        this.cleanupHandlers = [];
        this.isDragging = false;
    }

    private isBatchingUpdates(): boolean {
        return this.updateBatch.isBatching();
    }

    private requestRedraw(): void {
        this.updateBatch.requestRedraw();
    }

    private requestHoverRefresh(): void {
        this.updateBatch.requestHoverRefresh();
    }

    private requestVisibleRangeEmit(): void {
        this.updateBatch.requestVisibleRangeEmit();
    }

    private queueIndicatorRecompute(): void {
        this.updateBatch.queueIndicatorRecompute();
    }

    private queueObserverSync(): void {
        this.updateBatch.queueObserverSync();
    }

    private queuePrimarySeriesMutation(): void {
        this.updateBatch.queuePrimarySeriesMutation(() => {
            const primary = this.getPrimaryCandlestickSeriesEntry();
            if (primary) {
                this.syncSeriesToEngine(primary.id);
            }
        });
    }

    private syncSeriesToEngine(seriesId: string): void {
        if (!this.wasmBridge.isReady()) {
            return;
        }

        const series = this.seriesManager.get(seriesId);
        if (!series || series.type !== "candlestick") {
            return;
        }

        // WASM backend currently supports a single primary candlestick series.
        // If multiple candlestick series exist, only the primary one is synced.
        const primary = this.getPrimaryCandlestickSeriesEntry();
        if (primary && primary.id !== seriesId) {
            return;
        }

        this.wasmBridge.syncCandlestickSeries(seriesId, series.data);
    }

    private syncAllSeriesToEngine(): void {
        for (const [seriesId] of this.seriesManager.entries()) {
            this.syncSeriesToEngine(seriesId);
        }
    }

    private syncObserverFrameToEngine(frame: NormalizedObserverFrame): void {
        this.wasmBridge.pushObserverFrame(frame);
    }

    private syncAllObserverFramesToEngine(): void {
        this.wasmBridge.syncObserverFrames(this.observerFrames);
    }

    private applyCameraView(): void {
        this.wasmBridge.applyCameraView(this.currentCenterX, this.currentCenterY, this.currentZoomX, this.currentZoomY);
    }

    private normalizeUiOptions(options: UiOptions): Required<UiOptions> {
        const tickCount = Number.isFinite(options.axisTickCount)
            ? Math.max(3, Math.min(10, Math.floor(options.axisTickCount ?? this.uiOptions.axisTickCount)))
            : this.uiOptions.axisTickCount;
        const pricePrecision = Number.isFinite(options.pricePrecision)
            ? Math.max(0, Math.min(8, Math.floor(options.pricePrecision ?? this.uiOptions.pricePrecision)))
            : this.uiOptions.pricePrecision;
        const tooltipMode = options.tooltipMode
            ? (options.tooltipMode === "fixed" ? "fixed" : "follow")
            : this.uiOptions.tooltipMode;
        const persistState = options.persistState ?? this.uiOptions.persistState;
        const autoScaleY = options.autoScaleY ?? this.uiOptions.autoScaleY;

        return {
            showAxes: options.showAxes ?? this.uiOptions.showAxes,
            showCrosshair: options.showCrosshair ?? this.uiOptions.showCrosshair,
            showTooltip: options.showTooltip ?? this.uiOptions.showTooltip,
            showControlBar: options.showControlBar ?? this.uiOptions.showControlBar,
            tooltipMode,
            persistState,
            autoScaleY,
            axisTickCount: tickCount,
            pricePrecision,
        };
    }

    private toggleUiFlag(flag: "showAxes" | "showCrosshair" | "showTooltip"): void {
        this.uiOptions = {
            ...this.uiOptions,
            [flag]: !this.uiOptions[flag],
        };
        persistChartState(this.canvasId, this.uiOptions, this.analyticsOptions);
        this.redrawDrawings();
    }

    private toggleTooltipMode(): void {
        this.uiOptions = {
            ...this.uiOptions,
            tooltipMode: this.uiOptions.tooltipMode === "follow" ? "fixed" : "follow",
        };
        persistChartState(this.canvasId, this.uiOptions, this.analyticsOptions);
        this.redrawDrawings();
    }

    private toggleAutoScaleY(): void {
        this.uiOptions = {
            ...this.uiOptions,
            autoScaleY: !this.uiOptions.autoScaleY,
        };
        persistChartState(this.canvasId, this.uiOptions, this.analyticsOptions);
        this.autoScaleVisibleY();
        this.redrawDrawings();
    }

    private toggleAnalyticsFlag(flag: "showHeatmap"): void {
        this.analyticsOptions = {
            ...this.analyticsOptions,
            [flag]: !this.analyticsOptions[flag],
        };
        persistChartState(this.canvasId, this.uiOptions, this.analyticsOptions);
        this.redrawDrawings();
    }

    private toggleAnalyticsPanel(): void {
        const isVisible = this.analyticsOptions.showRewardCurve || this.analyticsOptions.showPnlCurve;
        this.analyticsOptions = {
            ...this.analyticsOptions,
            showRewardCurve: !isVisible,
            showPnlCurve: !isVisible,
        };
        persistChartState(this.canvasId, this.uiOptions, this.analyticsOptions);
        this.redrawDrawings();
    }

    private setSelectedCandleIndex(index: number | null): void {
        const selectionChanged = this.selectedCandleIndex !== index;
        this.selectedCandleIndex = index;
        this.hoveredCandle = null;
        this.hoverCanvasX = null;
        this.hoverCanvasY = null;
        this.redrawDrawings();
        if (selectionChanged) {
            this.emitSelectionChange();
        }
        this.emitCrosshairMove();
    }

    private moveSelection(step: number): void {
        const geometry = this.buildSeriesGeometry();
        if (!geometry || geometry.candles.length === 0) {
            return;
        }
        const nextIndex = resolveSteppedSelectionIndex(
            this.selectedCandleIndex,
            this.hoveredCandle,
            geometry.candles.length,
            step
        );
        this.setSelectedCandleIndex(nextIndex);
    }

    private jumpSelection(to: "start" | "end"): void {
        const geometry = this.buildSeriesGeometry();
        if (!geometry || geometry.candles.length === 0) {
            return;
        }
        this.setSelectedCandleIndex(resolveBoundarySelectionIndex(geometry.candles.length, to));
    }

    private autoScaleVisibleY(): void {
        if (!this.uiOptions.autoScaleY) {
            return;
        }
        const geometry = this.buildSeriesGeometry();
        const surface = this.overlayCanvas ?? this.canvas;
        if (!geometry || !surface) {
            return;
        }
        const width = surface.width || 1;
        const height = surface.height || 1;
        const range = this.getVisibleCandleIndexRange(geometry, width, height, 3);
        if (range.end < range.start) {
            return;
        }

        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        let count = 0;
        for (let i = range.start; i <= range.end; i += 1) {
            const candle = geometry.candles[i];
            minY = Math.min(minY, candle.low, candle.open, candle.close, candle.high);
            maxY = Math.max(maxY, candle.high, candle.open, candle.close, candle.low);
            count += 1;
        }
        if (count === 0 || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
            return;
        }

        const padding = 0.08;
        const targetHalfHeight = Math.max(0.2, ((maxY - minY) * 0.5) + padding);
        const nextCenterY = (minY + maxY) * 0.5;
        const nextZoomY = targetHalfHeight > this.currentZoomY ? Math.min(5.0, targetHalfHeight) : this.currentZoomY;

        if (Math.abs(nextCenterY - this.currentCenterY) > 1e-4 || Math.abs(nextZoomY - this.currentZoomY) > 1e-4) {
            this.currentCenterY = nextCenterY;
            this.currentZoomY = Math.min(5.0, Math.max(0.2, nextZoomY));
            this.applyCameraView();
        }
    }

    private getCanvasPointFromClientPosition(clientX: number, clientY: number): ScreenPoint | null {

        const surface = this.overlayCanvas ?? this.canvas;
        if (!surface) {
            return null;
        }

        const rect = surface.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            return null;
        }

        return {
            x: ((clientX - rect.left) / rect.width) * surface.width,
            y: ((clientY - rect.top) / rect.height) * surface.height,
        };
    }

    private getControlButtonAtClientPosition(clientX: number, clientY: number): ControlButtonState | null {
        if (!this.uiOptions.showControlBar || this.controlButtons.length === 0) {
            return null;
        }

        const point = this.getCanvasPointFromClientPosition(clientX, clientY);
        if (!point) {
            return null;
        }

        return this.controlButtons.find((button) =>
            point.x >= button.x &&
            point.x <= (button.x + button.width) &&
            point.y >= button.y &&
            point.y <= (button.y + button.height)
        ) ?? null;
    }

    private handleControlBarClick(clientX: number, clientY: number): boolean {
        const hit = this.getControlButtonAtClientPosition(clientX, clientY);
        if (!hit) {
            return false;
        }

        switch (hit.id) {
            case "fit":
                this.fitToData();
                break;
            case "axes":
                this.toggleUiFlag("showAxes");
                break;
            case "crosshair":
                this.toggleUiFlag("showCrosshair");
                break;
            case "tooltip":
                this.toggleUiFlag("showTooltip");
                break;
            case "tooltip_mode":
                this.toggleTooltipMode();
                break;
            case "autoscale":
                this.toggleAutoScaleY();
                break;
            case "heatmap":
                this.toggleAnalyticsFlag("showHeatmap");
                break;
            case "analytics":
                this.toggleAnalyticsPanel();
                break;
            default:
                return false;
        }

        return true;
    }

    private worldToCanvasPoint(worldX: number, worldY: number, width: number, height: number): ScreenPoint {
        const safeWidth = Math.max(1, width);
        const safeHeight = Math.max(1, height);
        const halfHeight = this.currentZoomY;
        const halfWidth = this.currentZoomX;
        const left = this.currentCenterX - halfWidth;
        const bottom = this.currentCenterY - halfHeight;

        return {
            x: ((worldX - left) / (halfWidth * 2.0)) * safeWidth,
            y: safeHeight - (((worldY - bottom) / (halfHeight * 2.0)) * safeHeight),
        };
    }

    private canvasToWorldPoint(canvasX: number, canvasY: number, width: number, height: number): WorldPoint {
        const safeWidth = Math.max(1, width);
        const safeHeight = Math.max(1, height);
        const halfHeight = this.currentZoomY;
        const halfWidth = this.currentZoomX;
        const left = this.currentCenterX - halfWidth;
        const bottom = this.currentCenterY - halfHeight;

        return {
            x: left + ((canvasX / safeWidth) * halfWidth * 2.0),
            y: bottom + (((safeHeight - canvasY) / safeHeight) * halfHeight * 2.0),
        };
    }

    private getVisibleCandleIndexRange(
        geometry: SeriesGeometry,
        width: number,
        height: number,
        padding: number = 2
    ): { start: number; end: number } {
        const candles = geometry.candles;
        const count = candles.length;
        if (count === 0) {
            return { start: 0, end: -1 };
        }
        if (count === 1) {
            return { start: 0, end: 0 };
        }

        const safeWidth = Math.max(1, width);
        const safeHeight = Math.max(1, height);
        const halfWidth = this.currentZoomX;
        const left = this.currentCenterX - halfWidth;
        const right = this.currentCenterX + halfWidth;

        const startX = candles[0].x;
        const stepX = candles[1].x - startX;
        if (Math.abs(stepX) < 1e-9) {
            return { start: 0, end: count - 1 };
        }

        const rawStart = Math.floor((left - startX) / stepX) - padding;
        const rawEnd = Math.ceil((right - startX) / stepX) + padding;
        const start = Math.max(0, Math.min(count - 1, rawStart));
        const end = Math.max(0, Math.min(count - 1, rawEnd));
        return start <= end ? { start, end } : { start: 0, end: -1 };
    }

    private getWorldUnitsPerPixel(width: number, height: number): { x: number; y: number } {
        const safeWidth = Math.max(1, width);
        const safeHeight = Math.max(1, height);
        const aspect = safeWidth / safeHeight;
        return {
            x: (2.0 * this.currentZoomX) / safeWidth,
            y: (2.0 * this.currentZoomY) / safeHeight,
        };
    }

    private updateHoveredDrawingFromCanvas(canvasX: number, canvasY: number, width: number, height: number): void {
        const world = this.canvasToWorldPoint(canvasX, canvasY, width, height);
        const geometry = this.buildSeriesGeometry();
        const hit = this.drawingManager.hitTestDrawing(world, width, height, geometry, this.drawingHitTestApi);
        this.drawingManager.setHoveredDrawingId(hit ? hit.id : null);
    }

    private getPrimaryCandlestickSeriesEntry(): { id: string; data: CandleDataPoint[]; revision: number } | null {
        for (const [id, series] of this.seriesManager.entries()) {
            if (series.type === "candlestick" && series.data.length > 0) {
                return { id, data: series.data, revision: series.revision };
            }
        }
        return null;
    }

    private getPrimaryCandlestickSeries(): CandleDataPoint[] {
        const entry = this.getPrimaryCandlestickSeriesEntry();
        return entry ? entry.data : [];
    }

    private getPrimarySeriesStats(): PrimarySeriesStats | null {
        const entry = this.getPrimaryCandlestickSeriesEntry();
        const gapMode = this.timeAxisOptions.gapMode;
        if (!entry) {
            this.primarySeriesStatsCache = null;
            return null;
        }

        const cache = this.primarySeriesStatsCache;
        if (
            cache
            && cache.seriesId === entry.id
            && cache.revision === entry.revision
            && cache.gapMode === gapMode
        ) {
            return cache.stats;
        }

        const stats = buildPrimarySeriesStats(entry, {
            preserveGaps: this.timeAxisOptions.gapMode === "preserve",
            toNumericTime: this.toNumericTime.bind(this),
            isLikelyTimestamp: this.isLikelyTimestamp.bind(this),
            normalizeTimestampMs: this.normalizeTimestampMs.bind(this),
        });
        this.primarySeriesStatsCache = {
            seriesId: entry.id,
            revision: entry.revision,
            gapMode,
            stats,
        };
        return stats;
    }

    private buildSeriesGeometry(): SeriesGeometry | null {
        const stats = this.getPrimarySeriesStats();
        if (!stats) {
            return null;
        }

        const entry = stats.entry;

        if (this.geometryCache && this.geometryCache.seriesId === entry.id && this.geometryCache.revision === entry.revision) {
            return this.geometryCache.geometry;
        }

        const geometry = buildPrimarySeriesGeometry(stats, {
            toNumericTime: this.toNumericTime.bind(this),
            normalizeTimestampMs: this.normalizeTimestampMs.bind(this),
        });
        this.geometryCache = { seriesId: entry.id, revision: entry.revision, geometry };
        this.timeSeriesCache = null;
        return geometry;
    }

    private recomputeIndicators(): void {
        this.indicatorPaneManager.recompute(this.getPrimaryCandlestickSeries());
    }

    private formatPrice(value: number): string {
        return value.toFixed(this.uiOptions.pricePrecision);
    }

    private formatTimeLabel(value: number | string, spanHintMs: number | null = null): string {
        if (typeof value === "number") {
            if (this.isLikelyTimestamp(value)) {
                return this.formatTimestampLabel(this.normalizeTimestampMs(value), spanHintMs);
            }
            if (Number.isInteger(value)) {
                return String(value);
            }
            return Number(value).toFixed(2);
        }

        const parsedDate = Date.parse(value);
        if (Number.isFinite(parsedDate)) {
            return this.formatTimestampLabel(parsedDate, spanHintMs);
        }
        return String(value);
    }

    private formatTimestampLabel(timestampMs: number, spanHintMs: number | null = null): string {
        const date = new Date(timestampMs);
        if (!Number.isFinite(date.getTime())) {
            return String(timestampMs);
        }

        const formatterOptions: Intl.DateTimeFormatOptions = {
            timeZone: this.timeAxisOptions.timezone,
        };

        if (spanHintMs === null) {
            formatterOptions.month = "short";
            formatterOptions.day = "2-digit";
            formatterOptions.hour = "2-digit";
            formatterOptions.minute = "2-digit";
            return new Intl.DateTimeFormat(undefined, formatterOptions).format(date);
        }

        if (spanHintMs <= (12 * 60 * 60 * 1000)) {
            formatterOptions.hour = "2-digit";
            formatterOptions.minute = "2-digit";
            return new Intl.DateTimeFormat(undefined, formatterOptions).format(date);
        }

        if (spanHintMs <= (3 * 24 * 60 * 60 * 1000)) {
            formatterOptions.month = "short";
            formatterOptions.day = "2-digit";
            formatterOptions.hour = "2-digit";
            formatterOptions.minute = "2-digit";
            return new Intl.DateTimeFormat(undefined, formatterOptions).format(date);
        }

        if (spanHintMs <= (180 * 24 * 60 * 60 * 1000)) {
            formatterOptions.month = "short";
            formatterOptions.day = "2-digit";
            return new Intl.DateTimeFormat(undefined, formatterOptions).format(date);
        }

        formatterOptions.year = "numeric";
        formatterOptions.month = "short";
        return new Intl.DateTimeFormat(undefined, formatterOptions).format(date);
    }

    private worldYToPriceValueInternal(worldY: number, geometry: SeriesGeometry): number {
        return geometry.minPrice + ((worldY + 0.85) / geometry.scale);
    }

    private priceToWorldYValue(price: number, geometry: SeriesGeometry): number {
        return ((price - geometry.minPrice) * geometry.scale) - 0.85;
    }

    private resolveSeriesValue(point: CandleDataPoint, key: SeriesValueKey): number | null {
        switch (key) {
            case "open":
                return point.open;
            case "high":
                return point.high;
            case "low":
                return point.low;
            case "close":
                return point.close;
            case "volume":
                return point.volume ?? null;
            case "value":
                return point.value ?? null;
            default:
                return null;
        }
    }

    private isCompleteCandle(point: Partial<CandleDataPoint>): point is CandleDataPoint {
        if (!point || point.time === undefined || point.time === null) {
            return false;
        }
        const open = Number(point.open);
        const high = Number(point.high);
        const low = Number(point.low);
        const close = Number(point.close);
        return Number.isFinite(open) && Number.isFinite(high) && Number.isFinite(low) && Number.isFinite(close);
    }
    private niceStep(rawStep: number): number {
        if (!Number.isFinite(rawStep) || rawStep <= 0) {
            return 1;
        }
        const exponent = Math.floor(Math.log10(rawStep));
        const power = Math.pow(10, exponent);
        const fraction = rawStep / power;
        if (fraction <= 1) return power;
        if (fraction <= 2) return 2 * power;
        if (fraction <= 5) return 5 * power;
        return 10 * power;
    }

    private buildNiceTicks(minValue: number, maxValue: number, targetCount: number): number[] {
        if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
            return [];
        }

        if (Math.abs(maxValue - minValue) < 1e-9) {
            return [minValue];
        }

        const desired = Math.max(2, targetCount);
        const rawStep = Math.abs(maxValue - minValue) / Math.max(1, desired - 1);
        const step = this.niceStep(rawStep);
        const start = Math.ceil(minValue / step) * step;
        const ticks: number[] = [];

        for (let value = start; value <= (maxValue + (step * 0.5)); value += step) {
            ticks.push(Number(value.toFixed(8)));
            if (ticks.length > 200) {
                break;
            }
        }

        if (ticks.length === 0) {
            ticks.push(Number(minValue.toFixed(8)));
            ticks.push(Number(maxValue.toFixed(8)));
        }

        return ticks;
    }

    private toNumericTime(value: number | string): number | null {
        if (typeof value === "number") {
            return Number.isFinite(value) ? value : null;
        }
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
        const parsedDate = Date.parse(value);
        return Number.isFinite(parsedDate) ? parsedDate : null;
    }

    private isLikelyTimestamp(value: number | null): value is number {
        return value !== null && Number.isFinite(value) && Math.abs(value) >= 1e9;
    }

    private normalizeTimestampMs(value: number): number {
        return Math.abs(value) < 1e12 ? value * 1000 : value;
    }

    private buildTemporalTicks(minTimeMs: number, maxTimeMs: number, targetCount: number): number[] {
        const span = Math.max(1, maxTimeMs - minTimeMs);
        const desired = Math.max(2, targetCount);
        const candidates = [
            60 * 1000,
            5 * 60 * 1000,
            15 * 60 * 1000,
            30 * 60 * 1000,
            60 * 60 * 1000,
            2 * 60 * 60 * 1000,
            4 * 60 * 60 * 1000,
            6 * 60 * 60 * 1000,
            12 * 60 * 60 * 1000,
            24 * 60 * 60 * 1000,
            2 * 24 * 60 * 60 * 1000,
            7 * 24 * 60 * 60 * 1000,
            30 * 24 * 60 * 60 * 1000,
            90 * 24 * 60 * 60 * 1000,
            365 * 24 * 60 * 60 * 1000,
        ];

        let step = candidates[candidates.length - 1];
        for (const candidate of candidates) {
            if ((span / candidate) <= (desired * 1.35)) {
                step = candidate;
                break;
            }
        }

        const start = Math.ceil(minTimeMs / step) * step;
        const ticks: number[] = [];
        for (let value = start; value <= (maxTimeMs + (step * 0.5)); value += step) {
            ticks.push(value);
            if (ticks.length > 256) {
                break;
            }
        }

        if (ticks.length === 0) {
            ticks.push(minTimeMs, maxTimeMs);
        }

        return ticks;
    }

    private buildTimeSeries(geometry: SeriesGeometry): Array<{ time: number | string; numeric: number | null; x: number }> {
        const geometryCache = this.geometryCache;
        const cache = this.timeSeriesCache;
        if (
            geometryCache
            && geometryCache.geometry === geometry
            && cache
            && cache.seriesId === geometryCache.seriesId
            && cache.revision === geometryCache.revision
        ) {
            return cache.series;
        }

        const series = geometry.candles.map((candle) => ({
            time: candle.source.time,
            numeric: this.toNumericTime(candle.source.time),
            x: candle.x,
        }));

        if (geometryCache && geometryCache.geometry === geometry) {
            this.timeSeriesCache = { seriesId: geometryCache.seriesId, revision: geometryCache.revision, series };
        }

        return series;
    }

    private timeToWorldXInternal(time: number | string, geometry: SeriesGeometry): number | null {
        const series = this.buildTimeSeries(geometry);
        if (series.length === 0) {
            return null;
        }

        const numericTarget = this.toNumericTime(time);
        if (numericTarget === null) {
            const match = series.find((entry) => entry.time === time);
            return match ? match.x : null;
        }

        const numericSeries = series.filter((entry) => entry.numeric !== null) as Array<{ time: number | string; numeric: number; x: number }>;
        if (numericSeries.length === 0) {
            return null;
        }

        let lower = numericSeries[0];
        let upper = numericSeries[numericSeries.length - 1];

        for (const entry of numericSeries) {
            if (entry.numeric <= numericTarget && entry.numeric >= lower.numeric) {
                lower = entry;
            }
            if (entry.numeric >= numericTarget && entry.numeric <= upper.numeric) {
                upper = entry;
            }
        }

        if (Math.abs(upper.numeric - lower.numeric) < 1e-9) {
            return lower.x;
        }

        const t = (numericTarget - lower.numeric) / (upper.numeric - lower.numeric);
        return lower.x + ((upper.x - lower.x) * t);
    }

    private worldXToTimeInternal(worldX: number, geometry: SeriesGeometry): number | string | null {
        const candles = geometry.candles;
        if (candles.length === 0) {
            return null;
        }
        if (candles.length === 1) {
            return candles[0].source.time;
        }

        const stepX = candles[1].x - candles[0].x;
        if (Math.abs(stepX) < 1e-9) {
            return candles[0].source.time;
        }

        const indexFloat = (worldX - candles[0].x) / stepX;
        const lowerIndex = Math.max(0, Math.min(candles.length - 1, Math.floor(indexFloat)));
        const upperIndex = Math.max(0, Math.min(candles.length - 1, Math.ceil(indexFloat)));
        if (lowerIndex === upperIndex) {
            return candles[lowerIndex].source.time;
        }

        const lower = candles[lowerIndex];
        const upper = candles[upperIndex];
        const lowerTime = this.toNumericTime(lower.source.time);
        const upperTime = this.toNumericTime(upper.source.time);
        if (lowerTime !== null && upperTime !== null) {
            const t = (indexFloat - lowerIndex) / Math.max(1e-6, upperIndex - lowerIndex);
            return lowerTime + ((upperTime - lowerTime) * t);
        }

        const nearest = Math.round(indexFloat);
        const clamped = Math.max(0, Math.min(candles.length - 1, nearest));
        return candles[clamped].source.time;
    }

    private buildVisibleTimeLabels(
        geometry: SeriesGeometry,
        width: number,
        height: number,
        targetCount: number
    ): TimeAxisLabel[] {
        const candles = geometry.candles;
        if (candles.length === 0) {
            return [];
        }

        const range = this.getVisibleCandleIndexRange(geometry, width, height, 0);
        const rangeSize = Math.max(0, (range.end - range.start) + 1);
        const desiredSource = Math.max(24, Math.min(rangeSize, Math.max(120, targetCount * 12)));
        const sampleStep = rangeSize > 0 ? Math.max(1, Math.floor(rangeSize / desiredSource)) : 1;

        const source: Array<{ index: number; candle: NormalizedCandleDataPoint; x: number; timeValue: number | null }> = [];
        if (rangeSize > 0) {
            for (let i = range.start; i <= range.end; i += sampleStep) {
                const candle = candles[i];
                source.push({
                    index: i,
                    candle,
                    x: this.worldToCanvasPoint(candle.x, 0, width, height).x,
                    timeValue: this.toNumericTime(candle.source.time),
                });
            }
            if (source.length > 0 && source[source.length - 1].index !== range.end) {
                const candle = candles[range.end];
                source.push({
                    index: range.end,
                    candle,
                    x: this.worldToCanvasPoint(candle.x, 0, width, height).x,
                    timeValue: this.toNumericTime(candle.source.time),
                });
            }
        }

        if (source.length === 0) {
            const step = Math.max(1, Math.floor(candles.length / Math.max(2, targetCount)));
            for (let i = 0; i < candles.length; i += step) {
                const candle = candles[i];
                source.push({
                    index: i,
                    candle,
                    x: this.worldToCanvasPoint(candle.x, 0, width, height).x,
                    timeValue: this.toNumericTime(candle.source.time),
                });
            }
            if (source.length > 0 && source[source.length - 1].index !== (candles.length - 1)) {
                const candle = candles[candles.length - 1];
                source.push({
                    index: candles.length - 1,
                    candle,
                    x: this.worldToCanvasPoint(candle.x, 0, width, height).x,
                    timeValue: this.toNumericTime(candle.source.time),
                });
            }
        }

        if (source.length === 0) {
            return [];
        }

        const labels: TimeAxisLabel[] = [];
        const numericEntries = source.filter((entry) => entry.timeValue !== null) as Array<{
            index: number;
            candle: NormalizedCandleDataPoint;
            x: number;
            timeValue: number;
        }>;

        if (numericEntries.length === source.length) {
            const useTemporalTicks = numericEntries.length > 1 && numericEntries.every((entry) => this.isLikelyTimestamp(entry.timeValue));
            if (useTemporalTicks) {
                const normalizedEntries = numericEntries.map((entry) => ({
                    ...entry,
                    timestampMs: this.normalizeTimestampMs(entry.timeValue),
                }));
                const minTime = normalizedEntries[0].timestampMs;
                const maxTime = normalizedEntries[normalizedEntries.length - 1].timestampMs;
                const spanHintMs = Math.max(1, maxTime - minTime);
                const ticks = this.buildTemporalTicks(minTime, maxTime, targetCount);
                const used = new Set<number>();
                for (const tick of ticks) {
                    let nearest = normalizedEntries[0];
                    let nearestDistance = Math.abs(nearest.timestampMs - tick);
                    for (let i = 1; i < normalizedEntries.length; i += 1) {
                        const candidate = normalizedEntries[i];
                        const distance = Math.abs(candidate.timestampMs - tick);
                        if (distance < nearestDistance) {
                            nearest = candidate;
                            nearestDistance = distance;
                        }
                    }
                    if (used.has(nearest.index)) {
                        continue;
                    }
                    used.add(nearest.index);
                    labels.push({
                        x: nearest.x,
                        text: this.formatTimeLabel(nearest.candle.source.time, spanHintMs),
                    });
                }
                labels.sort((a, b) => a.x - b.x);
                return labels;
            }

            const minTime = numericEntries[0].timeValue;
            const maxTime = numericEntries[numericEntries.length - 1].timeValue;
            const ticks = this.buildNiceTicks(minTime, maxTime, targetCount);
            const used = new Set<number>();
            for (const tick of ticks) {
                let nearest = numericEntries[0];
                let nearestDistance = Math.abs(nearest.timeValue - tick);
                for (let i = 1; i < numericEntries.length; i += 1) {
                    const candidate = numericEntries[i];
                    const distance = Math.abs(candidate.timeValue - tick);
                    if (distance < nearestDistance) {
                        nearest = candidate;
                        nearestDistance = distance;
                    }
                }
                if (used.has(nearest.index)) {
                    continue;
                }
                used.add(nearest.index);
                labels.push({
                    x: nearest.x,
                    text: this.formatTimeLabel(nearest.candle.source.time),
                });
            }
            labels.sort((a, b) => a.x - b.x);
            return labels;
        }

        const step = Math.max(1, Math.floor(source.length / Math.max(2, targetCount)));
        for (let i = 0; i < source.length; i += step) {
            const entry = source[i];
            labels.push({
                x: entry.x,
                text: this.formatTimeLabel(entry.candle.source.time),
            });
        }
        if (labels.length > 0) {
            const last = source[source.length - 1];
            const lastLabel = this.formatTimeLabel(last.candle.source.time);
            if (labels[labels.length - 1].text !== lastLabel) {
                labels.push({ x: last.x, text: lastLabel });
            }
        }
        return labels;
    }

    private getCandleByIndex(index: number | null, geometry: SeriesGeometry | null): HoveredCandle | null {
        if (index === null || !geometry || index < 0 || index >= geometry.candles.length) {
            return null;
        }

        const surface = this.overlayCanvas ?? this.canvas;
        if (!surface) {
            return null;
        }

        const candle = geometry.candles[index];
        const closePoint = this.worldToCanvasPoint(candle.x, candle.close, surface.width, surface.height);
        return {
            index,
            time: candle.source.time,
            open: candle.source.open,
            high: candle.source.high,
            low: candle.source.low,
            close: candle.source.close,
            screenX: closePoint.x,
            screenY: closePoint.y,
            worldX: candle.x,
        };
    }

    private updateHoverFromClientPosition(clientX: number, clientY: number): void {
        const surface = this.overlayCanvas ?? this.canvas;
        if (!surface) {
            this.hoveredCandle = null;
            this.drawingManager.setHoveredDrawingId(null);
            return;
        }

        const rect = surface.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            this.hoveredCandle = null;
            this.drawingManager.setHoveredDrawingId(null);
            return;
        }

        const canvasX = ((clientX - rect.left) / rect.width) * surface.width;
        const canvasY = ((clientY - rect.top) / rect.height) * surface.height;
        if (canvasX < 0 || canvasX > surface.width || canvasY < 0 || canvasY > surface.height) {
            this.hoverCanvasX = null;
            this.hoverCanvasY = null;
            this.hoveredCandle = null;
            this.drawingManager.setHoveredDrawingId(null);
            this.emitCrosshairMove();
            return;
        }

        this.hoverCanvasX = canvasX;
        this.hoverCanvasY = canvasY;

        const geometry = this.buildSeriesGeometry();
        if (!geometry || geometry.candles.length === 0) {
            this.hoveredCandle = null;
            this.emitCrosshairMove();
            return;
        }

        const candles = geometry.candles;
        let index = 0;
        if (candles.length > 1) {
            const world = this.canvasToWorldPoint(canvasX, canvasY, surface.width, surface.height);
            const startX = candles[0].x;
            const stepX = candles[1].x - startX;
            if (Math.abs(stepX) > 1e-9) {
                index = Math.round((world.x - startX) / stepX);
                index = Math.max(0, Math.min(candles.length - 1, index));
            }
        }

        this.hoveredCandle = this.getCandleByIndex(index, geometry);

        this.updateHoveredDrawingFromCanvas(canvasX, canvasY, surface.width, surface.height);
        this.emitCrosshairMove();
    }

    private refreshHoverFromStoredPointer(): void {
        const surface = this.overlayCanvas ?? this.canvas;
        if (!surface || this.hoverCanvasX === null || this.hoverCanvasY === null) {
            return;
        }

        const rect = surface.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            return;
        }

        const clientX = rect.left + ((this.hoverCanvasX / surface.width) * rect.width);
        const clientY = rect.top + ((this.hoverCanvasY / surface.height) * rect.height);
        this.updateHoverFromClientPosition(clientX, clientY);
    }

    private attachResizeHandling(): void {
        if (!this.canvas) {
            return;
        }

        const resizeTarget = this.canvas.parentElement ?? this.canvas;
        let rafId = 0;
        const queueResize = () => {
            if (rafId !== 0) {
                return;
            }
            rafId = window.requestAnimationFrame(() => {
                rafId = 0;
                this.syncCanvasSize();
            });
        };

        if (typeof ResizeObserver !== "undefined") {
            const observer = new ResizeObserver(() => queueResize());
            observer.observe(resizeTarget);
            this.cleanupHandlers.push(() => observer.disconnect());
        } else {
            window.addEventListener("resize", queueResize);
            this.cleanupHandlers.push(() => window.removeEventListener("resize", queueResize));
        }

        this.cleanupHandlers.push(() => {
            if (rafId !== 0) {
                window.cancelAnimationFrame(rafId);
                rafId = 0;
            }
        });
    }

    private syncCanvasSize(): void {
        if (!this.canvas) {
            return;
        }

        const { cssWidth, cssHeight } = this.resolveCanvasCssSize(this.canvas);
        const pixelRatio = this.resolvePixelRatio();
        const nextWidth = Math.max(1, Math.round(cssWidth * pixelRatio));
        const nextHeight = Math.max(1, Math.round(cssHeight * pixelRatio));

        this.canvas.style.width = `${cssWidth}px`;
        this.canvas.style.height = `${cssHeight}px`;

        let sizeChanged = false;
        if (this.canvas.width !== nextWidth || this.canvas.height !== nextHeight) {
            this.canvas.width = nextWidth;
            this.canvas.height = nextHeight;
            sizeChanged = true;
            this.lastTimeScaleKey = null;
        }

        if (this.overlayCanvas) {
            this.overlayCanvas.style.width = `${cssWidth}px`;
            this.overlayCanvas.style.height = `${cssHeight}px`;
            if (this.overlayCanvas.width !== nextWidth || this.overlayCanvas.height !== nextHeight) {
                this.overlayCanvas.width = nextWidth;
                this.overlayCanvas.height = nextHeight;
                sizeChanged = true;
            }
        }

        if (!sizeChanged) {
            return;
        }

        this.wasmBridge.resizeViewport(nextWidth, nextHeight);
        this.refreshHoverFromStoredPointer();
        this.redrawDrawings();
        this.requestVisibleRangeEmit();
    }

    private resolveCanvasCssSize(baseCanvas: HTMLCanvasElement): { cssWidth: number; cssHeight: number } {
        let cssWidth = 0;
        let cssHeight = 0;

        if (this.autoResize && baseCanvas.parentElement) {
            const rect = baseCanvas.parentElement.getBoundingClientRect();
            cssWidth = Math.round(rect.width);
            cssHeight = Math.round(rect.height);
        }

        if (cssWidth <= 0 || cssHeight <= 0) {
            const rect = baseCanvas.getBoundingClientRect();
            cssWidth = cssWidth > 0 ? cssWidth : Math.round(rect.width);
            cssHeight = cssHeight > 0 ? cssHeight : Math.round(rect.height);
        }

        if (cssWidth <= 0) {
            cssWidth = this.width ?? baseCanvas.width ?? 800;
        }
        if (cssHeight <= 0) {
            cssHeight = this.height ?? baseCanvas.height ?? 600;
        }

        return {
            cssWidth: Math.max(1, cssWidth),
            cssHeight: Math.max(1, cssHeight),
        };
    }

    private resolvePixelRatio(): number {
        const rawPixelRatio = this.pixelRatio ?? window.devicePixelRatio ?? 1;
        return Number.isFinite(rawPixelRatio) && rawPixelRatio > 0
            ? rawPixelRatio
            : 1;
    }

    private initializeOverlayCanvas(baseCanvas: HTMLCanvasElement): void {
        const parent = baseCanvas.parentElement;
        if (!parent) {
            return;
        }

        if (getComputedStyle(parent).position === "static") {
            parent.style.position = "relative";
        }

        const overlay = document.createElement("canvas");
        overlay.width = baseCanvas.width;
        overlay.height = baseCanvas.height;
        overlay.style.position = "absolute";
        overlay.style.left = "0";
        overlay.style.top = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.pointerEvents = "none";

        if (getComputedStyle(parent).position === "static") {
            parent.style.position = "relative";
        }

        const menu = createDrawingContextMenu(this.theme, () => {
            const id = this.drawingManager.consumeContextMenuTarget();
            if (id) {
                this.removeDrawing(id, "contextMenu");
            }
        });

        parent.appendChild(menu);

        parent.appendChild(overlay);
        this.overlayCanvas = overlay;
        this.overlayCtx = overlay.getContext("2d");
        this.drawingManager.attachOverlay(overlay, menu);
        this.drawingManager.applyMenuTheme(this.theme);
    }

    private redrawDrawings(): void {
        if (!this.overlayCanvas || !this.overlayCtx) {
            return;
        }

        const startMs = this.perfTracker.nowMs();

        const ctx = this.overlayCtx;
        const width = this.overlayCanvas.width;
        const height = this.overlayCanvas.height;
        ctx.clearRect(0, 0, width, height);
        const geometry = this.shouldBuildOverlayGeometry() ? this.buildSeriesGeometry() : null;

        const hoveredDrawingId = this.drawingManager.getHoveredDrawingId();
        const activeDrawingId = this.drawingManager.getActiveDrawingId();

        const worldToCanvas = (x: number, y: number): { x: number; y: number } =>
            this.worldToCanvasPoint(x, y, width, height);
        const toCanvas = (point: DrawingPoint): { x: number; y: number } => worldToCanvas(point.x, point.y);

        renderDrawingOverlay(ctx, this.drawingManager.values(), {
            hoveredDrawingId,
            activeDrawingId,
            currentCenterX: this.currentCenterX,
            currentCenterY: this.currentCenterY,
            theme: this.theme,
            worldToCanvas,
        });

        this.renderSeriesOverlay(ctx, width, height, geometry);
        this.renderAxesOverlay(ctx, width, height, geometry);
        renderIndicatorOverlay(ctx, width, height, geometry, this.indicatorPaneManager.values(), {
            getIndicatorPaneBounds: this.getIndicatorPaneBounds.bind(this),
            getVisibleCandleIndexRange: this.getVisibleCandleIndexRange.bind(this),
            worldToCanvasPoint: this.worldToCanvasPoint.bind(this),
            priceToWorldYValue: this.priceToWorldYValue.bind(this),
        }, this.theme);
        renderAnalyticsOverlayUi(ctx, width, height, this.observerFrames, this.analyticsOptions, toCanvas, this.theme);
        renderSelectedCandleOverlay(ctx, height, this.getCandleByIndex(this.selectedCandleIndex, geometry), this.theme);
        this.renderCrosshairOverlay(ctx, width, height, geometry);
        this.renderTooltipOverlay(ctx, width, height, geometry);
        this.renderControlBarOverlay(ctx, width, height);
        this.perfTracker.recordSample(this.perfTracker.nowMs() - startMs);
    }

    private hasOverlaySeriesData(): boolean {
        for (const series of this.seriesManager.values()) {
            if (series.type !== "candlestick" && series.data.length > 0) {
                return true;
            }
        }
        return false;
    }

    private shouldBuildOverlayGeometry(): boolean {
        if (this.selectedCandleIndex !== null || this.hoveredCandle !== null) {
            return true;
        }
        if (this.uiOptions.showAxes) {
            return true;
        }
        if (this.uiOptions.showCrosshair && (this.hoverCanvasX !== null || this.hoverCanvasY !== null)) {
            return true;
        }
        if (this.uiOptions.showTooltip && (this.hoverCanvasX !== null || this.hoverCanvasY !== null)) {
            return true;
        }
        if (this.indicatorPaneManager.getLowerIndicators().length > 0) {
            return true;
        }
        return this.hasOverlaySeriesData();
    }

    private renderSeriesOverlay(
        ctx: CanvasRenderingContext2D,
        width: number,
        height: number,
        geometry: SeriesGeometry | null
    ): void {
        if (!geometry) {
            return;
        }

        const candles = geometry.candles;
        if (candles.length === 0) {
            return;
        }

        const extraSeries = Array.from(this.seriesManager.values()).filter((series) => series.type !== "candlestick" && series.data.length > 0);
        if (extraSeries.length === 0) {
            return;
        }

        const visibleRange = this.getVisibleCandleIndexRange(geometry, width, height, 2);
        if (visibleRange.end < visibleRange.start) {
            return;
        }

        const startIndex = visibleRange.start;
        const endIndex = Math.min(visibleRange.end, candles.length - 1);
        const visibleCandles = candles.slice(startIndex, endIndex + 1);
        if (visibleCandles.length === 0) {
            return;
        }

        const screenXs: number[] = [];
        for (const candle of visibleCandles) {
            screenXs.push(this.worldToCanvasPoint(candle.x, candle.close, width, height).x);
        }

        let spacing = 10;
        if (screenXs.length > 1) {
            let sum = 0;
            const limit = Math.min(screenXs.length - 1, 20);
            for (let i = 1; i <= limit; i += 1) {
                sum += Math.abs(screenXs[i] - screenXs[i - 1]);
            }
            spacing = sum / Math.max(1, limit);
        }

        const indicatorPane = this.getIndicatorPaneBounds(width, height);
        const mainBottom = indicatorPane ? indicatorPane.y : height;
        const mainHeight = Math.max(1, mainBottom);
        const volumeBottom = mainBottom - 6;
        const volumeTop = Math.max(6, volumeBottom - Math.max(24, mainHeight * 0.2));

        const baseWorldY = this.priceToWorldYValue(geometry.minPrice, geometry);
        const baseY = this.worldToCanvasPoint(visibleCandles[0].x, baseWorldY, width, height).y;
        const visibleCount = visibleCandles.length;
        const lineStride = Math.max(1, Math.floor(visibleCount / Math.max(48, Math.floor(width * 1.5))));
        const histogramStride = Math.max(1, Math.floor(visibleCount / Math.max(48, Math.floor(width))));

        for (const series of extraSeries) {
            const end = Math.min(series.data.length - 1, endIndex);
            if (end < startIndex) {
                continue;
            }

            ctx.save();
            ctx.strokeStyle = series.style.color;
            ctx.lineWidth = series.style.lineWidth;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";

            if (series.type === "volume") {
                let minValue = Number.POSITIVE_INFINITY;
                let maxValue = Number.NEGATIVE_INFINITY;
                const values: number[] = [];
                for (let i = startIndex; i <= end; i += 1) {
                    const raw = this.resolveSeriesValue(series.data[i], series.valueKey);
                    const value = Number.isFinite(raw ?? NaN)
                        ? Number(raw)
                        : Math.abs(series.data[i].close - series.data[i].open);
                    values.push(value);
                    minValue = Math.min(minValue, value);
                    maxValue = Math.max(maxValue, value);
                }

                if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
                    ctx.restore();
                    continue;
                }
                if (Math.abs(maxValue - minValue) < 1e-6) {
                    maxValue += 1;
                    minValue = Math.max(0, minValue - 1);
                }

                const barWidth = Math.max(1, spacing * series.style.barWidthRatio);
                ctx.fillStyle = series.style.color;
                ctx.globalAlpha = series.style.opacity;
                for (let offset = 0; offset < values.length; offset += 1) {
                    const t = this.clamp((values[offset] - minValue) / (maxValue - minValue), 0, 1);
                    const y = volumeBottom - (t * (volumeBottom - volumeTop));
                    const barHeight = Math.max(1, volumeBottom - y);
                    ctx.fillRect(screenXs[offset] - (barWidth * 0.5), y, barWidth, barHeight);
                }

                ctx.restore();
                continue;
            }

            const points: CustomSeriesPoint[] = [];
            const stride = series.type === "histogram" ? histogramStride : lineStride;
            const appendPoint = (index: number): void => {
                const value = this.resolveSeriesValue(series.data[index], series.valueKey);
                if (!Number.isFinite(value ?? NaN)) {
                    return;
                }
                const worldY = this.priceToWorldYValue(value as number, geometry);
                const visibleOffset = index - startIndex;
                points.push({
                    x: screenXs[visibleOffset],
                    y: this.worldToCanvasPoint(candles[index].x, worldY, width, height).y,
                    index,
                    source: series.data[index],
                });
            };

            for (let i = startIndex; i <= end; i += stride) {
                appendPoint(i);
            }
            if ((end - startIndex) % stride !== 0) {
                appendPoint(end);
            }

            if (points.length === 0) {
                ctx.restore();
                continue;
            }

            if (series.type === "custom") {
                if (series.renderer) {
                    series.renderer(ctx, points, {
                        width,
                        height,
                        baseY,
                        geometry,
                        style: series.style,
                        valueKey: series.valueKey,
                    });
                } else {
                    ctx.beginPath();
                    ctx.moveTo(points[0].x, points[0].y);
                    for (let i = 1; i < points.length; i += 1) {
                        ctx.lineTo(points[i].x, points[i].y);
                    }
                    ctx.stroke();
                }
                ctx.restore();
                continue;
            }

            if (series.type === "line" || series.type === "area") {
                ctx.beginPath();
                ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i += 1) {
                    ctx.lineTo(points[i].x, points[i].y);
                }
                ctx.stroke();

                if (series.type === "area") {
                    ctx.globalAlpha = series.style.opacity;
                    ctx.fillStyle = series.style.color;
                    ctx.beginPath();
                    ctx.moveTo(points[0].x, points[0].y);
                    for (let i = 1; i < points.length; i += 1) {
                        ctx.lineTo(points[i].x, points[i].y);
                    }
                    ctx.lineTo(points[points.length - 1].x, baseY);
                    ctx.lineTo(points[0].x, baseY);
                    ctx.closePath();
                    ctx.fill();
                }
            } else if (series.type === "histogram") {
                const barWidth = Math.max(1, spacing * series.style.barWidthRatio);
                ctx.fillStyle = series.style.color;
                ctx.globalAlpha = series.style.opacity;
                for (const point of points) {
                    const topY = Math.min(point.y, baseY);
                    const barHeight = Math.max(1, Math.abs(point.y - baseY));
                    ctx.fillRect(point.x - (barWidth * 0.5), topY, barWidth, barHeight);
                }
            }

            ctx.restore();
        }
    }

    private renderAxesOverlay(
        ctx: CanvasRenderingContext2D,
        width: number,
        height: number,
        geometry: SeriesGeometry | null
    ): void {
        if (!this.uiOptions.showAxes || !geometry) {
            return;
        }

        const tickCount = this.uiOptions.axisTickCount;
        const priceLabelWidth = 58;
        const timeLabelHeight = 20;
        const minTimeGapPx = 6;

        ctx.save();
        ctx.font = fontSpec(this.theme.typography.axisSize, this.theme);
        ctx.strokeStyle = this.theme.axes.grid;
        ctx.fillStyle = this.theme.surface.panelBackground;
        ctx.lineWidth = 1;

        const topWorldY = this.currentCenterY + this.currentZoomY;
        const bottomWorldY = this.currentCenterY - this.currentZoomY;
        const visibleMinPrice = this.worldYToPriceValueInternal(bottomWorldY, geometry);
        const visibleMaxPrice = this.worldYToPriceValueInternal(topWorldY, geometry);
        const priceTicks = this.buildNiceTicks(visibleMinPrice, visibleMaxPrice, tickCount);

        for (const price of priceTicks) {
            const worldY = this.priceToWorldYValue(price, geometry);
            const canvasPoint = this.worldToCanvasPoint(this.currentCenterX, worldY, width, height);
            const labelY = Math.min(height - timeLabelHeight - 4, Math.max(10, canvasPoint.y));

            ctx.beginPath();
            ctx.moveTo(0, canvasPoint.y);
            ctx.lineTo(width, canvasPoint.y);
            ctx.stroke();

            ctx.fillStyle = this.theme.axes.labelBackground;
            ctx.fillRect(width - priceLabelWidth, labelY - 9, priceLabelWidth - 6, 18);
            ctx.fillStyle = this.theme.axes.labelText;
            ctx.fillText(this.formatPrice(price), width - priceLabelWidth + 6, labelY + 4);
        }

        const approxMaxLabels = Math.max(3, Math.floor(width / 86));
        const zoomDensity = this.clamp(1 / Math.max(0.35, this.currentZoomX), 0.7, 2.8);
        const targetTimeLabels = Math.max(3, Math.min(approxMaxLabels, Math.floor((tickCount + 2) * zoomDensity)));
        const timeLabels = this.buildVisibleTimeLabels(geometry, width, height, targetTimeLabels);
        let lastLabelEndX = -Infinity;
        for (const label of timeLabels) {
            const textWidth = ctx.measureText(label.text).width;
            const boxWidth = textWidth + 10;
            const boxX = Math.max(6, Math.min(width - boxWidth - 6, label.x - (boxWidth * 0.5)));
            if (boxX < (lastLabelEndX + minTimeGapPx)) {
                continue;
            }
            const boxY = height - timeLabelHeight;

            ctx.fillStyle = this.theme.axes.labelBackground;
            ctx.fillRect(boxX, boxY, boxWidth, 16);
            ctx.fillStyle = this.theme.axes.labelText;
            ctx.fillText(label.text, boxX + 5, boxY + 12);
            lastLabelEndX = boxX + boxWidth;
        }

        ctx.restore();
    }

    private renderCrosshairOverlay(
        ctx: CanvasRenderingContext2D,
        width: number,
        height: number,
        geometry: SeriesGeometry | null
    ): void {
        const activeCandle = this.hoveredCandle ?? this.getCandleByIndex(this.selectedCandleIndex, geometry);
        const activeY = this.hoverCanvasY ?? activeCandle?.screenY ?? null;
        if (!this.uiOptions.showCrosshair || !activeCandle || activeY === null || !geometry) {
            return;
        }

        const indicatorPane = this.getIndicatorPaneBounds(width, height);

        renderCrosshairOverlayUi(ctx, width, height, {
            showCrosshair: this.uiOptions.showCrosshair,
            geometry,
            activeCandle,
            activeY,
            hoverCanvasY: this.hoverCanvasY,
            indicatorPane,
            lowerIndicators: this.indicatorPaneManager.getLowerIndicators(),
            theme: this.theme,
        }, {
            clamp: this.clamp.bind(this),
            canvasToWorldPoint: this.canvasToWorldPoint.bind(this),
            worldYToPriceValueInternal: this.worldYToPriceValueInternal.bind(this),
            formatPrice: this.formatPrice.bind(this),
            formatTimeLabel: this.formatTimeLabel.bind(this),
        });
    }

    private renderControlBarOverlay(ctx: CanvasRenderingContext2D, width: number, _height: number): void {
        this.controlButtons = renderControlBar(ctx, width, {
            selectedCandleIndex: this.selectedCandleIndex,
            showControlBar: this.uiOptions.showControlBar,
            showAxes: this.uiOptions.showAxes,
            showCrosshair: this.uiOptions.showCrosshair,
            showTooltip: this.uiOptions.showTooltip,
            tooltipMode: this.uiOptions.tooltipMode,
            autoScaleY: this.uiOptions.autoScaleY,
            showHeatmap: this.analyticsOptions.showHeatmap,
            showAnalyticsPanel: this.analyticsOptions.showRewardCurve || this.analyticsOptions.showPnlCurve,
            theme: this.theme,
        });
    }

    private applyCanvasTheme(): void {
        if (this.canvas) {
            this.canvas.style.backgroundColor = this.theme.surface.chartBackground;
        }
        const parent = this.canvas?.parentElement;
        if (parent) {
            parent.style.backgroundColor = this.theme.surface.chartBackground;
        }
    }

    private emitEvent<K extends ChartEventName>(eventName: K, payload: ChartEventMap[K]): void {
        const listeners = this.eventListeners[eventName];
        if (!listeners || listeners.size === 0) {
            return;
        }

        for (const listener of listeners) {
            try {
                (listener as ChartEventHandler<K>)(payload);
            } catch (error) {
                console.error(`[NexusCharts] Event listener for '${eventName}' failed.`, error);
            }
        }
    }

    private emitCrosshairMove(): void {
        this.emitEvent("crosshairMove", {
            candle: this.getHoveredCandle(),
        });
    }

    private emitSelectionChange(): void {
        this.emitEvent("selectionChange", {
            candle: this.getSelectedCandle(),
        });
    }

    private emitClick(clientX: number, clientY: number, source: "mouse" | "touch"): void {
        this.emitEvent("click", {
            candle: this.getHoveredCandle() ?? this.getSelectedCandle(),
            drawing: this.getDrawingSnapshot(this.drawingManager.getActiveDrawingId()),
            point: this.screenToTimePrice(clientX, clientY),
            clientX,
            clientY,
            source,
        });
    }

    private emitDrawingSelected(): void {
        this.emitEvent("drawingSelected", {
            drawing: this.getDrawingSnapshot(this.drawingManager.getActiveDrawingId()),
        });
    }

    private emitDrawingUpdated(
        drawing: DrawingDefinition,
        reason: "drag",
        meta: { mode: ChartDrawingUpdateMode; pointIndex: number | null; previousDrawing: DrawingDefinition | null }
    ): void {
        this.emitEvent("drawingUpdated", {
            drawing: this.cloneDrawingDefinition(drawing) ?? drawing,
            previousDrawing: this.cloneDrawingDefinition(meta.previousDrawing),
            reason,
            mode: meta.mode,
            pointIndex: meta.pointIndex,
        });
    }

    private emitDrawingDeleted(drawing: DrawingDefinition, reason: "api" | "contextMenu" | "clearAll"): void {
        this.emitEvent("drawingDeleted", {
            drawing: this.cloneDrawingDefinition(drawing) ?? drawing,
            reason,
        });
    }

    private emitVisibleRangeChange(): void {
        const geometry = this.buildSeriesGeometry();
        const surface = this.overlayCanvas ?? this.canvas;
        if (!geometry || !surface || geometry.candles.length === 0) {
            if (this.lastVisibleRangeKey !== "empty") {
                this.lastVisibleRangeKey = "empty";
                const visibleRange = {
                    startIndex: 0,
                    endIndex: -1,
                    fromTime: null,
                    toTime: null,
                    fromPrice: null,
                    toPrice: null,
                };
                this.emitEvent("visibleRangeChange", visibleRange);
                this.emitTimeScaleChange(visibleRange);
            }
            return;
        }

        const range = this.getVisibleCandleIndexRange(geometry, surface.width, surface.height, 0);
        if (range.end < range.start) {
            if (this.lastVisibleRangeKey !== "empty") {
                this.lastVisibleRangeKey = "empty";
                const visibleRange = {
                    startIndex: 0,
                    endIndex: -1,
                    fromTime: null,
                    toTime: null,
                    fromPrice: null,
                    toPrice: null,
                };
                this.emitEvent("visibleRangeChange", visibleRange);
                this.emitTimeScaleChange(visibleRange);
            }
            return;
        }

        const fromCandle = geometry.candles[range.start];
        const toCandle = geometry.candles[range.end];
        const topWorldY = this.canvasToWorldPoint(0, 0, surface.width, surface.height).y;
        const bottomWorldY = this.canvasToWorldPoint(0, surface.height, surface.width, surface.height).y;
        const fromPrice = this.worldYToPriceValueInternal(bottomWorldY, geometry);
        const toPrice = this.worldYToPriceValueInternal(topWorldY, geometry);
        const nextKey = [
            range.start,
            range.end,
            String(fromCandle.source.time),
            String(toCandle.source.time),
            fromPrice.toFixed(4),
            toPrice.toFixed(4),
        ].join("|");

        const visibleRange = {
            startIndex: range.start,
            endIndex: range.end,
            fromTime: fromCandle.source.time,
            toTime: toCandle.source.time,
            fromPrice,
            toPrice,
        };

        if (nextKey !== this.lastVisibleRangeKey) {
            this.lastVisibleRangeKey = nextKey;
            this.emitEvent("visibleRangeChange", visibleRange);
        }
        this.emitTimeScaleChange(visibleRange);
    }

    private emitTimeScaleChange(visibleRange: {
        startIndex: number;
        endIndex: number;
        fromTime: number | string | null;
        toTime: number | string | null;
        fromPrice: number | null;
        toPrice: number | null;
    }): void {
        const surface = this.overlayCanvas ?? this.canvas;
        if (!surface) {
            return;
        }

        const nextKey = [
            this.currentZoomX.toFixed(6),
            this.currentZoomY.toFixed(6),
            this.currentCenterX.toFixed(6),
            this.currentCenterY.toFixed(6),
            surface.width,
            surface.height,
            this.timeAxisOptions.timezone,
            this.timeAxisOptions.gapMode,
            visibleRange.startIndex,
            visibleRange.endIndex,
            String(visibleRange.fromTime),
            String(visibleRange.toTime),
        ].join("|");

        if (nextKey === this.lastTimeScaleKey) {
            return;
        }

        this.lastTimeScaleKey = nextKey;
        this.emitEvent("timeScaleChange", {
            zoom: this.currentZoomX,
            zoomX: this.currentZoomX,
            zoomY: this.currentZoomY,
            centerX: this.currentCenterX,
            centerY: this.currentCenterY,
            viewportWidth: surface.width,
            viewportHeight: surface.height,
            timeAxis: this.getTimeAxis(),
            visibleRange,
        });
    }

    private renderTooltipOverlay(
        ctx: CanvasRenderingContext2D,
        width: number,
        height: number,
        geometry: SeriesGeometry | null
    ): void {
        const selectedCandle = this.getCandleByIndex(this.selectedCandleIndex, geometry);

        renderTooltipOverlayUi(ctx, width, height, {
            showTooltip: this.uiOptions.showTooltip,
            tooltipMode: this.uiOptions.tooltipMode,
            showControlBar: this.uiOptions.showControlBar,
            selectedCandleIndex: this.selectedCandleIndex,
            hoveredCandle: this.hoveredCandle,
            selectedCandle,
            hoverCanvasX: this.hoverCanvasX,
            hoverCanvasY: this.hoverCanvasY,
            indicatorPane: this.getIndicatorPaneBounds(width, height),
            lowerIndicators: this.indicatorPaneManager.getLowerIndicators(),
            theme: this.theme,
        }, {
            formatPrice: this.formatPrice.bind(this),
            rectsOverlap: this.rectsOverlap.bind(this),
            getAnalyticsPanelBounds: this.getAnalyticsPanelBounds.bind(this),
        });
    }

    private normalizeTimeAxisOptions(options: TimeAxisOptions = {}): Required<TimeAxisOptions> {
        const resolvedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        return {
            timezone: options.timezone ?? this.timeAxisOptions?.timezone ?? resolvedTimezone,
            gapMode: options.gapMode ?? this.timeAxisOptions?.gapMode ?? "compress",
        };
    }

    private normalizeAnalyticsOptions(options: AnalyticsOptions): Required<AnalyticsOptions> {
        const rawMaxFrames = options.maxFrames ?? this.analyticsOptions.maxFrames;
        const parsedMaxFrames = Number(rawMaxFrames);
        const maxFrames = Number.isFinite(parsedMaxFrames)
            ? Math.max(10, Math.min(5000, Math.floor(parsedMaxFrames)))
            : this.analyticsOptions.maxFrames;

        return {
            showRewardCurve: options.showRewardCurve ?? this.analyticsOptions.showRewardCurve,
            showPnlCurve: options.showPnlCurve ?? this.analyticsOptions.showPnlCurve,
            showHeatmap: options.showHeatmap ?? this.analyticsOptions.showHeatmap,
            maxFrames,
        };
    }

    private clamp(value: number, minValue: number, maxValue: number): number {
        return Math.min(maxValue, Math.max(minValue, value));
    }

    private rectsOverlap(x: number, y: number, width: number, height: number, other: OverlayRect): boolean {
        return (
            x < (other.x + other.width) &&
            (x + width) > other.x &&
            y < (other.y + other.height) &&
            (y + height) > other.y
        );
    }

    private getAnalyticsPanelBounds(width: number, height: number): OverlayRect | null {
        return getAnalyticsPanelBoundsUi(this.observerFrames.length, this.analyticsOptions, width, height);
    }

    private getIndicatorPaneBounds(width: number, height: number): IndicatorPaneRect | null {
        return this.indicatorPaneManager.getPaneBounds(width, height);
    }

    private nextId(prefix: "series" | "drawing" | "indicator"): string {
        this.idCounter += 1;
        return `${prefix}_${this.idCounter}`;
    }
}

