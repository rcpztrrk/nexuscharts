export interface InitOptions {
    canvasId: string;
    width?: number;
    height?: number;
    wasmScriptPath?: string;
    wasmBinaryPath?: string;
    enableInteraction?: boolean;
    analytics?: AnalyticsOptions;
    ui?: UiOptions;
    onReady?: (chart: NexusCharts) => void;
}

export interface UiOptions {
    showAxes?: boolean;
    showCrosshair?: boolean;
    showTooltip?: boolean;
    showControlBar?: boolean;
    tooltipMode?: "follow" | "fixed";
    persistState?: boolean;
    autoScaleY?: boolean;
    axisTickCount?: number;
    pricePrecision?: number;
}

export interface UiState {
    showAxes: boolean;
    showCrosshair: boolean;
    showTooltip: boolean;
    showControlBar: boolean;
    tooltipMode: "follow" | "fixed";
    persistState: boolean;
    autoScaleY: boolean;
    showHeatmap: boolean;
    showAnalyticsPanel: boolean;
}

export interface AnalyticsOptions {
    showRewardCurve?: boolean;
    showPnlCurve?: boolean;
    showHeatmap?: boolean;
    maxFrames?: number;
}

export interface CandleDataPoint {
    time: number | string;
    open: number;
    high: number;
    low: number;
    close: number;
}

export type SeriesType = "candlestick";

export type AgentAction = "buy" | "sell" | "hold";

export interface ObserverFrame {
    time: number;
    reward: number;
    pnl: number;
    confidence?: number;
    action?: AgentAction;
    x?: number; // normalized world space [-1, 1]
    y?: number; // normalized world space [-1, 1]
}

export interface ObserverMetrics {
    frameCount: number;
    lastReward: number;
    lastPnl: number;
    averageReward: number;
    source: "wasm" | "js";
}

export interface WorldPoint {
    x: number;
    y: number;
}

export interface ScreenPoint {
    x: number;
    y: number;
}

export interface HoveredCandle {
    index: number;
    time: number | string;
    open: number;
    high: number;
    low: number;
    close: number;
    screenX: number;
    screenY: number;
    worldX: number;
}

export interface SeriesOptions {
    id?: string;
    type?: SeriesType;
}

export type IndicatorType = "sma" | "ema" | "rsi";

export interface IndicatorDefinition {
    id?: string;
    type: IndicatorType;
    period: number;
    pane?: "main" | "lower";
    color?: string;
}

export interface IndicatorSeries {
    id: string;
    type: IndicatorType;
    period: number;
    pane: "main" | "lower";
    color: string;
    values: Array<number | null>;
}

export interface SeriesApi {
    id: string;
    type: SeriesType;
    setData: (data: CandleDataPoint[]) => void;
    update: (point: CandleDataPoint) => void;
    getData: () => CandleDataPoint[];
    clear: () => void;
}

export interface DrawingPoint {
    x: number; // normalized screen space [-1, 1]
    y: number; // normalized screen space [-1, 1]
}

export interface DrawingStyle {
    color?: string;
    width?: number;
    dash?: number[];
}

export type DrawingType = "line" | "polyline" | "horizontal_line" | "vertical_line";

export interface DrawingDefinition {
    id?: string;
    type: DrawingType;
    points?: DrawingPoint[];
    x?: number;
    y?: number;
    style?: DrawingStyle;
}

interface StoredDrawing extends DrawingDefinition {
    id: string;
}

interface NormalizedObserverFrame {
    time: number;
    reward: number;
    pnl: number;
    confidence: number;
    action: AgentAction;
    x: number;
    y: number;
}

interface NormalizedCandleDataPoint {
    source: CandleDataPoint;
    x: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

interface SeriesGeometry {
    candles: NormalizedCandleDataPoint[];
    minPrice: number;
    maxPrice: number;
    scale: number;
}

interface OverlayRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface ControlButtonState extends OverlayRect {
    id: "fit" | "axes" | "crosshair" | "tooltip" | "tooltip_mode" | "autoscale" | "heatmap" | "analytics";
    label: string;
    hint: string;
    active: boolean;
    kind: "action" | "toggle";
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

interface PersistedChartState {
    ui: Pick<UiState, "showAxes" | "showCrosshair" | "showTooltip" | "showControlBar" | "tooltipMode" | "persistState" | "autoScaleY">;
    analytics: Pick<AnalyticsOptions, "showHeatmap" | "showRewardCurve" | "showPnlCurve">;
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
    private readonly seriesStore = new Map<string, { type: SeriesType; data: CandleDataPoint[] }>();
    private readonly drawingStore = new Map<string, StoredDrawing>();
    private readonly observerFrames: NormalizedObserverFrame[] = [];
    private readonly indicatorStore = new Map<string, IndicatorSeries>();
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
        const persisted = this.loadPersistedChartState();
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

        this.seriesStore.set(id, { type, data: [] });

        const setData = (data: CandleDataPoint[]) => {
            const series = this.seriesStore.get(id);
            if (!series) return;
            series.data = [...data];
            this.syncSeriesToEngine(id);
            this.recomputeIndicators();
            this.autoScaleVisibleY();
            this.refreshHoverFromStoredPointer();
            this.redrawDrawings();
        };

