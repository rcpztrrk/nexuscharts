export interface InitOptions {
    canvasId: string;
    width?: number;
    height?: number;
    wasmScriptPath?: string;
    wasmBinaryPath?: string;
    enableInteraction?: boolean;
    analytics?: AnalyticsOptions;
    onReady?: (chart: NexusCharts) => void;
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

export interface SeriesOptions {
    id?: string;
    type?: SeriesType;
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

interface NexusWasmModule {
    initEngine: (canvasSelector: string, width: number, height: number) => boolean;
    destroyEngine: () => void;
    panCamera: (deltaX: number, deltaY: number) => void;
    zoomCamera: (zoomFactor: number) => void;
    setSeriesData: (opens: number[], highs: number[], lows: number[], closes: number[]) => void;
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
    private isDragging: boolean = false;
    private lastPointerX: number = 0;
    private lastPointerY: number = 0;
    private cleanupHandlers: Array<() => void> = [];
    private readonly seriesStore = new Map<string, { type: SeriesType; data: CandleDataPoint[] }>();
    private readonly drawingStore = new Map<string, StoredDrawing>();
    private readonly observerFrames: NormalizedObserverFrame[] = [];
    private analyticsOptions: Required<AnalyticsOptions> = {
        showRewardCurve: true,
        showPnlCurve: true,
        showHeatmap: true,
        maxFrames: 240,
    };
    private warnMissingSetSeriesData: boolean = true;
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
        if (options.analytics) {
            this.analyticsOptions = this.normalizeAnalyticsOptions(options.analytics);
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
        this.module.panCamera(deltaX, deltaY);
        this.redrawDrawings();
    }

    public zoom(zoomFactor: number): void {
        if (!this.moduleLoaded || !this.module) {
            return;
        }
        this.currentZoom = Math.min(5.0, Math.max(0.2, this.currentZoom * zoomFactor));
        this.module.zoomCamera(zoomFactor);
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
        };

        const update = (point: CandleDataPoint) => {
            const series = this.seriesStore.get(id);
            if (!series) return;
            series.data.push(point);
            this.syncSeriesToEngine(id);
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
        };

        return { id, type, setData, update, getData, clear };
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

    public configureAnalytics(options: AnalyticsOptions): void {
        this.analyticsOptions = this.normalizeAnalyticsOptions(options);
        this.trimObserverFramesToLimit();
        this.redrawDrawings();
    }

    public pushObserverFrame(frame: ObserverFrame): void {
        const normalized = this.normalizeObserverFrame(frame, this.observerFrames.length);
        if (!normalized) {
            return;
        }
        this.observerFrames.push(normalized);
        this.trimObserverFramesToLimit();
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
        this.redrawDrawings();
    }

    public getObserverFrames(): ObserverFrame[] {
        return this.observerFrames.map((frame) => ({ ...frame }));
    }

    public clearObserverFrames(): void {
        this.observerFrames.length = 0;
        this.redrawDrawings();
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
            this.isDragging = true;
            this.lastPointerX = event.clientX;
            this.lastPointerY = event.clientY;
        };

        const onMouseMove = (event: MouseEvent) => {
            if (!this.isDragging) {
                return;
            }

            const dx = event.clientX - this.lastPointerX;
            const dy = event.clientY - this.lastPointerY;
            this.lastPointerX = event.clientX;
            this.lastPointerY = event.clientY;

            const width = canvas.width || 1;
            const height = canvas.height || 1;
            const aspect = width / height;
            const worldUnitsPerPixelX = (2.0 * this.currentZoom * aspect) / width;
            const worldUnitsPerPixelY = (2.0 * this.currentZoom) / height;

            this.pan(-dx * worldUnitsPerPixelX, dy * worldUnitsPerPixelY);
        };

        const stopDragging = () => {
            this.isDragging = false;
        };

        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            const zoomFactor = event.deltaY > 0 ? 1.08 : 0.92;
            this.zoom(zoomFactor);
        };

        const onResize = () => {
            if (!this.canvas || !this.overlayCanvas) {
                return;
            }
            this.overlayCanvas.width = this.canvas.width;
            this.overlayCanvas.height = this.canvas.height;
            this.redrawDrawings();
        };

        canvas.addEventListener("mousedown", onMouseDown);
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", stopDragging);
        canvas.addEventListener("mouseleave", stopDragging);
        canvas.addEventListener("wheel", onWheel, { passive: false });
        window.addEventListener("resize", onResize);

        this.cleanupHandlers.push(() => canvas.removeEventListener("mousedown", onMouseDown));
        this.cleanupHandlers.push(() => window.removeEventListener("mousemove", onMouseMove));
        this.cleanupHandlers.push(() => window.removeEventListener("mouseup", stopDragging));
        this.cleanupHandlers.push(() => canvas.removeEventListener("mouseleave", stopDragging));
        this.cleanupHandlers.push(() => canvas.removeEventListener("wheel", onWheel));
        this.cleanupHandlers.push(() => window.removeEventListener("resize", onResize));
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

        const toCanvas = (point: DrawingPoint): { x: number; y: number } => ({
            x: ((point.x + 1) * 0.5) * width,
            y: (1 - ((point.y + 1) * 0.5)) * height,
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

        this.renderAnalyticsOverlay(ctx, width, height, toCanvas);
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

        const panelWidth = Math.max(220, Math.min(340, width * 0.36));
        const panelHeight = Math.max(120, Math.min(180, height * 0.30));
        const panelX = width - panelWidth - 12;
        const panelY = 12;

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

    private nextId(prefix: "series" | "drawing"): string {
        this.idCounter += 1;
        return `${prefix}_${this.idCounter}`;
    }
}
