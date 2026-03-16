import type {
    InitOptions,
    UiOptions,
    UiState,
    AnalyticsOptions,
    CandleDataPoint,
    SeriesType,
    AgentAction,
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
    CustomSeriesRenderer,
    SeriesStyle,
    SeriesGeometry,
    NormalizedCandleDataPoint,
    IndicatorType,
    IndicatorDefinition,
    IndicatorSeries,
    SeriesApi,
    DrawingPoint,
    DrawingStyle,
    DrawingType,
    DrawingDefinition
} from "../types";

import { PerfTracker } from "./perf/PerfTracker";
import { DrawingManager, type StoredDrawing } from "./drawings/DrawingManager";
import { renderDrawingOverlay } from "./drawings/DrawingOverlayRenderer";
import { IndicatorEngine } from "./indicators/IndicatorEngine";
import { renderIndicatorOverlay } from "./indicators/IndicatorOverlayRenderer";
import { renderControlBar, type ControlButtonState } from "./ui/ControlBar";
import { renderCrosshairOverlay as renderCrosshairOverlayUi } from "./ui/CrosshairOverlay";
import { renderTooltipOverlay as renderTooltipOverlayUi } from "./ui/TooltipOverlay";
import { loadPersistedChartState, persistChartState } from "./ui/Persistence";
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

interface PaneRect extends OverlayRect {
    innerX: number;
    innerY: number;
    innerWidth: number;
    innerHeight: number;
}

interface NexusWasmModule {
    initEngine: (canvasSelector: string, width: number, height: number) => boolean;
    destroyEngine: () => void;
    panCamera: (deltaX: number, deltaY: number) => void;
    zoomCamera: (zoomFactor: number) => void;
    setCameraView?: (centerX: number, centerY: number, zoom: number) => void;
    setSeriesData: (opens: number[], highs: number[], lows: number[], closes: number[]) => void;
    pushObserverFrame?: (
        time: number,
        reward: number,
        pnl: number,
        confidence: number,
        actionCode: number,
        x: number,
        y: number
    ) => void;
    clearObserverFrames?: () => void;
    getObserverFrameCount?: () => number;
    getObserverLastReward?: () => number;
    getObserverLastPnl?: () => number;
    getObserverAverageReward?: (window: number) => number;
    canvas?: HTMLCanvasElement;
    locateFile?: (path: string) => string;
    onRuntimeInitialized?: () => void;
}

interface NexusWasmModuleBootstrapConfig {
    canvas?: HTMLCanvasElement;
    locateFile?: (path: string) => string;
    onRuntimeInitialized?: () => void;
}

declare global {
    interface Window {
        Module?: NexusWasmModule;
    }
}

export class NexusCharts {
    private canvas: HTMLCanvasElement | null = null;
    private overlayCanvas: HTMLCanvasElement | null = null;
    private overlayCtx: CanvasRenderingContext2D | null = null;
    private moduleLoaded: boolean = false;
    private module: NexusWasmModule | null = null;
    private readonly canvasId: string;
    private readonly width?: number;
    private readonly height?: number;
    private readonly wasmScriptPath: string;
    private readonly wasmBinaryPath: string;
    private readonly enableInteraction: boolean;
    private readonly onReadyCallback?: (chart: NexusCharts) => void;
    private currentZoom: number = 1.0;
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
    private readonly seriesStore = new Map<
        string,
        {
            type: SeriesType;
            data: CandleDataPoint[];
            style: SeriesStyle;
            valueKey: SeriesValueKey;
            renderer?: CustomSeriesRenderer;
            revision: number;
        }
    >();
    private geometryCache: { seriesId: string; revision: number; geometry: SeriesGeometry | null } | null = null;
    private timeSeriesCache:
        | { seriesId: string; revision: number; series: Array<{ time: number | string; numeric: number | null; x: number }> }
        | null = null;
    private readonly seriesSyncScratch = {
        opens: [] as number[],
        highs: [] as number[],
        lows: [] as number[],
        closes: [] as number[],
    };
    private readonly drawingManager = new DrawingManager();
    private readonly observerFrames: NormalizedObserverFrame[] = [];
    private readonly indicatorEngine = new IndicatorEngine();
    private indicatorPaneHeightRatio: number = 0.26;
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
    private warnMissingSetSeriesData: boolean = true;
    private warnMissingObserverBridge: boolean = true;
    private readonly perfTracker = new PerfTracker(360);
    private idCounter: number = 0;
    private readonly readyPromise: Promise<void>;
    private resolveReady!: () => void;
    private static wasmLoadPromise: Promise<NexusWasmModule> | null = null;

    constructor(options: InitOptions) {
        this.canvasId = options.canvasId;
        this.width = options.width;
        this.height = options.height;
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
        this.readyPromise = new Promise<void>((resolve) => {
            this.resolveReady = resolve;
        });

        this.canvas = document.getElementById(options.canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            console.error(`[NexusCharts] Canvas with ID '${options.canvasId}' not found!`);
            return;
        }

        if (options.width) this.canvas.width = options.width;
        if (options.height) this.canvas.height = options.height;

        this.initializeOverlayCanvas(this.canvas);
        void this.initEngine();
    }

    public waitUntilReady(): Promise<void> {
        return this.readyPromise;
    }

    public isReady(): boolean {
        return this.moduleLoaded;
    }

    public destroy(): void {
        this.detachInteractionHandlers();
        if (this.module) {
            this.module.destroyEngine();
        }
        if (this.overlayCanvas?.parentElement) {
            this.overlayCanvas.parentElement.removeChild(this.overlayCanvas);
        }
        this.overlayCanvas = null;
        this.overlayCtx = null;
        this.moduleLoaded = false;
    }

    public pan(deltaX: number, deltaY: number): void {
        if (!this.moduleLoaded || !this.module) {
            return;
        }
        this.currentCenterX += deltaX;
        this.currentCenterY += deltaY;
        this.module.panCamera(deltaX, deltaY);
        this.autoScaleVisibleY();
        this.refreshHoverFromStoredPointer();
        this.redrawDrawings();
    }

