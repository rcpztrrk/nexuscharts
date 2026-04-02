import type { AgentAction, CandleDataPoint, ObserverMetrics } from "../../types";
import type { NormalizedObserverFrame } from "../analytics/ObserverAnalytics";

interface NexusWasmModule {
    initEngine: (canvasSelector: string, width: number, height: number) => boolean;
    destroyEngine: () => void;
    panCamera: (deltaX: number, deltaY: number) => void;
    zoomCamera: (zoomFactor: number) => void;
    resizeViewport?: (width: number, height: number) => void;
    setCameraView?: (centerX: number, centerY: number, zoomX: number, zoomY: number) => void;
    setSeriesData?: (opens: number[], highs: number[], lows: number[], closes: number[]) => void;
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

export interface NexusWasmBridgeInitOptions {
    canvasId: string;
    width: number;
    height: number;
    canvas: HTMLCanvasElement | null;
    wasmScriptPath: string;
    wasmBinaryPath: string;
}

declare global {
    interface Window {
        Module?: NexusWasmModule;
    }
}

export class NexusWasmBridge {
    private module: NexusWasmModule | null = null;
    private moduleLoaded: boolean = false;
    private warnMissingSetSeriesData: boolean = true;
    private warnMissingObserverBridge: boolean = true;
    private warnMissingSetCameraView: boolean = true;
    private readonly seriesSyncScratch = {
        opens: [] as number[],
        highs: [] as number[],
        lows: [] as number[],
        closes: [] as number[],
    };
    private static wasmLoadPromise: Promise<NexusWasmModule> | null = null;

    public isReady(): boolean {
        return this.moduleLoaded;
    }

    public async initialize(options: NexusWasmBridgeInitOptions): Promise<boolean> {
        console.log("[NexusCharts:JS] Initializing WASM module...");

        try {
            const module = await this.loadWasmModule(options);
            this.module = module;

            const initialized = module.initEngine(`#${options.canvasId}`, options.width, options.height);
            if (!initialized) {
                console.error("[NexusCharts:JS] Failed to initialize WASM engine.");
                return false;
            }

            this.moduleLoaded = true;
            console.log("[NexusCharts:JS] WASM module loaded and engine initialized.");
            return true;
        } catch (error) {
            console.error("[NexusCharts:JS] WASM bootstrap failed.", error);
            return false;
        }
    }

    public destroy(): void {
        if (this.module) {
            this.module.destroyEngine();
        }
        this.module = null;
        this.moduleLoaded = false;
    }

    public panCamera(deltaX: number, deltaY: number): boolean {
        if (!this.moduleLoaded || !this.module) {
            return false;
        }
        this.module.panCamera(deltaX, deltaY);
        return true;
    }

    public zoomCamera(zoomFactor: number): boolean {
        if (!this.moduleLoaded || !this.module) {
            return false;
        }
        this.module.zoomCamera(zoomFactor);
        return true;
    }

    public resizeViewport(width: number, height: number): boolean {
        if (!this.moduleLoaded || !this.module || typeof this.module.resizeViewport !== "function") {
            return false;
        }

        this.module.resizeViewport(width, height);
        return true;
    }

    public applyCameraView(centerX: number, centerY: number, zoomX: number, zoomY: number): boolean {
        if (!this.moduleLoaded || !this.module) {
            return false;
        }

        if (typeof this.module.setCameraView === "function") {
            this.module.setCameraView(centerX, centerY, zoomX, zoomY);
            return true;
        }

        if (this.warnMissingSetCameraView) {
            console.warn("[NexusCharts] WASM export 'setCameraView' is not available.");
            this.warnMissingSetCameraView = false;
        }
        return false;
    }

    public syncCandlestickSeries(seriesId: string, data: CandleDataPoint[]): void {
        if (!this.moduleLoaded || !this.module) {
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

        for (const point of data) {
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

        try {
            this.module.setSeriesData(scratch.opens, scratch.highs, scratch.lows, scratch.closes);
        } catch (error) {
            console.warn("[NexusCharts] Failed to push series data to WASM.", { seriesId, error });
        }
    }

    public pushObserverFrame(frame: NormalizedObserverFrame): void {
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

    public syncObserverFrames(frames: readonly NormalizedObserverFrame[]): void {
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
            for (const frame of frames) {
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

    public clearObserverFrames(): void {
        if (!this.moduleLoaded || !this.module || typeof this.module.clearObserverFrames !== "function") {
            return;
        }
        this.module.clearObserverFrames();
    }

    public getObserverMetrics(window: number): ObserverMetrics | null {
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

        return null;
    }

    private async loadWasmModule(options: NexusWasmBridgeInitOptions): Promise<NexusWasmModule> {
        if (NexusWasmBridge.wasmLoadPromise) {
            return NexusWasmBridge.wasmLoadPromise;
        }

        NexusWasmBridge.wasmLoadPromise = new Promise<NexusWasmModule>((resolve, reject) => {
            if (window.Module && typeof window.Module.initEngine === "function") {
                resolve(window.Module);
                return;
            }

            const runtimeModule: NexusWasmModuleBootstrapConfig = {
                canvas: options.canvas ?? undefined,
                locateFile: (path: string) => {
                    if (path.endsWith(".wasm")) {
                        return options.wasmBinaryPath;
                    }
                    return path;
                },
                onRuntimeInitialized: () => {
                    resolve(window.Module as NexusWasmModule);
                },
            };

            window.Module = runtimeModule as NexusWasmModule;

            const script = document.createElement("script");
            script.src = options.wasmScriptPath;
            script.async = true;
            script.onerror = () => {
                reject(new Error(`Failed to load WASM script: ${options.wasmScriptPath}`));
            };
            document.head.appendChild(script);
        });

        return NexusWasmBridge.wasmLoadPromise;
    }

    private actionToCode(action: AgentAction): number {
        if (action === "buy") return 1;
        if (action === "sell") return -1;
        return 0;
    }
}