        const update = (point: CandleDataPoint) => {
            const series = this.seriesStore.get(id);
            if (!series) return;
            series.data.push(point);
            this.syncSeriesToEngine(id);
            this.recomputeIndicators();
            this.autoScaleVisibleY();
            this.refreshHoverFromStoredPointer();
            this.redrawDrawings();
        };

        const getData = (): CandleDataPoint[] => {
            const series = this.seriesStore.get(id);
            return series ? [...series.data] : [];
        };

        const clear = () => {
            const series = this.seriesStore.get(id);
            if (!series) return;
            series.data = [];
            this.syncSeriesToEngine(id);
            this.recomputeIndicators();
            this.autoScaleVisibleY();
            this.refreshHoverFromStoredPointer();
            this.redrawDrawings();
        };

        return { id, type, setData, update, getData, clear };
    }

    public addIndicator(definition: IndicatorDefinition): string {
        const id = definition.id ?? this.nextId("indicator");
        if (this.indicatorStore.has(id)) {
            throw new Error(`[NexusCharts] Indicator id '${id}' already exists.`);
        }
        const period = Math.max(2, Math.floor(definition.period));
        const pane = definition.pane ?? (definition.type === "rsi" ? "lower" : "main");
        const color = definition.color ?? (definition.type === "rsi" ? "#7dd3fc" : "#fbbf24");
        this.indicatorStore.set(id, {
            id,
            type: definition.type,
            period,
            pane,
            color,
            values: [],
        });
        this.recomputeIndicators();
        this.redrawDrawings();
        return id;
    }

    public removeIndicator(id: string): boolean {
        const removed = this.indicatorStore.delete(id);
        if (removed) {
            this.redrawDrawings();
        }
        return removed;
    }

    public clearIndicators(): void {
        this.indicatorStore.clear();
        this.redrawDrawings();
    }

    public getIndicators(): IndicatorSeries[] {
        return Array.from(this.indicatorStore.values()).map((indicator) => ({
            ...indicator,
            values: [...indicator.values],
        }));
    }

    public addDrawing(definition: DrawingDefinition): string {
        const id = definition.id ?? this.nextId("drawing");
        const stored: StoredDrawing = { ...definition, id };
        this.drawingStore.set(id, stored);
        this.redrawDrawings();
        return id;
    }

    public removeDrawing(id: string): boolean {
        const removed = this.drawingStore.delete(id);
        if (removed) {
            this.redrawDrawings();
        }
        return removed;
    }

    public clearDrawings(): void {
        this.drawingStore.clear();
        this.redrawDrawings();
    }

    public configureUi(options: UiOptions): void {
        this.uiOptions = this.normalizeUiOptions(options);
        if (!this.uiOptions.showControlBar) {
            this.controlButtons = [];
        }
        this.persistChartState();
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
        this.trimObserverFramesToLimit();
        this.persistChartState();
        this.redrawDrawings();
    }

    public pushObserverFrame(frame: ObserverFrame): void {
        const normalized = this.normalizeObserverFrame(frame, this.observerFrames.length);
        if (!normalized) {
            return;
        }
        this.observerFrames.push(normalized);
        this.trimObserverFramesToLimit();
        this.syncObserverFrameToEngine(normalized);
        this.redrawDrawings();
    }

    public setObserverFrames(frames: ObserverFrame[]): void {
        this.observerFrames.length = 0;
        for (let i = 0; i < frames.length; i += 1) {
            const normalized = this.normalizeObserverFrame(frames[i], i);
            if (normalized) {
                this.observerFrames.push(normalized);
            }
        }
        this.trimObserverFramesToLimit();
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
            this.isDragging = true;
            this.draggedDuringPointer = false;
            this.lastPointerX = event.clientX;
            this.lastPointerY = event.clientY;
            this.updateHoverFromClientPosition(event.clientX, event.clientY);
        };

        const onMouseMove = (event: MouseEvent) => {
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
        };

        const onClick = (event: MouseEvent) => {
            if (this.handleControlBarClick(event.clientX, event.clientY)) {
                return;
            }
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
        window.addEventListener("resize", onResize);
        window.addEventListener("keydown", onKeyDown);

        this.cleanupHandlers.push(() => canvas.removeEventListener("mousedown", onMouseDown));
        this.cleanupHandlers.push(() => window.removeEventListener("mousemove", onMouseMove));
        this.cleanupHandlers.push(() => window.removeEventListener("mouseup", stopDragging));
        this.cleanupHandlers.push(() => canvas.removeEventListener("mouseleave", stopDragging));
        this.cleanupHandlers.push(() => canvas.removeEventListener("mouseleave", clearHover));
        this.cleanupHandlers.push(() => canvas.removeEventListener("click", onClick));
        this.cleanupHandlers.push(() => canvas.removeEventListener("dblclick", onDoubleClick));
        this.cleanupHandlers.push(() => canvas.removeEventListener("wheel", onWheel));
        this.cleanupHandlers.push(() => window.removeEventListener("resize", onResize));
        this.cleanupHandlers.push(() => window.removeEventListener("keydown", onKeyDown));
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

        if (typeof this.module.setSeriesData !== "function") {
            if (this.warnMissingSetSeriesData) {
                console.warn("[NexusCharts] WASM export 'setSeriesData' is not available.");
                this.warnMissingSetSeriesData = false;
            }
            return;
        }

        const opens: number[] = [];
        const highs: number[] = [];
        const lows: number[] = [];
        const closes: number[] = [];

        for (const point of series.data) {
            const open = Number(point.open);
            const high = Number(point.high);
            const low = Number(point.low);
            const close = Number(point.close);
            if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
                continue;
            }
            opens.push(open);
            highs.push(high);
            lows.push(low);
            closes.push(close);
        }

