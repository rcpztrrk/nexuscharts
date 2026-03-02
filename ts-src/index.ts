// TypeScript wrapper to interact with the C++ WebAssembly module

export interface InitOptions {
    canvasId: string;
    width?: number;
    height?: number;
    wasmScriptPath?: string;
    wasmBinaryPath?: string;
    enableInteraction?: boolean;
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
    private moduleLoaded: boolean = false;
    private module: NexusWasmModule | null = null;
    private readonly canvasId: string;
    private readonly width?: number;
    private readonly height?: number;
    private readonly wasmScriptPath: string;
    private readonly wasmBinaryPath: string;
    private readonly enableInteraction: boolean;
    private currentZoom: number = 1.0;
    private isDragging: boolean = false;
    private lastPointerX: number = 0;
    private lastPointerY: number = 0;
    private cleanupHandlers: Array<() => void> = [];
    private static wasmLoadPromise: Promise<NexusWasmModule> | null = null;

    constructor(options: InitOptions) {
        this.canvasId = options.canvasId;
        this.width = options.width;
        this.height = options.height;
        this.wasmScriptPath = options.wasmScriptPath ?? "wasm/nexuscharts.js";
        this.wasmBinaryPath = options.wasmBinaryPath ?? "wasm/nexuscharts.wasm";
        this.enableInteraction = options.enableInteraction ?? true;

        this.canvas = document.getElementById(options.canvasId) as HTMLCanvasElement;

        if (!this.canvas) {
            console.error(`[NexusCharts] Canvas with ID '${options.canvasId}' not found!`);
            return;
        }

        if (options.width) this.canvas.width = options.width;
        if (options.height) this.canvas.height = options.height;

        void this.initEngine();
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

    public isReady(): boolean {
        return this.moduleLoaded;
    }

    public destroy(): void {
        this.detachInteractionHandlers();
        if (this.module) {
            this.module.destroyEngine();
        }
        this.moduleLoaded = false;
    }

    public pan(deltaX: number, deltaY: number): void {
        if (!this.moduleLoaded || !this.module) {
            return;
        }
        this.module.panCamera(deltaX, deltaY);
    }

    public zoom(zoomFactor: number): void {
        if (!this.moduleLoaded || !this.module) {
            return;
        }
        this.currentZoom = Math.min(5.0, Math.max(0.2, this.currentZoom * zoomFactor));
        this.module.zoomCamera(zoomFactor);
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

        canvas.addEventListener("mousedown", onMouseDown);
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", stopDragging);
        canvas.addEventListener("mouseleave", stopDragging);
        canvas.addEventListener("wheel", onWheel, { passive: false });

        this.cleanupHandlers.push(() => canvas.removeEventListener("mousedown", onMouseDown));
        this.cleanupHandlers.push(() => window.removeEventListener("mousemove", onMouseMove));
        this.cleanupHandlers.push(() => window.removeEventListener("mouseup", stopDragging));
        this.cleanupHandlers.push(() => canvas.removeEventListener("mouseleave", stopDragging));
        this.cleanupHandlers.push(() => canvas.removeEventListener("wheel", onWheel));
    }

    private detachInteractionHandlers(): void {
        for (const cleanup of this.cleanupHandlers) {
            cleanup();
        }
        this.cleanupHandlers = [];
        this.isDragging = false;
    }
}
