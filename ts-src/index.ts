export interface InitOptions {
    canvasId: string;
    width?: number;
    height?: number;
    wasmScriptPath?: string;
    wasmBinaryPath?: string;
    enableInteraction?: boolean;
    onReady?: (chart: NexusCharts) => void;
}

export interface CandleDataPoint {
    time: number | string;
    open: number;
    high: number;
    low: number;
    close: number;
}

export type SeriesType = "candlestick";

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

interface NexusWasmModule {
    initEngine: (canvasSelector: string, width: number, height: number) => boolean;
    destroyEngine: () => void;
    panCamera: (deltaX: number, deltaY: number) => void;
    zoomCamera: (zoomFactor: number) => void;
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
    private warnDataBridgePending: boolean = true;
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
        if (!this.moduleLoaded) {
            return;
        }
        if (this.warnDataBridgePending) {
            console.warn(
                "[NexusCharts] Series API is active. WASM data bridge will be connected in the next phase.",
                { seriesId }
            );
            this.warnDataBridgePending = false;
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
    }

    private nextId(prefix: "series" | "drawing"): string {
        this.idCounter += 1;
        return `${prefix}_${this.idCounter}`;
    }
}