        try {
            this.module.setSeriesData(opens, highs, lows, closes);
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
        this.persistChartState();
        this.redrawDrawings();
    }

    private toggleTooltipMode(): void {
        this.uiOptions = {
            ...this.uiOptions,
            tooltipMode: this.uiOptions.tooltipMode === "follow" ? "fixed" : "follow",
        };
        this.persistChartState();
        this.redrawDrawings();
    }

    private toggleAutoScaleY(): void {
        this.uiOptions = {
            ...this.uiOptions,
            autoScaleY: !this.uiOptions.autoScaleY,
        };
        this.persistChartState();
        this.autoScaleVisibleY();
        this.redrawDrawings();
    }

    private toggleAnalyticsFlag(flag: "showHeatmap"): void {
        this.analyticsOptions = {
            ...this.analyticsOptions,
            [flag]: !this.analyticsOptions[flag],
        };
        this.persistChartState();
        this.redrawDrawings();
    }

    private toggleAnalyticsPanel(): void {
        const isVisible = this.analyticsOptions.showRewardCurve || this.analyticsOptions.showPnlCurve;
        this.analyticsOptions = {
            ...this.analyticsOptions,
            showRewardCurve: !isVisible,
            showPnlCurve: !isVisible,
        };
        this.persistChartState();
        this.redrawDrawings();
    }

    private getStorageKey(): string {
        return `nexuscharts:ui:${this.canvasId}`;
    }