    public zoom(zoomFactor: number): void {
        if (!this.moduleLoaded || !this.module) {
            return;
        }
        const surface = this.overlayCanvas ?? this.canvas;
        const anchorX = this.hoverCanvasX ?? (surface ? surface.width * 0.5 : null);
        const anchorY = this.hoverCanvasY ?? (surface ? surface.height * 0.5 : null);
        const anchoredWorld = (surface && anchorX !== null && anchorY !== null)
            ? this.canvasToWorldPoint(anchorX, anchorY, surface.width, surface.height)
            : null;

        this.currentZoom = Math.min(5.0, Math.max(0.2, this.currentZoom * zoomFactor));

        if (surface && anchoredWorld && anchorX !== null && anchorY !== null) {
            const aspect = surface.width / Math.max(1, surface.height);
            const halfHeight = this.currentZoom;
            const halfWidth = halfHeight * aspect;
            const normalizedX = anchorX / Math.max(1, surface.width);
            const normalizedY = (surface.height - anchorY) / Math.max(1, surface.height);
            const left = anchoredWorld.x - (normalizedX * halfWidth * 2.0);
            const bottom = anchoredWorld.y - (normalizedY * halfHeight * 2.0);
            this.currentCenterX = left + halfWidth;
            this.currentCenterY = bottom + halfHeight;
            this.applyCameraView();
        this.autoScaleVisibleY();
        } else {
            this.module.zoomCamera(zoomFactor);
        }

        this.refreshHoverFromStoredPointer();
        this.redrawDrawings();
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

    public fitToData(): void {
        const geometry = this.buildSeriesGeometry();
        const surface = this.overlayCanvas ?? this.canvas;
        if (!geometry || geometry.candles.length === 0 || !surface) {
            return;
        }

        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;

        for (const candle of geometry.candles) {
            minX = Math.min(minX, candle.x);
            maxX = Math.max(maxX, candle.x);
            minY = Math.min(minY, candle.low);
            maxY = Math.max(maxY, candle.high);
        }

        const aspect = surface.width / Math.max(1, surface.height);
        const paddingY = 0.18;
        const paddingX = 0.08;
        const halfHeightFromY = Math.max(0.35, ((maxY - minY) * 0.5) + paddingY);
        const halfHeightFromX = Math.max(0.35, ((((maxX - minX) * 0.5) + paddingX) / Math.max(aspect, 1e-6)));

        this.currentCenterX = (minX + maxX) * 0.5;
        this.currentCenterY = (minY + maxY) * 0.5;
        this.currentZoom = Math.min(5.0, Math.max(0.2, Math.max(halfHeightFromY, halfHeightFromX)));
        this.applyCameraView();
        this.refreshHoverFromStoredPointer();
        this.redrawDrawings();
    }

    public createSeries(options: SeriesOptions = {}): SeriesApi {
        const type: SeriesType = options.type ?? "candlestick";
        const id = options.id ?? this.nextId("series");

        if (this.seriesStore.has(id)) {
            throw new Error(`[NexusCharts] Series id '${id}' already exists.`);
        }

        const style: SeriesStyle = {
            color: options.color ?? (type === "histogram" ? "#fbbf24" : type === "volume" ? "#38bdf8" : type === "custom" ? "#f472b6" : "#60a5fa"),
            lineWidth: options.lineWidth ?? (type === "histogram" || type === "volume" ? 1 : 2),
            opacity: options.opacity ?? (type === "area" ? 0.25 : type === "volume" ? 0.22 : 1),
            barWidthRatio: this.clamp(options.barWidthRatio ?? (type === "volume" ? 0.55 : 0.6), 0.1, 1),
        };
        const valueKey: SeriesValueKey = options.valueKey
            ?? (type === "volume" ? "volume" : "close");
        this.seriesStore.set(id, { type, data: [], style, valueKey, renderer: options.renderer, revision: 0 });

        const setData = (data: CandleDataPoint[]) => {
            const series = this.seriesStore.get(id);
            if (!series) return;
            series.data = [...data];
            series.revision += 1;
            this.syncSeriesToEngine(id);
            this.recomputeIndicators();
            this.autoScaleVisibleY();
            this.refreshHoverFromStoredPointer();
            this.redrawDrawings();
        };

        const append = (point: CandleDataPoint) => {
            const series = this.seriesStore.get(id);
            if (!series) return;
            series.data.push(point);
            series.revision += 1;
            this.syncSeriesToEngine(id);
            this.recomputeIndicators();
            this.autoScaleVisibleY();
            this.refreshHoverFromStoredPointer();
            this.redrawDrawings();
        };

        const updateLast = (point: Partial<CandleDataPoint>) => {
            const series = this.seriesStore.get(id);
            if (!series) return;

            if (series.data.length === 0) {
                if (!this.isCompleteCandle(point)) {
                    console.warn("[NexusCharts] updateLast requires a full candle when no data exists.", { id, point });
                    return;
                }
                series.data.push(point);
            } else {
                const lastIndex = series.data.length - 1;
                const last = series.data[lastIndex];
                series.data[lastIndex] = { ...last, ...point };
            }

            series.revision += 1;
            this.syncSeriesToEngine(id);
            this.recomputeIndicators();
            this.autoScaleVisibleY();
            this.refreshHoverFromStoredPointer();
            this.redrawDrawings();
        };

        const update = (point: CandleDataPoint) => {
            append(point);
        };

        const getData = (): CandleDataPoint[] => {
            const series = this.seriesStore.get(id);
            return series ? [...series.data] : [];
        };

        const clear = () => {
            const series = this.seriesStore.get(id);
            if (!series) return;
            series.data = [];
            series.revision += 1;
            this.syncSeriesToEngine(id);
            this.recomputeIndicators();
            this.autoScaleVisibleY();
            this.refreshHoverFromStoredPointer();
            this.redrawDrawings();
        };

        return { id, type, setData, append, update, updateLast, getData, clear };
    }

    public addIndicator(definition: IndicatorDefinition): string {
        const id = this.indicatorEngine.addIndicator(definition, () => this.nextId("indicator"));
        this.recomputeIndicators();
        this.redrawDrawings();
        return id;
    }

    public removeIndicator(id: string): boolean {
        const removed = this.indicatorEngine.removeIndicator(id);
        if (removed) {
            this.redrawDrawings();
        }
        return removed;
    }

    public clearIndicators(): void {
        this.indicatorEngine.clearIndicators();
        this.redrawDrawings();
    }

    public getIndicators(): IndicatorSeries[] {
        return this.indicatorEngine.getIndicators();
    }

    public addDrawing(definition: DrawingDefinition): string {
        const id = this.drawingManager.addDrawing(definition, () => this.nextId("drawing"));
        this.redrawDrawings();
        return id;
    }

    public removeDrawing(id: string): boolean {
        const removed = this.drawingManager.removeDrawing(id);
        if (removed) {
            this.redrawDrawings();
        }
        return removed;
    }

    public clearDrawings(): void {
        this.drawingManager.clearDrawings();
        this.redrawDrawings();
    }

    public configureUi(options: UiOptions): void {
        this.uiOptions = this.normalizeUiOptions(options);
        if (!this.uiOptions.showControlBar) {
            this.controlButtons = [];
        }
        persistChartState(this.canvasId, this.uiOptions, this.analyticsOptions);
        this.redrawDrawings();
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
        this.redrawDrawings();
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
        this.syncObserverFrameToEngine(normalized);
        this.redrawDrawings();
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
        this.syncAllObserverFramesToEngine();
        this.redrawDrawings();
    }

    public getObserverFrames(): ObserverFrame[] {
        return this.observerFrames.map((frame) => ({ ...frame }));
    }

    public clearObserverFrames(): void {
        this.observerFrames.length = 0;
        if (this.moduleLoaded && this.module && typeof this.module.clearObserverFrames === "function") {
            this.module.clearObserverFrames();
        }
        this.redrawDrawings();
    }

    public getObserverMetrics(window: number = 0): ObserverMetrics {
        const sanitizedWindow = Number.isFinite(window)
            ? Math.max(0, Math.floor(window))
            : 0;

        if (
            this.moduleLoaded &&
            this.module &&
            typeof this.module.getObserverFrameCount === "function" &&
            typeof this.module.getObserverLastReward === "function" &&
            typeof this.module.getObserverLastPnl === "function" &&
            typeof this.module.getObserverAverageReward === "function"
        ) {
            try {
                return {
                    frameCount: Number(this.module.getObserverFrameCount()),
                    lastReward: Number(this.module.getObserverLastReward()),
                    lastPnl: Number(this.module.getObserverLastPnl()),
                    averageReward: Number(this.module.getObserverAverageReward(sanitizedWindow)),
                    source: "wasm",
                };
            } catch (error) {
                console.warn("[NexusCharts] Failed to read observer metrics from WASM.", { error });
            }
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

    private async initEngine(): Promise<void> {
        console.log("[NexusCharts:JS] Initializing WASM module...");

        try {
            const module = await this.loadWasmModule();
            this.module = module;

            const initialized = module.initEngine(`#${this.canvasId}`, this.width ?? 0, this.height ?? 0);
            if (!initialized) {
                console.error("[NexusCharts:JS] Failed to initialize WASM engine.");
                return;
            }

            this.moduleLoaded = true;
            this.syncAllSeriesToEngine();
            this.syncAllObserverFramesToEngine();
            if (this.enableInteraction && this.canvas) {
                this.attachInteractionHandlers(this.canvas);
            }
            this.resolveReady();
            if (this.onReadyCallback) {
                this.onReadyCallback(this);
            }
            console.log("[NexusCharts:JS] WASM module loaded and engine initialized.");
        } catch (error) {
            console.error("[NexusCharts:JS] WASM bootstrap failed.", error);
        }
    }

    private loadWasmModule(): Promise<NexusWasmModule> {
        if (NexusCharts.wasmLoadPromise) {
            return NexusCharts.wasmLoadPromise;
        }

        NexusCharts.wasmLoadPromise = new Promise<NexusWasmModule>((resolve, reject) => {
            if (window.Module && typeof window.Module.initEngine === "function") {
                resolve(window.Module);
                return;
            }

            const runtimeModule: NexusWasmModuleBootstrapConfig = {
                canvas: this.canvas ?? undefined,
                locateFile: (path: string) => {
                    if (path.endsWith(".wasm")) {
                        return this.wasmBinaryPath;
                    }
                    return path;
                },
                onRuntimeInitialized: () => {
                    resolve(window.Module as NexusWasmModule);
                },
            };

            window.Module = runtimeModule as NexusWasmModule;

            const script = document.createElement("script");
            script.src = this.wasmScriptPath;
            script.async = true;
            script.onerror = () => {
                reject(new Error(`Failed to load WASM script: ${this.wasmScriptPath}`));
            };
            document.head.appendChild(script);
        });

        return NexusCharts.wasmLoadPromise;
    }

    private attachInteractionHandlers(canvas: HTMLCanvasElement): void {
        const onMouseDown = (event: MouseEvent) => {
            if (this.getControlButtonAtClientPosition(event.clientX, event.clientY)) {
                return;
            }

            this.draggedDuringPointer = false;
            this.lastPointerX = event.clientX;
            this.lastPointerY = event.clientY;
            this.updateHoverFromClientPosition(event.clientX, event.clientY);
            const world = this.screenToWorld(event.clientX, event.clientY);
            const surface = this.overlayCanvas ?? canvas;
            const geometry = this.buildSeriesGeometry();
            if (world && surface) {
                const hit = this.drawingManager.hitTestDrawing(world, surface.width, surface.height, geometry, {
                    getWorldUnitsPerPixel: this.getWorldUnitsPerPixel.bind(this),
                    resolveDrawingPoint: this.resolveDrawingPoint.bind(this),
                    resolveDrawingWorldX: this.resolveDrawingWorldX.bind(this),
                    resolveDrawingWorldY: this.resolveDrawingWorldY.bind(this),
                    distancePointToSegment: this.distancePointToSegment.bind(this),
                });
                if (hit) {
                    const drawing = this.drawingManager.getDrawing(hit.id);
                    if (drawing) {
                        this.applyAnchorsToDrawing(drawing, geometry);
                        const resolvedPoints = drawing.points
                            ? drawing.points.map((point) => this.resolveDrawingPoint(point, geometry))
                            : undefined;
                        const resolvedX = this.resolveDrawingWorldX(drawing, geometry);
                        const resolvedY = this.resolveDrawingWorldY(drawing, geometry);

                        this.drawingManager.setActiveDrawingId(hit.id);
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
                        return;
                    }
                }
            }
            this.drawingManager.setActiveDrawingId(null);
            this.drawingManager.setActiveDrag(null);
            this.isDragging = true;
        };

        const onMouseMove = (event: MouseEvent) => {
            const activeDrag = this.drawingManager.getActiveDrag();
            if (activeDrag) {
                const world = this.screenToWorld(event.clientX, event.clientY);
                if (!world) {
                    return;
                }
                const drag = activeDrag;
                const drawing = this.drawingManager.getDrawing(drag.id);
                if (!drawing) {
                    this.drawingManager.setActiveDrag(null);
                    return;
                }

                const geometry = this.buildSeriesGeometry();
                const dx = world.x - drag.startWorld.x;
                const dy = world.y - drag.startWorld.y;
                this.draggedDuringPointer = true;

                if (drawing.type === "line" && drawing.points && drag.startPoints && drag.startPoints.length >= 2) {
                    if (drag.mode === "p0") {
                        drawing.points[0] = { x: drag.startPoints[0].x + dx, y: drag.startPoints[0].y + dy };
                    } else if (drag.mode === "p1") {
                        drawing.points[1] = { x: drag.startPoints[1].x + dx, y: drag.startPoints[1].y + dy };
                    } else {
                        drawing.points = drag.startPoints.map((point) => ({ x: point.x + dx, y: point.y + dy }));
                    }
                } else if (drawing.type === "polyline" && drawing.points && drag.startPoints) {
                    if (drag.mode === "poly_point" && drag.pointIndex !== undefined) {
                        const index = drag.pointIndex;
                        if (drag.startPoints[index]) {
                            drawing.points[index] = {
                                x: drag.startPoints[index].x + dx,
                                y: drag.startPoints[index].y + dy,
                            };
                        }
                    } else {
                        drawing.points = drag.startPoints.map((point) => ({ x: point.x + dx, y: point.y + dy }));
                    }
                } else if (drawing.type === "horizontal_line" && typeof drag.startY === "number") {
                    drawing.y = drag.startY + dy;
                } else if (drawing.type === "vertical_line" && typeof drag.startX === "number") {
                    drawing.x = drag.startX + dx;
                }

                this.syncDrawingAnchors(drawing, geometry);
                this.drawingManager.setHoveredDrawingId(drawing.id);
                this.redrawDrawings();
                return;
            }

            if (this.isDragging) {
                const dx = event.clientX - this.lastPointerX;
                const dy = event.clientY - this.lastPointerY;
                if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                    this.draggedDuringPointer = true;
                }
                this.lastPointerX = event.clientX;
                this.lastPointerY = event.clientY;

                const width = canvas.width || 1;
                const height = canvas.height || 1;
                const aspect = width / height;
                const worldUnitsPerPixelX = (2.0 * this.currentZoom * aspect) / width;
                const worldUnitsPerPixelY = (2.0 * this.currentZoom) / height;

                this.pan(-dx * worldUnitsPerPixelX, dy * worldUnitsPerPixelY);
                return;
            }

            this.updateHoverFromClientPosition(event.clientX, event.clientY);
            this.redrawDrawings();
        };

        const stopDragging = () => {
            this.isDragging = false;
            if (this.drawingManager.getActiveDrag()) {
                this.drawingManager.setActiveDrag(null);
            }
        };

        const onClick = (event: MouseEvent) => {
            if (this.handleControlBarClick(event.clientX, event.clientY)) {
                return;
            }
            const hoveredDrawingId = this.drawingManager.getHoveredDrawingId();
            if (hoveredDrawingId) {
                this.drawingManager.setActiveDrawingId(hoveredDrawingId);
                this.redrawDrawings();
                return;
            }
            this.drawingManager.setActiveDrawingId(null);
            if (this.draggedDuringPointer || !this.hoveredCandle) {
                return;
            }
            const nextIndex = this.selectedCandleIndex === this.hoveredCandle.index
                ? null
                : this.hoveredCandle.index;
            this.setSelectedCandleIndex(nextIndex);
        };

        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            this.updateHoverFromClientPosition(event.clientX, event.clientY);
            const zoomFactor = event.deltaY > 0 ? 1.08 : 0.92;
            this.zoom(zoomFactor);
        };

        const onContextMenu = (event: MouseEvent) => {
            event.preventDefault();
            this.updateHoverFromClientPosition(event.clientX, event.clientY);
            const targetId = this.drawingManager.getHoveredDrawingId() ?? this.drawingManager.getActiveDrawingId();
            if (targetId) {
                this.drawingManager.showContextMenu(event.clientX, event.clientY, targetId);
            } else {
                this.drawingManager.hideContextMenu();
            }
        };

        const onGlobalDown = (event: MouseEvent) => {
            const menu = this.drawingManager.getContextMenu();
            if (!menu || menu.style.display === "none") {
                return;
            }
            const target = event.target as Node | null;
            if (target && menu.contains(target)) {
                return;
            }
            this.drawingManager.hideContextMenu();
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

        const onResize = () => {
            if (!this.canvas || !this.overlayCanvas) {
                return;
            }
            this.overlayCanvas.width = this.canvas.width;
            this.overlayCanvas.height = this.canvas.height;
            this.refreshHoverFromStoredPointer();
            this.redrawDrawings();
        };

        const clearHover = () => {
            this.hoverCanvasX = null;
            this.hoverCanvasY = null;
            this.hoveredCandle = null;
            this.drawingManager.setHoveredDrawingId(null);
            this.redrawDrawings();
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
        window.addEventListener("resize", onResize);
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
        this.cleanupHandlers.push(() => window.removeEventListener("resize", onResize));
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

    private syncSeriesToEngine(seriesId: string): void {
        if (!this.moduleLoaded || !this.module) {
            return;
        }

        const series = this.seriesStore.get(seriesId);
        if (!series || series.type !== "candlestick") {
            return;
        }

        // WASM backend currently supports a single primary candlestick series.
        // If multiple candlestick series exist, only the primary one is synced.
        const primary = this.getPrimaryCandlestickSeriesEntry();
        if (primary && primary.id !== seriesId) {
            return;
        }

        if (typeof this.module.setSeriesData !== "function") {
            if (this.warnMissingSetSeriesData) {
                console.warn("[NexusCharts] WASM export 'setSeriesData' is not available.");
                this.warnMissingSetSeriesData = false;
            }
            return;
        }

        const scratch = this.seriesSyncScratch;
        scratch.opens.length = 0;
        scratch.highs.length = 0;
        scratch.lows.length = 0;
        scratch.closes.length = 0;

        if (series.data.length > 0) {
            const geometry = this.buildSeriesGeometry();
            const candles = geometry?.candles ?? [];
            for (const candle of candles) {
                const point = candle.source;
                const open = Number(point.open);
                const highRaw = Number(point.high);
                const lowRaw = Number(point.low);
                const close = Number(point.close);
                if (!Number.isFinite(open) || !Number.isFinite(highRaw) || !Number.isFinite(lowRaw) || !Number.isFinite(close)) {
                    continue;
                }
                scratch.opens.push(open);
                scratch.highs.push(Math.max(highRaw, open, close, lowRaw));
                scratch.lows.push(Math.min(lowRaw, open, close, highRaw));
                scratch.closes.push(close);
            }
        }

        try {
            this.module.setSeriesData(scratch.opens, scratch.highs, scratch.lows, scratch.closes);
        } catch (error) {
            console.warn(
                "[NexusCharts] Failed to push series data to WASM.",
                { seriesId, error }
            );
        }
    }

    private syncAllSeriesToEngine(): void {
        for (const [seriesId] of this.seriesStore) {
            this.syncSeriesToEngine(seriesId);
        }
    }

    private actionToCode(action: AgentAction): number {
        if (action === "buy") return 1;
        if (action === "sell") return -1;
        return 0;
    }

    private syncObserverFrameToEngine(frame: NormalizedObserverFrame): void {
        if (!this.moduleLoaded || !this.module) {
            return;
        }

        if (typeof this.module.pushObserverFrame !== "function") {
            if (this.warnMissingObserverBridge) {
                console.warn("[NexusCharts] WASM observer stream exports are not available.");
                this.warnMissingObserverBridge = false;
            }
            return;
        }

        try {
            this.module.pushObserverFrame(
                frame.time,
                frame.reward,
                frame.pnl,
                frame.confidence,
                this.actionToCode(frame.action),
                frame.x,
                frame.y
            );
        } catch (error) {
            console.warn("[NexusCharts] Failed to push observer frame to WASM.", { error });
        }
    }

    private syncAllObserverFramesToEngine(): void {
        if (!this.moduleLoaded || !this.module) {
            return;
        }

        if (
            typeof this.module.pushObserverFrame !== "function" ||
            typeof this.module.clearObserverFrames !== "function"
        ) {
            if (this.warnMissingObserverBridge) {
                console.warn("[NexusCharts] WASM observer stream exports are not available.");
                this.warnMissingObserverBridge = false;
            }
            return;
        }

        try {
            this.module.clearObserverFrames();
            for (const frame of this.observerFrames) {
                this.module.pushObserverFrame(
                    frame.time,
                    frame.reward,
                    frame.pnl,
                    frame.confidence,
                    this.actionToCode(frame.action),
                    frame.x,
                    frame.y
                );
            }
        } catch (error) {
            console.warn("[NexusCharts] Failed to sync observer frames to WASM.", { error });
        }
    }

    private applyCameraView(): void {
        if (!this.moduleLoaded || !this.module) {
            return;
        }

        if (typeof this.module.setCameraView === "function") {
            this.module.setCameraView(this.currentCenterX, this.currentCenterY, this.currentZoom);
            return;
        }

        console.warn("[NexusCharts] WASM export 'setCameraView' is not available.");
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
        this.selectedCandleIndex = index;
        this.hoveredCandle = null;
        this.hoverCanvasX = null;
        this.hoverCanvasY = null;
        this.redrawDrawings();
    }

    private moveSelection(step: number): void {
        const geometry = this.buildSeriesGeometry();
        if (!geometry || geometry.candles.length === 0) {
            return;
        }
        const count = geometry.candles.length;
        let nextIndex = this.selectedCandleIndex;
        if (nextIndex === null) {
            if (this.hoveredCandle) {
                nextIndex = this.hoveredCandle.index;
            } else {
                nextIndex = step >= 0 ? 0 : (count - 1);
            }
        } else {
            nextIndex = Math.max(0, Math.min(count - 1, nextIndex + step));
        }
        this.setSelectedCandleIndex(nextIndex);
    }

        private jumpSelection(to: "start" | "end"): void {
        const geometry = this.buildSeriesGeometry();
        if (!geometry || geometry.candles.length === 0) {
            return;
        }
        this.setSelectedCandleIndex(to === "start" ? 0 : (geometry.candles.length - 1));
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
        const aspect = width / Math.max(1, height);
        const halfWidth = this.currentZoom * aspect;
        const left = this.currentCenterX - halfWidth;
        const right = this.currentCenterX + halfWidth;

        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        let count = 0;
        for (const candle of geometry.candles) {
            if (candle.x < left || candle.x > right) {
                continue;
            }
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
        const nextZoom = targetHalfHeight > this.currentZoom ? Math.min(5.0, targetHalfHeight) : this.currentZoom;

        if (Math.abs(nextCenterY - this.currentCenterY) > 1e-4 || Math.abs(nextZoom - this.currentZoom) > 1e-4) {
            this.currentCenterY = nextCenterY;
            this.currentZoom = Math.min(5.0, Math.max(0.2, nextZoom));
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
        const aspect = safeWidth / safeHeight;
        const halfHeight = this.currentZoom;
        const halfWidth = halfHeight * aspect;
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
        const aspect = safeWidth / safeHeight;
        const halfHeight = this.currentZoom;
        const halfWidth = halfHeight * aspect;
        const left = this.currentCenterX - halfWidth;
        const bottom = this.currentCenterY - halfHeight;

        return {
            x: left + ((canvasX / safeWidth) * halfWidth * 2.0),
            y: bottom + (((safeHeight - canvasY) / safeHeight) * halfHeight * 2.0),
        };
    }

    private getWorldUnitsPerPixel(width: number, height: number): { x: number; y: number } {
        const safeWidth = Math.max(1, width);
        const safeHeight = Math.max(1, height);
        const aspect = safeWidth / safeHeight;
        return {
            x: (2.0 * this.currentZoom * aspect) / safeWidth,
            y: (2.0 * this.currentZoom) / safeHeight,
        };
    }

    private distancePointToSegment(point: WorldPoint, a: DrawingPoint, b: DrawingPoint): number {
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const apx = point.x - a.x;
        const apy = point.y - a.y;
        const denom = (abx * abx) + (aby * aby);
        if (denom <= 1e-8) {
            const dx = point.x - a.x;
            const dy = point.y - a.y;
            return Math.sqrt((dx * dx) + (dy * dy));
        }
        const t = this.clamp(((apx * abx) + (apy * aby)) / denom, 0, 1);
        const closestX = a.x + (abx * t);
        const closestY = a.y + (aby * t);
        const dx = point.x - closestX;
        const dy = point.y - closestY;
        return Math.sqrt((dx * dx) + (dy * dy));
    }

    private resolveDrawingPoint(point: DrawingPoint, geometry: SeriesGeometry | null): DrawingPoint {
        if (!geometry) {
            return point;
        }
        let x = point.x;
        let y = point.y;
        if (point.time !== undefined) {
            const worldX = this.timeToWorldXInternal(point.time, geometry);
            if (worldX !== null) {
                x = worldX;
            }
        }
        if (typeof point.price === "number" && Number.isFinite(point.price)) {
            y = this.priceToWorldYValue(point.price, geometry);
        }
        return { ...point, x, y };
    }

    private resolveDrawingWorldX(drawing: StoredDrawing, geometry: SeriesGeometry | null): number | null {
        if (geometry && drawing.time !== undefined) {
            const worldX = this.timeToWorldXInternal(drawing.time, geometry);
            if (worldX !== null) {
                return worldX;
            }
        }
        return typeof drawing.x === "number" ? drawing.x : null;
    }

    private resolveDrawingWorldY(drawing: StoredDrawing, geometry: SeriesGeometry | null): number | null {
        if (geometry && typeof drawing.price === "number" && Number.isFinite(drawing.price)) {
            return this.priceToWorldYValue(drawing.price, geometry);
        }
        return typeof drawing.y === "number" ? drawing.y : null;
    }

    private applyAnchorsToDrawing(drawing: StoredDrawing, geometry: SeriesGeometry | null): void {
        if (!geometry) {
            return;
        }

        if (drawing.points) {
            drawing.points = drawing.points.map((point) => {
                let x = point.x;
                let y = point.y;
                if (point.time !== undefined) {
                    const worldX = this.timeToWorldXInternal(point.time, geometry);
                    if (worldX !== null) {
                        x = worldX;
                    }
                }
                if (typeof point.price === "number" && Number.isFinite(point.price)) {
                    y = this.priceToWorldYValue(point.price, geometry);
                }
                return { ...point, x, y };
            });
        }

        if (drawing.type === "horizontal_line" && typeof drawing.price === "number" && Number.isFinite(drawing.price)) {
            drawing.y = this.priceToWorldYValue(drawing.price, geometry);
        }

        if (drawing.type === "vertical_line" && drawing.time !== undefined) {
            const worldX = this.timeToWorldXInternal(drawing.time, geometry);
            if (worldX !== null) {
                drawing.x = worldX;
            }
        }
    }

    private syncDrawingAnchors(drawing: StoredDrawing, geometry: SeriesGeometry | null): void {
        if (!geometry) {
            return;
        }

        if (drawing.points) {
            drawing.points = drawing.points.map((point) => {
                const time = this.worldXToTimeInternal(point.x, geometry);
                const price = this.worldYToPriceValueInternal(point.y, geometry);
                return {
                    ...point,
                    time: time ?? point.time,
                    price: Number.isFinite(price) ? price : point.price,
                };
            });
        }

        if (drawing.type === "horizontal_line" && typeof drawing.y === "number") {
            const price = this.worldYToPriceValueInternal(drawing.y, geometry);
            if (Number.isFinite(price)) {
                drawing.price = price;
            }
        }

        if (drawing.type === "vertical_line" && typeof drawing.x === "number") {
            const time = this.worldXToTimeInternal(drawing.x, geometry);
            if (time !== null) {
                drawing.time = time;
            }
        }
    }
    private updateHoveredDrawingFromCanvas(canvasX: number, canvasY: number, width: number, height: number): void {
        const world = this.canvasToWorldPoint(canvasX, canvasY, width, height);
        const geometry = this.buildSeriesGeometry();
        const hit = this.drawingManager.hitTestDrawing(world, width, height, geometry, {
            getWorldUnitsPerPixel: this.getWorldUnitsPerPixel.bind(this),
            resolveDrawingPoint: this.resolveDrawingPoint.bind(this),
            resolveDrawingWorldX: this.resolveDrawingWorldX.bind(this),
            resolveDrawingWorldY: this.resolveDrawingWorldY.bind(this),
            distancePointToSegment: this.distancePointToSegment.bind(this),
        });
        this.drawingManager.setHoveredDrawingId(hit ? hit.id : null);
    }

    private getPrimaryCandlestickSeriesEntry(): { id: string; data: CandleDataPoint[]; revision: number } | null {
        for (const [id, series] of this.seriesStore) {
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

    private buildSeriesGeometry(): SeriesGeometry | null {
        const entry = this.getPrimaryCandlestickSeriesEntry();
        if (!entry) {
            return null;
        }

        if (this.geometryCache && this.geometryCache.seriesId === entry.id && this.geometryCache.revision === entry.revision) {
            return this.geometryCache.geometry;
        }

        const source = entry.data;

        let minPrice = Number.POSITIVE_INFINITY;
        let maxPrice = Number.NEGATIVE_INFINITY;
        const valid: CandleDataPoint[] = [];

        for (const point of source) {
            const open = Number(point.open);
            const high = Number(point.high);
            const low = Number(point.low);
            const close = Number(point.close);
            if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
                continue;
            }

            const pointLow = Math.min(low, open, close, high);
            const pointHigh = Math.max(high, open, close, low);
            minPrice = Math.min(minPrice, pointLow);
            maxPrice = Math.max(maxPrice, pointHigh);
            valid.push(point);
        }

        if (valid.length === 0) {
            this.geometryCache = { seriesId: entry.id, revision: entry.revision, geometry: null };
            this.timeSeriesCache = null;
            return null;
        }

        const range = Math.max(maxPrice - minPrice, 1e-5);
        const scale = 1.7 / range;
        const startX = -0.92;
        const stepX = valid.length > 1 ? 1.84 / (valid.length - 1) : 0.0;
        const normalizeY = (value: number): number => ((value - minPrice) * scale) - 0.85;

        const candles: NormalizedCandleDataPoint[] = valid.map((point, index) => ({
            source: point,
            x: startX + (stepX * index),
            open: normalizeY(point.open),
            high: normalizeY(Math.max(point.high, point.open, point.close, point.low)),
            low: normalizeY(Math.min(point.low, point.open, point.close, point.high)),
            close: normalizeY(point.close),
        }));

        const geometry: SeriesGeometry = { candles, minPrice, maxPrice, scale };
        this.geometryCache = { seriesId: entry.id, revision: entry.revision, geometry };
        this.timeSeriesCache = null;
        return geometry;
    }

    private recomputeIndicators(): void {
        this.indicatorEngine.recompute(this.getPrimaryCandlestickSeries());
    }

    private formatPrice(value: number): string {
        return value.toFixed(this.uiOptions.pricePrecision);
    }

    private formatTimeLabel(value: number | string): string {
        if (typeof value === "number") {
            if (Number.isInteger(value)) {
                return String(value);
            }
            return value.toFixed(2);
        }
        return String(value);
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
        return Number.isFinite(parsed) ? parsed : null;
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
        const visible = geometry.candles
            .map((candle, index) => ({
                index,
                candle,
                x: this.worldToCanvasPoint(candle.x, candle.close, width, height).x,
                timeValue: this.toNumericTime(candle.source.time),
            }))
            .filter((item) => item.x >= 0 && item.x <= width);

        const source = visible.length > 0
            ? visible
            : geometry.candles.map((candle, index) => ({
                index,
                candle,
                x: this.worldToCanvasPoint(candle.x, candle.close, width, height).x,
                timeValue: this.toNumericTime(candle.source.time),
            }));

        if (source.length === 0) {
            return [];
        }

        const labels: TimeAxisLabel[] = [];
        const allNumeric = source.every((entry) => entry.timeValue !== null);

        if (allNumeric) {
            const minTime = source[0].timeValue as number;
            const maxTime = source[source.length - 1].timeValue as number;
            const ticks = this.buildNiceTicks(minTime, maxTime, targetCount);
            const used = new Set<number>();
            for (const tick of ticks) {
                let nearest = source[0];
                let nearestDistance = Math.abs((nearest.timeValue as number) - tick);
                for (let i = 1; i < source.length; i += 1) {
                    const candidate = source[i];
                    const distance = Math.abs((candidate.timeValue as number) - tick);
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
            return;
        }

        this.hoverCanvasX = canvasX;
        this.hoverCanvasY = canvasY;

        const geometry = this.buildSeriesGeometry();
        if (!geometry || geometry.candles.length === 0) {
            this.hoveredCandle = null;
            return;
        }

        let nearestIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (let i = 0; i < geometry.candles.length; i += 1) {
            const screen = this.worldToCanvasPoint(geometry.candles[i].x, geometry.candles[i].close, surface.width, surface.height);
            const distance = Math.abs(screen.x - canvasX);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestIndex = i;
            }
        }

        const candle = geometry.candles[nearestIndex];
        const closePoint = this.worldToCanvasPoint(candle.x, candle.close, surface.width, surface.height);
        this.hoveredCandle = {
            index: nearestIndex,
            time: candle.source.time,
            open: candle.source.open,
            high: candle.source.high,
            low: candle.source.low,
            close: candle.source.close,
            screenX: closePoint.x,
            screenY: closePoint.y,
            worldX: candle.x,
        };

        this.updateHoveredDrawingFromCanvas(canvasX, canvasY, surface.width, surface.height);
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

        const menu = document.createElement("div");
        menu.style.position = "absolute";
        menu.style.display = "none";
        menu.style.zIndex = "20";
        menu.style.minWidth = "140px";
        menu.style.background = "rgba(10, 24, 44, 0.96)";
        menu.style.border = "1px solid rgba(120, 148, 188, 0.5)";
        menu.style.borderRadius = "6px";
        menu.style.padding = "4px";
        menu.style.font = "12px 'Segoe UI', sans-serif";
        menu.style.color = "#dce7ff";
        menu.style.boxShadow = "0 8px 22px rgba(0, 0, 0, 0.35)";
        menu.style.pointerEvents = "auto";

        const deleteItem = document.createElement("div");
        deleteItem.textContent = "Delete drawing";
        deleteItem.style.padding = "6px 10px";
        deleteItem.style.cursor = "pointer";
        deleteItem.style.borderRadius = "4px";
        deleteItem.onmouseenter = () => {
            deleteItem.style.background = "rgba(255, 107, 122, 0.15)";
        };
        deleteItem.onmouseleave = () => {
            deleteItem.style.background = "transparent";
        };
        deleteItem.onclick = (event) => {
            event.stopPropagation();
            const id = this.drawingManager.getContextMenuTargetId();
            if (id) {
                this.removeDrawing(id);
            }
            this.drawingManager.hideContextMenu();
        };
        menu.appendChild(deleteItem);

        parent.appendChild(menu);

        parent.appendChild(overlay);
        this.overlayCanvas = overlay;
        this.overlayCtx = overlay.getContext("2d");
        this.drawingManager.attachOverlay(overlay, menu);
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
        const geometry = this.buildSeriesGeometry();

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
            worldToCanvas,
        });

        this.renderSeriesOverlay(ctx, width, height, geometry);
        this.renderAxesOverlay(ctx, width, height, geometry);
        renderIndicatorOverlay(ctx, width, height, geometry, this.indicatorEngine.values(), {
            getIndicatorPaneBounds: this.getIndicatorPaneBounds.bind(this),
            worldToCanvasPoint: this.worldToCanvasPoint.bind(this),
            priceToWorldYValue: this.priceToWorldYValue.bind(this),
        });
        renderAnalyticsOverlayUi(ctx, width, height, this.observerFrames, this.analyticsOptions, toCanvas);
        this.renderSelectionOverlay(ctx, width, height, geometry);
        this.renderCrosshairOverlay(ctx, width, height);
        this.renderTooltipOverlay(ctx, width, height);
        this.renderControlBarOverlay(ctx, width, height);
        this.perfTracker.recordSample(this.perfTracker.nowMs() - startMs);
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
        if (candles.length == 0) {
            return;
        }

        const extraSeries = Array.from(this.seriesStore.values()).filter((series) => series.type !== "candlestick" && series.data.length > 0);
        if (extraSeries.length === 0) {
            return;
        }

        const screenXs: number[] = [];
        for (const candle of candles) {
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
        const baseY = this.worldToCanvasPoint(candles[0].x, baseWorldY, width, height).y;

        for (const series of extraSeries) {
            const count = Math.min(series.data.length, candles.length);
            if (count <= 0) {
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
                for (let i = 0; i < count; i += 1) {
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
                for (let i = 0; i < count; i += 1) {
                    const t = this.clamp((values[i] - minValue) / (maxValue - minValue), 0, 1);
                    const y = volumeBottom - (t * (volumeBottom - volumeTop));
                    const barHeight = Math.max(1, volumeBottom - y);
                    ctx.fillRect(screenXs[i] - (barWidth * 0.5), y, barWidth, barHeight);
                }

                ctx.restore();
                continue;
            }

            const points: CustomSeriesPoint[] = [];
            for (let i = 0; i < count; i += 1) {
                const value = this.resolveSeriesValue(series.data[i], series.valueKey);
                if (!Number.isFinite(value ?? NaN)) {
                    continue;
                }
                const worldY = this.priceToWorldYValue(value as number, geometry);
                points.push({
                    x: screenXs[i],
                    y: this.worldToCanvasPoint(candles[i].x, worldY, width, height).y,
                    index: i,
                    source: series.data[i],
                });
            }

            if (points.length == 0) {
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
        ctx.font = "11px 'Segoe UI', sans-serif";
        ctx.strokeStyle = "rgba(106, 138, 184, 0.25)";
        ctx.fillStyle = "rgba(7, 18, 34, 0.72)";
        ctx.lineWidth = 1;

        const topWorldY = this.currentCenterY + this.currentZoom;
        const bottomWorldY = this.currentCenterY - this.currentZoom;
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

            ctx.fillStyle = "rgba(7, 18, 34, 0.85)";
            ctx.fillRect(width - priceLabelWidth, labelY - 9, priceLabelWidth - 6, 18);
            ctx.fillStyle = "#98afd1";
            ctx.fillText(this.formatPrice(price), width - priceLabelWidth + 6, labelY + 4);
        }

        const approxMaxLabels = Math.max(3, Math.floor(width / 86));
        const zoomDensity = this.clamp(1 / Math.max(0.35, this.currentZoom), 0.7, 2.8);
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

            ctx.fillStyle = "rgba(7, 18, 34, 0.85)";
            ctx.fillRect(boxX, boxY, boxWidth, 16);
            ctx.fillStyle = "#98afd1";
            ctx.fillText(label.text, boxX + 5, boxY + 12);
            lastLabelEndX = boxX + boxWidth;
        }

        ctx.restore();
    }

    private renderCrosshairOverlay(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        const geometry = this.buildSeriesGeometry();
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
            lowerIndicators: this.indicatorEngine.getLowerIndicators(),
        }, {
            clamp: this.clamp.bind(this),
            canvasToWorldPoint: this.canvasToWorldPoint.bind(this),
            worldYToPriceValueInternal: this.worldYToPriceValueInternal.bind(this),
            formatPrice: this.formatPrice.bind(this),
            formatTimeLabel: this.formatTimeLabel.bind(this),
        });
    }

    private renderSelectionOverlay(
        ctx: CanvasRenderingContext2D,
        width: number,
        height: number,
        geometry: SeriesGeometry | null
    ): void {
        const selectedCandle = this.getCandleByIndex(this.selectedCandleIndex, geometry);
        if (!selectedCandle) {
            return;
        }

        ctx.save();
        ctx.fillStyle = "rgba(255, 204, 102, 0.08)";
        ctx.strokeStyle = "rgba(255, 204, 102, 0.6)";
        ctx.lineWidth = 1;
        ctx.fillRect(selectedCandle.screenX - 14, 0, 28, height);

        ctx.beginPath();
        ctx.moveTo(selectedCandle.screenX, 0);
        ctx.lineTo(selectedCandle.screenX, height);
        ctx.stroke();

        const label = `Selected #${selectedCandle.index + 1}`;
        ctx.font = "12px 'Segoe UI', sans-serif";
        const textWidth = ctx.measureText(label).width;
        const boxWidth = textWidth + 10;
        const boxX = 12;
        const boxY = 12;

        ctx.fillStyle = "rgba(18, 28, 47, 0.92)";
        ctx.fillRect(boxX, boxY, boxWidth, 18);
        ctx.fillStyle = "#ffcc66";
        ctx.fillText(label, boxX + 5, boxY + 13);
        ctx.restore();
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
        });
    }

    private renderTooltipOverlay(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        const geometry = this.buildSeriesGeometry();
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
            lowerIndicators: this.indicatorEngine.getLowerIndicators(),
        }, {
            formatPrice: this.formatPrice.bind(this),
            rectsOverlap: this.rectsOverlap.bind(this),
            getAnalyticsPanelBounds: this.getAnalyticsPanelBounds.bind(this),
        });
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

    private getIndicatorPaneBounds(width: number, height: number): PaneRect | null {
        const hasLowerPane = this.indicatorEngine.hasLowerPane();
        if (!hasLowerPane) {
            return null;
        }
        const panelHeight = Math.max(110, Math.min(200, height * this.indicatorPaneHeightRatio));
        const panelY = height - panelHeight;
        const panelX = 0;
        const panelWidth = width;
        const padding = 10;

        return {
            x: panelX,
            y: panelY,
            width: panelWidth,
            height: panelHeight,
            innerX: panelX + padding,
            innerY: panelY + padding,
            innerWidth: Math.max(0, panelWidth - (padding * 2)),
            innerHeight: Math.max(0, panelHeight - (padding * 2)),
        };
    }

    private nextId(prefix: "series" | "drawing" | "indicator"): string {
        this.idCounter += 1;
        return `${prefix}_${this.idCounter}`;
    }
}