    private loadPersistedChartState(): PersistedChartState | null {
        if (typeof window === "undefined" || !window.localStorage) {
            return null;
        }
        try {
            const raw = window.localStorage.getItem(this.getStorageKey());
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

    private persistChartState(): void {
        if (typeof window === "undefined" || !window.localStorage) {
            return;
        }
        if (!this.uiOptions.persistState) {
            try {
                window.localStorage.removeItem(this.getStorageKey());
            } catch {
                // Ignore storage failures.
            }
            return;
        }
        const state: PersistedChartState = {
            ui: {
                showAxes: this.uiOptions.showAxes,
                showCrosshair: this.uiOptions.showCrosshair,
                showTooltip: this.uiOptions.showTooltip,
                showControlBar: this.uiOptions.showControlBar,
                tooltipMode: this.uiOptions.tooltipMode,
                persistState: this.uiOptions.persistState,
            autoScaleY: this.uiOptions.autoScaleY,
            },
            analytics: {
                showHeatmap: this.analyticsOptions.showHeatmap,
                showRewardCurve: this.analyticsOptions.showRewardCurve,
                showPnlCurve: this.analyticsOptions.showPnlCurve,
            },
        };
        try {
            window.localStorage.setItem(this.getStorageKey(), JSON.stringify(state));
        } catch {
            // Ignore storage quota/privacy mode failures and keep runtime behavior.
        }
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

    private getPrimaryCandlestickSeries(): CandleDataPoint[] {
        for (const series of this.seriesStore.values()) {
            if (series.type === "candlestick" && series.data.length > 0) {
                return series.data;
            }
        }
        return [];
    }

    private buildSeriesGeometry(): SeriesGeometry | null {
        const source = this.getPrimaryCandlestickSeries();
        if (source.length === 0) {
            return null;
        }

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

        return { candles, minPrice, maxPrice, scale };
    }

    private recomputeIndicators(): void {
        if (this.indicatorStore.size === 0) {
            return;
        }
        const source = this.getPrimaryCandlestickSeries();
        const closes: number[] = source.map((point) => Number(point.close));
        const valid = closes.map((value) => (Number.isFinite(value) ? value : NaN));

        for (const indicator of this.indicatorStore.values()) {
            switch (indicator.type) {
                case "sma":
                    indicator.values = this.computeSma(valid, indicator.period);
                    break;
                case "ema":
                    indicator.values = this.computeEma(valid, indicator.period);
                    break;
                case "rsi":
                    indicator.values = this.computeRsi(valid, indicator.period);
                    break;
                default:
                    indicator.values = [];
                    break;
            }
        }
    }

    private computeSma(values: number[], period: number): Array<number | null> {
        const result: Array<number | null> = new Array(values.length).fill(null);
        if (values.length === 0) {
            return result;
        }
        let sum = 0;
        for (let i = 0; i < values.length; i += 1) {
            const value = values[i];
            if (!Number.isFinite(value)) {
                continue;
            }
            sum += value;
            if (i >= period) {
                const drop = values[i - period];
                if (Number.isFinite(drop)) {
                    sum -= drop;
                }
            }
            if (i >= period - 1) {
                result[i] = sum / period;
            }
        }
        return result;
    }

    private computeEma(values: number[], period: number): Array<number | null> {
        const result: Array<number | null> = new Array(values.length).fill(null);
        if (values.length === 0) {
            return result;
        }
        const k = 2 / (period + 1);
        let ema = 0;
        let initialized = false;
        let sum = 0;

        for (let i = 0; i < values.length; i += 1) {
            const value = values[i];
            if (!Number.isFinite(value)) {
                continue;
            }
            if (!initialized) {
                sum += value;
                if (i >= period - 1) {
                    ema = sum / period;
                    initialized = true;
                    result[i] = ema;
                }
            } else {
                ema = (value * k) + (ema * (1 - k));
                result[i] = ema;
            }
        }
        return result;
    }

    private computeRsi(values: number[], period: number): Array<number | null> {
        const result: Array<number | null> = new Array(values.length).fill(null);
        if (values.length < period + 1) {
            return result;
        }
        let gainSum = 0;
        let lossSum = 0;

        for (let i = 1; i <= period; i += 1) {
            const change = values[i] - values[i - 1];
            if (!Number.isFinite(change)) {
                continue;
            }
            if (change >= 0) gainSum += change;
            else lossSum += Math.abs(change);
        }
        let avgGain = gainSum / period;
        let avgLoss = lossSum / period;
        result[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));

        for (let i = period + 1; i < values.length; i += 1) {
            const change = values[i] - values[i - 1];
            const gain = Number.isFinite(change) && change > 0 ? change : 0;
            const loss = Number.isFinite(change) && change < 0 ? Math.abs(change) : 0;
            avgGain = ((avgGain * (period - 1)) + gain) / period;
            avgLoss = ((avgLoss * (period - 1)) + loss) / period;
            if (avgLoss === 0) {
                result[i] = 100;
            } else {
                const rs = avgGain / avgLoss;
                result[i] = 100 - (100 / (1 + rs));
            }
        }

        return result;
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

    private worldYToPrice(worldY: number, geometry: SeriesGeometry): number {
        return geometry.minPrice + ((worldY + 0.85) / geometry.scale);
    }

    private priceToWorldY(price: number, geometry: SeriesGeometry): number {
        return ((price - geometry.minPrice) * geometry.scale) - 0.85;
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
            return;
        }

        const rect = surface.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            this.hoveredCandle = null;
            return;
        }

        const canvasX = ((clientX - rect.left) / rect.width) * surface.width;
        const canvasY = ((clientY - rect.top) / rect.height) * surface.height;
        if (canvasX < 0 || canvasX > surface.width || canvasY < 0 || canvasY > surface.height) {
            this.hoverCanvasX = null;
            this.hoverCanvasY = null;
            this.hoveredCandle = null;
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

        parent.appendChild(overlay);
        this.overlayCanvas = overlay;
        this.overlayCtx = overlay.getContext("2d");
    }

    private redrawDrawings(): void {
        if (!this.overlayCanvas || !this.overlayCtx) {
            return;
        }

        const ctx = this.overlayCtx;
        const width = this.overlayCanvas.width;
        const height = this.overlayCanvas.height;
        ctx.clearRect(0, 0, width, height);
        const geometry = this.buildSeriesGeometry();

        const toCanvas = (point: DrawingPoint): { x: number; y: number } => ({
            x: this.worldToCanvasPoint(point.x, point.y, width, height).x,
            y: this.worldToCanvasPoint(point.x, point.y, width, height).y,
        });

        for (const drawing of this.drawingStore.values()) {
            const style = drawing.style ?? {};
            ctx.save();
            ctx.strokeStyle = style.color ?? "#8ea6c9";
            ctx.lineWidth = style.width ?? 1.5;
            ctx.setLineDash(style.dash ?? []);

            if (drawing.type === "line" && drawing.points && drawing.points.length >= 2) {
                const p0 = toCanvas(drawing.points[0]);
                const p1 = toCanvas(drawing.points[1]);
                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                ctx.lineTo(p1.x, p1.y);
                ctx.stroke();
            } else if (drawing.type === "polyline" && drawing.points && drawing.points.length >= 2) {
                const first = toCanvas(drawing.points[0]);
                ctx.beginPath();
                ctx.moveTo(first.x, first.y);
                for (let i = 1; i < drawing.points.length; i += 1) {
                    const p = toCanvas(drawing.points[i]);
                    ctx.lineTo(p.x, p.y);
                }
                ctx.stroke();
            } else if (drawing.type === "horizontal_line" && typeof drawing.y === "number") {
                const y = toCanvas({ x: 0, y: drawing.y }).y;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            } else if (drawing.type === "vertical_line" && typeof drawing.x === "number") {
                const x = toCanvas({ x: drawing.x, y: 0 }).x;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }

            ctx.restore();
        }

        this.renderAxesOverlay(ctx, width, height, geometry);
        this.renderIndicatorOverlay(ctx, width, height, geometry);
        this.renderAnalyticsOverlay(ctx, width, height, toCanvas);
        this.renderSelectionOverlay(ctx, width, height, geometry);
        this.renderCrosshairOverlay(ctx, width, height);
        this.renderTooltipOverlay(ctx, width, height);
        this.renderControlBarOverlay(ctx, width, height);
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
        const visibleMinPrice = this.worldYToPrice(bottomWorldY, geometry);
        const visibleMaxPrice = this.worldYToPrice(topWorldY, geometry);
        const priceTicks = this.buildNiceTicks(visibleMinPrice, visibleMaxPrice, tickCount);

        for (const price of priceTicks) {
            const worldY = this.priceToWorldY(price, geometry);
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
        const hoverInLowerPane = !!(
            indicatorPane
            && this.hoverCanvasY !== null
            && this.hoverCanvasY >= indicatorPane.y
        );
        const paneTop = hoverInLowerPane && indicatorPane ? indicatorPane.y : 0;
        const paneBottom = hoverInLowerPane && indicatorPane
            ? indicatorPane.y + indicatorPane.height
            : (indicatorPane ? indicatorPane.y : height);
        const lineY = this.clamp(activeY, paneTop + 2, paneBottom - 2);

        ctx.save();
        ctx.strokeStyle = "rgba(120, 188, 255, 0.55)";
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);

        ctx.beginPath();
        ctx.moveTo(activeCandle.screenX, 0);
        ctx.lineTo(activeCandle.screenX, height);
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
        ctx.fillStyle = "rgba(87, 212, 255, 0.9)";
        ctx.beginPath();
        ctx.arc(activeCandle.screenX, lineY, 3, 0, Math.PI * 2);
        ctx.fill();

        const timeText = this.formatTimeLabel(activeCandle.time);

        ctx.font = "11px 'Segoe UI', sans-serif";

        if (!hoverInLowerPane) {
            const worldAtCursor = this.canvasToWorldPoint(activeCandle.screenX, lineY, width, height);
            const priceAtCursor = this.worldYToPrice(worldAtCursor.y, geometry);
            const priceText = this.formatPrice(priceAtCursor);
            const priceTextWidth = ctx.measureText(priceText).width;
            const priceBoxWidth = priceTextWidth + 12;
            const priceBoxHeight = 18;
            const priceBoxX = width - priceBoxWidth - 4;
            const priceBoxY = Math.max(4, Math.min(height - priceBoxHeight - 24, lineY - 9));

            ctx.fillStyle = "rgba(10, 24, 44, 0.95)";
            ctx.strokeStyle = "rgba(120, 188, 255, 0.55)";
            ctx.lineWidth = 1;
            ctx.fillRect(priceBoxX, priceBoxY, priceBoxWidth, priceBoxHeight);
            ctx.strokeRect(priceBoxX, priceBoxY, priceBoxWidth, priceBoxHeight);
            ctx.fillStyle = "#8fd8ff";
            ctx.fillText(priceText, priceBoxX + 6, priceBoxY + 13);
        } else if (indicatorPane) {
            const lowerIndicators = Array.from(this.indicatorStore.values()).filter((indicator) => indicator.pane === "lower");
            if (lowerIndicators.length > 0) {
                let minValue = Number.POSITIVE_INFINITY;
                let maxValue = Number.NEGATIVE_INFINITY;
                let allRsi = true;
                for (const indicator of lowerIndicators) {
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
                    const t = this.clamp(
                        1 - ((lineY - indicatorPane.innerY) / Math.max(1, indicatorPane.innerHeight)),
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
                        indicatorPane.y + 4,
                        Math.min(indicatorPane.y + indicatorPane.height - labelHeight - 4, lineY - 9)
                    );

                    ctx.fillStyle = "rgba(10, 24, 44, 0.95)";
                    ctx.strokeStyle = "rgba(120, 188, 255, 0.5)";
                    ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
                    ctx.strokeRect(labelX, labelY, labelWidth, labelHeight);
                    ctx.fillStyle = "#9dc7f5";
                    ctx.fillText(labelText, labelX + 6, labelY + 13);
                }
            }
        }

        const timeTextWidth = ctx.measureText(timeText).width;
        const timeBoxWidth = timeTextWidth + 12;
        const timeBoxHeight = 16;
        const timeBoxX = Math.max(4, Math.min(width - timeBoxWidth - 4, activeCandle.screenX - (timeBoxWidth * 0.5)));
        const timeBoxY = height - timeBoxHeight - 2;

        ctx.fillStyle = "rgba(10, 24, 44, 0.95)";
        ctx.strokeStyle = "rgba(120, 188, 255, 0.5)";
        ctx.fillRect(timeBoxX, timeBoxY, timeBoxWidth, timeBoxHeight);
        ctx.strokeRect(timeBoxX, timeBoxY, timeBoxWidth, timeBoxHeight);
        ctx.fillStyle = "#9dc7f5";
        ctx.fillText(timeText, timeBoxX + 6, timeBoxY + 12);
        ctx.restore();
    }

    private renderIndicatorOverlay(
        ctx: CanvasRenderingContext2D,
        width: number,
        height: number,
        geometry: SeriesGeometry | null
    ): void {
        if (!geometry || this.indicatorStore.size === 0) {
            return;
        }

        const indicatorPane = this.getIndicatorPaneBounds(width, height);
        if (indicatorPane) {
            ctx.save();
            ctx.fillStyle = "rgba(6, 13, 26, 0.92)";
            ctx.strokeStyle = "rgba(120, 148, 188, 0.35)";
            ctx.lineWidth = 1;
            ctx.fillRect(indicatorPane.x, indicatorPane.y, indicatorPane.width, indicatorPane.height);
            ctx.strokeRect(indicatorPane.x, indicatorPane.y, indicatorPane.width, indicatorPane.height);
            ctx.font = "11px 'Segoe UI', sans-serif";
            ctx.fillStyle = "#97b0d2";
            ctx.fillText("Indicators", indicatorPane.x + 12, indicatorPane.y + 16);
            ctx.restore();
        }

        for (const indicator of this.indicatorStore.values()) {
            if (indicator.values.length === 0) {
                continue;
            }
            if (indicator.pane === "lower" && indicatorPane) {
                this.renderIndicatorInPane(ctx, geometry, indicator, indicatorPane, width, height);
            } else {
                this.renderIndicatorInMain(ctx, geometry, indicator, width, height);
            }
        }
    }

    private renderIndicatorInMain(
        ctx: CanvasRenderingContext2D,
        geometry: SeriesGeometry,
        indicator: IndicatorSeries,
        width: number,
        height: number
    ): void {
        ctx.save();
        ctx.strokeStyle = indicator.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < geometry.candles.length; i += 1) {
            const value = indicator.values[i];
            if (!Number.isFinite(value ?? NaN)) {
                continue;
            }
            const worldY = this.priceToWorldY(value as number, geometry);
            const point = this.worldToCanvasPoint(geometry.candles[i].x, worldY, width, height);
            if (!started) {
                ctx.moveTo(point.x, point.y);
                started = true;
            } else {
                ctx.lineTo(point.x, point.y);
            }
        }
        if (started) {
            ctx.stroke();
        }
        ctx.restore();
    }

    private renderIndicatorInPane(
        ctx: CanvasRenderingContext2D,
        geometry: SeriesGeometry,
        indicator: IndicatorSeries,
        pane: PaneRect,
        width: number,
        height: number
    ): void {
        let minValue = Number.POSITIVE_INFINITY;
        let maxValue = Number.NEGATIVE_INFINITY;
        for (const value of indicator.values) {
            if (!Number.isFinite(value ?? NaN)) {
                continue;
            }
            minValue = Math.min(minValue, value as number);
            maxValue = Math.max(maxValue, value as number);
        }

        if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
            return;
        }

        if (indicator.type === "rsi") {
            minValue = 0;
            maxValue = 100;
        } else if (Math.abs(maxValue - minValue) < 1e-6) {
            maxValue += 1;
            minValue -= 1;
        }

        const mapY = (value: number): number => {
            const t = (value - minValue) / (maxValue - minValue);
            return pane.innerY + ((1 - t) * pane.innerHeight);
        };

        ctx.save();
        ctx.strokeStyle = indicator.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < geometry.candles.length; i += 1) {
            const value = indicator.values[i];
            if (!Number.isFinite(value ?? NaN)) {
                continue;
            }
            const x = this.worldToCanvasPoint(geometry.candles[i].x, geometry.candles[i].close, width, height).x;
            const y = mapY(value as number);
            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        }
        if (started) {
            ctx.stroke();
        }

        if (indicator.type === "rsi") {
            ctx.strokeStyle = "rgba(123, 148, 184, 0.35)";
            ctx.setLineDash([4, 3]);
            const y30 = mapY(30);
            const y70 = mapY(70);
            ctx.beginPath();
            ctx.moveTo(pane.innerX, y30);
            ctx.lineTo(pane.innerX + pane.innerWidth, y30);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(pane.innerX, y70);
            ctx.lineTo(pane.innerX + pane.innerWidth, y70);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.restore();
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
        this.controlButtons = [];
        if (!this.uiOptions.showControlBar) {
            return;
        }

        const buttons: Array<Omit<ControlButtonState, "x" | "y" | "width" | "height">> = [
            { id: "fit", label: "Fit", hint: "F", active: true, kind: "action" },
            { id: "autoscale", label: "AutoY", hint: "Y", active: this.uiOptions.autoScaleY, kind: "toggle" },
            { id: "axes", label: "Axes", hint: "A", active: this.uiOptions.showAxes, kind: "toggle" },
            { id: "crosshair", label: "Cross", hint: "C", active: this.uiOptions.showCrosshair, kind: "toggle" },
            { id: "tooltip", label: "Tip", hint: "T", active: this.uiOptions.showTooltip, kind: "toggle" },
            {
                id: "tooltip_mode",
                label: this.uiOptions.tooltipMode === "fixed" ? "Mode:Fix" : "Mode:Follow",
                hint: "M",
                active: this.uiOptions.tooltipMode === "fixed",
                kind: "toggle",
            },
            { id: "heatmap", label: "Heat", hint: "H", active: this.analyticsOptions.showHeatmap, kind: "toggle" },
            {
                id: "analytics",
                label: "Panel",
                hint: "G",
                active: this.analyticsOptions.showRewardCurve || this.analyticsOptions.showPnlCurve,
                kind: "toggle",
            },
        ];

        ctx.save();
        ctx.font = "11px 'Segoe UI', sans-serif";

        let cursorX = 12;
        const cursorY = this.selectedCandleIndex !== null ? 36 : 12;
        const gap = 6;

        for (const button of buttons) {
            const label = `${button.label} ${button.hint}`;
            const textWidth = ctx.measureText(label).width;
            const buttonWidth = textWidth + 14;
            if (cursorX + buttonWidth > (width - 12)) {
                break;
            }

            const state: ControlButtonState = {
                ...button,
                x: cursorX,
                y: cursorY,
                width: buttonWidth,
                height: 20,
            };
            this.controlButtons.push(state);
            cursorX += buttonWidth + gap;
        }

        for (const button of this.controlButtons) {
            const fill = button.kind === "action"
                ? "rgba(18, 28, 47, 0.92)"
                : button.active
                    ? "rgba(21, 69, 119, 0.88)"
                    : "rgba(18, 28, 47, 0.78)";
            const stroke = button.active
                ? "rgba(120, 188, 255, 0.55)"
                : "rgba(120, 148, 188, 0.28)";

            ctx.fillStyle = fill;
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1;
            ctx.fillRect(button.x, button.y, button.width, button.height);
            ctx.strokeRect(button.x, button.y, button.width, button.height);

            ctx.fillStyle = button.kind === "action"
                ? "#dce7ff"
                : button.active
                    ? "#eef6ff"
                    : "#9bb3d6";
            ctx.fillText(button.label, button.x + 6, button.y + 13);

            const hintWidth = ctx.measureText(button.hint).width;
            ctx.fillStyle = button.active ? "rgba(255, 209, 102, 0.95)" : "rgba(173, 191, 221, 0.72)";
            ctx.fillText(button.hint, button.x + button.width - hintWidth - 6, button.y + 13);
        }

        ctx.restore();
    }

    private renderTooltipOverlay(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        const geometry = this.buildSeriesGeometry();
        const selectedCandle = this.getCandleByIndex(this.selectedCandleIndex, geometry);
        const activeCandle = this.uiOptions.tooltipMode === "fixed"
            ? (selectedCandle ?? this.hoveredCandle)
            : (this.hoveredCandle ?? selectedCandle);
        if (!this.uiOptions.showTooltip || !activeCandle) {
            return;
        }

        const indicatorPane = this.getIndicatorPaneBounds(width, height);
        const hoverInLowerPane = !!(
            indicatorPane
            && this.hoverCanvasY !== null
            && this.hoverCanvasY >= indicatorPane.y
        );

        const anchorX = this.hoverCanvasX ?? activeCandle.screenX;
        const anchorY = this.hoverCanvasY ?? activeCandle.screenY;
        const delta = activeCandle.close - activeCandle.open;
        const deltaPercent = activeCandle.open !== 0 ? (delta / activeCandle.open) * 100.0 : 0.0;
        const range = activeCandle.high - activeCandle.low;
        const lines = [
            `T ${activeCandle.time}`,
            `O ${this.formatPrice(activeCandle.open)}`,
            `H ${this.formatPrice(activeCandle.high)}`,
            `L ${this.formatPrice(activeCandle.low)}`,
            `C ${this.formatPrice(activeCandle.close)}`,
            `D ${delta >= 0 ? "+" : ""}${this.formatPrice(delta)} (${deltaPercent.toFixed(2)}%)`,
            `R ${this.formatPrice(range)}`,
        ];

        ctx.save();
        ctx.font = "12px 'Segoe UI', sans-serif";

        if (hoverInLowerPane && indicatorPane) {
            const lowerIndicators = Array.from(this.indicatorStore.values()).filter((indicator) => indicator.pane === "lower");
            const indicatorLines: string[] = [];
            for (const indicator of lowerIndicators) {
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
                indicatorPane.y + 6,
                Math.min(indicatorPane.y + indicatorPane.height - boxHeight - 6, anchorY - 10)
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
        const analyticsPanel = this.getAnalyticsPanelBounds(width, height);
        let boxX = 12;
        let boxY = 10;

        if (this.uiOptions.tooltipMode === "fixed") {
            const topInset = this.uiOptions.showControlBar
                ? (this.selectedCandleIndex !== null ? 62 : 38)
                : 10;
            boxY = Math.max(10, Math.min(height - boxHeight - 10, topInset));
        } else {
            boxX = Math.min(width - boxWidth - 10, anchorX + 14);
            boxY = Math.max(10, Math.min(height - boxHeight - 10, anchorY - 10));
        }

        if (analyticsPanel && this.rectsOverlap(boxX, boxY, boxWidth, boxHeight, analyticsPanel)) {
            if (this.uiOptions.tooltipMode === "fixed") {
                boxY = Math.min(height - boxHeight - 10, analyticsPanel.y + analyticsPanel.height + 10);
                boxX = 12;
            } else {
                boxX = Math.max(10, anchorX - boxWidth - 14);
            }
        }
        if (analyticsPanel && this.rectsOverlap(boxX, boxY, boxWidth, boxHeight, analyticsPanel)) {
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

    private normalizeObserverFrame(frame: ObserverFrame, sequenceIndex: number): NormalizedObserverFrame | null {
        const reward = Number(frame.reward);
        const pnl = Number(frame.pnl);
        if (!Number.isFinite(reward) || !Number.isFinite(pnl)) {
            return null;
        }

        const parsedTime = Number(frame.time);
        const time = Number.isFinite(parsedTime) ? parsedTime : sequenceIndex;
        const confidenceRaw = Number(frame.confidence ?? 0.65);
        const confidence = this.clamp(Number.isFinite(confidenceRaw) ? confidenceRaw : 0.65, 0, 1);

        const action: AgentAction = frame.action ?? (reward > 0 ? "buy" : reward < 0 ? "sell" : "hold");
        const xRaw = Number(frame.x);
        const yRaw = Number(frame.y);

        const x = Number.isFinite(xRaw)
            ? this.clamp(xRaw, -1, 1)
            : this.defaultObserverX(sequenceIndex);
        const y = Number.isFinite(yRaw)
            ? this.clamp(yRaw, -1, 1)
            : this.defaultObserverY(action);

        return { time, reward, pnl, confidence, action, x, y };
    }

    private defaultObserverX(sequenceIndex: number): number {
        const span = Math.max(1, this.analyticsOptions.maxFrames - 1);
        const wrapped = sequenceIndex % this.analyticsOptions.maxFrames;
        return this.clamp(-0.9 + ((1.8 * wrapped) / span), -0.95, 0.95);
    }

    private defaultObserverY(action: AgentAction): number {
        if (action === "buy") return 0.45;
        if (action === "sell") return -0.45;
        return 0.0;
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
        if (this.observerFrames.length === 0) {
            return null;
        }
        if (!this.analyticsOptions.showRewardCurve && !this.analyticsOptions.showPnlCurve) {
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

    private getIndicatorPaneBounds(width: number, height: number): PaneRect | null {
        const hasLowerPane = Array.from(this.indicatorStore.values()).some((indicator) => indicator.pane === "lower");
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

    private trimObserverFramesToLimit(): void {
        const overflow = this.observerFrames.length - this.analyticsOptions.maxFrames;
        if (overflow > 0) {
            this.observerFrames.splice(0, overflow);
        }
    }

    private renderAnalyticsOverlay(
        ctx: CanvasRenderingContext2D,
        width: number,
        height: number,
        toCanvas: (point: DrawingPoint) => { x: number; y: number }
    ): void {
        if (this.observerFrames.length === 0) {
            return;
        }

        const frames = this.observerFrames.slice(-this.analyticsOptions.maxFrames);

        if (this.analyticsOptions.showHeatmap) {
            for (const frame of frames) {
                const point = toCanvas({ x: frame.x, y: frame.y });
                const radius = 2.5 + (frame.confidence * 4.5);
                let color = "#ffd166";
                if (frame.action === "buy") color = "#39d98a";
                if (frame.action === "sell") color = "#ff5c70";

                ctx.save();
                ctx.globalAlpha = 0.12 + (frame.confidence * 0.35);
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        if (!this.analyticsOptions.showRewardCurve && !this.analyticsOptions.showPnlCurve) {
            return;
        }

        const analyticsPanel = this.getAnalyticsPanelBounds(width, height);
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
        for (const frame of frames) {
            if (this.analyticsOptions.showRewardCurve) {
                minValue = Math.min(minValue, frame.reward);
                maxValue = Math.max(maxValue, frame.reward);
            }
            if (this.analyticsOptions.showPnlCurve) {
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
            const d = Math.max(1, frames.length - 1);
            return plotX + ((index / d) * plotW);
        };
        const yForValue = (value: number): number => {
            const t = (value - minValue) / (maxValue - minValue);
            return plotY + ((1 - t) * plotH);
        };

        ctx.save();
        ctx.fillStyle = "rgba(6, 15, 30, 0.72)";
        ctx.strokeStyle = "rgba(120, 148, 188, 0.45)";
        ctx.lineWidth = 1;
        ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
        ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

        if (minValue <= 0 && maxValue >= 0) {
            ctx.strokeStyle = "rgba(115, 138, 171, 0.35)";
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
            for (let i = 0; i < frames.length; i += 1) {
                const x = xForIndex(i);
                const y = yForValue(extract(frames[i]));
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        };

        if (this.analyticsOptions.showRewardCurve) {
            drawCurve((frame) => frame.reward, "#57d4ff");
        }
        if (this.analyticsOptions.showPnlCurve) {
            drawCurve((frame) => frame.pnl, "#ffb86b");
        }

        const last = frames[frames.length - 1];
        ctx.font = "12px 'Segoe UI', sans-serif";
        ctx.fillStyle = "#dce7ff";
        ctx.fillText("Observer Analytics", panelX + 10, panelY + 16);

        let metricsX = panelX + 10;
        if (this.analyticsOptions.showRewardCurve) {
            ctx.fillStyle = "#57d4ff";
            ctx.fillText(`R ${last.reward.toFixed(2)}`, metricsX, panelY + panelHeight - 8);
            metricsX += 70;
        }
        if (this.analyticsOptions.showPnlCurve) {
            ctx.fillStyle = "#ffb86b";
            ctx.fillText(`P ${last.pnl.toFixed(2)}`, metricsX, panelY + panelHeight - 8);
        }

        ctx.restore();
    }

    private nextId(prefix: "series" | "drawing" | "indicator"): string {
        this.idCounter += 1;
        return `${prefix}_${this.idCounter}`;
    }
}