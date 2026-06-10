import type { AgentAction, CandleDataPoint, ChartTheme, ObserverMetrics } from "../../types";
import type { NormalizedObserverFrame } from "../analytics/ObserverAnalytics";

interface NexusWasmModule {
    initEngine: (canvasSelector: string, width: number, height: number) => boolean;
    destroyEngine: () => void;
    panCamera: (deltaX: number, deltaY: number) => void;
    zoomCamera: (zoomFactor: number) => void;
    resizeViewport?: (width: number, height: number) => void;
    setCameraView?: (centerX: number, centerY: number, zoomX: number, zoomY: number) => void;
    setThemeColors?: (
        clearR: number,
        clearG: number,
        clearB: number,
        upR: number,
        upG: number,
        upB: number,
        downR: number,
        downG: number,
        downB: number,
        wickR: number,
        wickG: number,
        wickB: number
    ) => void;
    setSeriesData?: (
        opens: ArrayLike<number>,
        highs: ArrayLike<number>,
        lows: ArrayLike<number>,
        closes: ArrayLike<number>
    ) => void;
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
    private warnMissingSetThemeColors: boolean = true;
    private readonly seriesSyncScratch = {
        opens: new Float32Array(0),
        highs: new Float32Array(0),
        lows: new Float32Array(0),
        closes: new Float32Array(0),
        opensView: new Float32Array(0),
        highsView: new Float32Array(0),
        lowsView: new Float32Array(0),
        closesView: new Float32Array(0),
        viewLength: -1,
    };
    private static wasmLoadPromise: Promise<NexusWasmModule> | null = null;
    private static activeCanvasId: string | null = null;
    private static activeBridge: NexusWasmBridge | null = null;
    private initializedCanvasId: string | null = null;

    public isReady(): boolean {
        return this.moduleLoaded;
    }

    public async initialize(options: NexusWasmBridgeInitOptions): Promise<boolean> {
        console.log("[NexusCharts:JS] Initializing WASM module...");

        if (this.moduleLoaded) {
            if (this.initializedCanvasId === options.canvasId) {
                return true;
            }
            console.error(
                `[NexusCharts:JS] WASM engine already initialized for canvas '${this.initializedCanvasId}'. ` +
                `Destroy it before initializing '${options.canvasId}'.`
            );
            return false;
        }

        if (!NexusWasmBridge.claimActiveCanvas(this, options.canvasId)) {
            console.error(
                `[NexusCharts:JS] WASM engine already owns canvas '${NexusWasmBridge.activeCanvasId}'. ` +
                `Destroy it before initializing '${options.canvasId}'.`
            );
            return false;
        }
        this.initializedCanvasId = options.canvasId;

        try {
            const module = await this.loadWasmModule(options);
            this.module = module;

            const initialized = module.initEngine(`#${options.canvasId}`, options.width, options.height);
            if (!initialized) {
                console.error("[NexusCharts:JS] Failed to initialize WASM engine.");
                this.releaseActiveCanvas();
                return false;
            }

            this.moduleLoaded = true;
            console.log("[NexusCharts:JS] WASM module loaded and engine initialized.");
            return true;
        } catch (error) {
            console.error("[NexusCharts:JS] WASM bootstrap failed.", error);
            this.releaseActiveCanvas();
            return false;
        }
    }

    public destroy(): void {
        if (this.module) {
            this.module.destroyEngine();
        }
        this.module = null;
        this.moduleLoaded = false;
        this.releaseActiveCanvas();
    }

    private static claimActiveCanvas(owner: NexusWasmBridge, canvasId: string): boolean {
        if (NexusWasmBridge.activeBridge && NexusWasmBridge.activeBridge !== owner) {
            return false;
        }

        NexusWasmBridge.activeCanvasId = canvasId;
        NexusWasmBridge.activeBridge = owner;
        return true;
    }

    private releaseActiveCanvas(): void {
        if (NexusWasmBridge.activeBridge === this) {
            NexusWasmBridge.activeCanvasId = null;
            NexusWasmBridge.activeBridge = null;
        }
        this.initializedCanvasId = null;
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


    public applyTheme(theme: Pick<ChartTheme, "surface" | "candles">): boolean {
        if (!this.moduleLoaded || !this.module) {
            return false;
        }

        if (typeof this.module.setThemeColors !== "function") {
            if (this.warnMissingSetThemeColors) {
                console.warn("[NexusCharts] WASM export 'setThemeColors' is not available.");
                this.warnMissingSetThemeColors = false;
            }
            return false;
        }

        const background = this.parseColor(theme.surface.chartBackground, [0.07, 0.09, 0.13]);
        const up = this.parseColor(theme.candles.up, [0.18, 0.80, 0.34]);
        const down = this.parseColor(theme.candles.down, [0.92, 0.28, 0.30]);
        const wick = this.parseColor(theme.candles.wick, [0.78, 0.82, 0.90]);

        this.module.setThemeColors(
            background[0], background[1], background[2],
            up[0], up[1], up[2],
            down[0], down[1], down[2],
            wick[0], wick[1], wick[2]
        );
        return true;
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
        const sourceLength = data.length;
        this.ensureSeriesSyncCapacity(sourceLength);

        let writeIndex = 0;
        for (let i = 0; i < sourceLength; i += 1) {
            const point = data[i];
            const open = Number(point.open);
            const highRaw = Number(point.high);
            const lowRaw = Number(point.low);
            const close = Number(point.close);
            if (!Number.isFinite(open) || !Number.isFinite(highRaw) || !Number.isFinite(lowRaw) || !Number.isFinite(close)) {
                continue;
            }
            scratch.opens[writeIndex] = open;
            scratch.highs[writeIndex] = Math.max(highRaw, open, close, lowRaw);
            scratch.lows[writeIndex] = Math.min(lowRaw, open, close, highRaw);
            scratch.closes[writeIndex] = close;
            writeIndex += 1;
        }

        const { opens, highs, lows, closes } = this.getSeriesSyncViews(writeIndex);

        try {
            this.module.setSeriesData(opens, highs, lows, closes);
        } catch (error) {
            console.warn("[NexusCharts] Failed to push series data to WASM.", { seriesId, error });
        }
    }

    private ensureSeriesSyncCapacity(requiredLength: number): void {
        const scratch = this.seriesSyncScratch;
        if (scratch.opens.length >= requiredLength) {
            return;
        }

        const nextCapacity = this.nextSeriesSyncCapacity(requiredLength);
        scratch.opens = new Float32Array(nextCapacity);
        scratch.highs = new Float32Array(nextCapacity);
        scratch.lows = new Float32Array(nextCapacity);
        scratch.closes = new Float32Array(nextCapacity);
        scratch.viewLength = -1;
    }

    private getSeriesSyncViews(length: number): {
        opens: Float32Array;
        highs: Float32Array;
        lows: Float32Array;
        closes: Float32Array;
    } {
        const scratch = this.seriesSyncScratch;
        if (scratch.viewLength === length) {
            return {
                opens: scratch.opensView,
                highs: scratch.highsView,
                lows: scratch.lowsView,
                closes: scratch.closesView,
            };
        }

        scratch.opensView = length === scratch.opens.length ? scratch.opens : scratch.opens.subarray(0, length);
        scratch.highsView = length === scratch.highs.length ? scratch.highs : scratch.highs.subarray(0, length);
        scratch.lowsView = length === scratch.lows.length ? scratch.lows : scratch.lows.subarray(0, length);
        scratch.closesView = length === scratch.closes.length ? scratch.closes : scratch.closes.subarray(0, length);
        scratch.viewLength = length;
        return {
            opens: scratch.opensView,
            highs: scratch.highsView,
            lows: scratch.lowsView,
            closes: scratch.closesView,
        };
    }

    private nextSeriesSyncCapacity(requiredLength: number): number {
        let capacity = Math.max(64, this.seriesSyncScratch.opens.length || 0);
        while (capacity < requiredLength) {
            capacity *= 2;
        }
        return capacity;
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

    private parseColor(input: string, fallback: readonly [number, number, number]): [number, number, number] {
        const value = input.trim();
        const hex = value.startsWith("#") ? value.slice(1) : null;
        if (hex) {
            const rgbHex = hex.length === 4
                ? hex.slice(0, 3)
                : hex.length === 8
                    ? hex.slice(0, 6)
                    : hex;
            const normalized = rgbHex.length === 3
                ? rgbHex.split("").map((part) => part + part).join("")
                : rgbHex;
            if (normalized.length === 6 && /^[0-9a-fA-F]{6}$/.test(normalized)) {
                return [
                    parseInt(normalized.slice(0, 2), 16) / 255,
                    parseInt(normalized.slice(2, 4), 16) / 255,
                    parseInt(normalized.slice(4, 6), 16) / 255,
                ];
            }
        }

        const rgbMatch = value.match(/^rgba?\(([^)]+)\)$/i);
        if (rgbMatch) {
            const parts = rgbMatch[1]
                .replace(/\//g, " ")
                .split(/[\s,]+/)
                .filter((part) => part.length > 0);
            const channels = parts.slice(0, 3).map((part) => this.normalizeRgbChannel(part));
            if (channels.length === 3 && channels.every((part) => Number.isFinite(part))) {
                return [channels[0], channels[1], channels[2]];
            }
        }

        const hslMatch = value.match(/^hsla?\(([^)]+)\)$/i);
        if (hslMatch) {
            const parts = hslMatch[1]
                .replace(/\//g, " ")
                .split(/[\s,]+/)
                .filter((part) => part.length > 0);
            const hue = this.normalizeHue(parts[0]);
            const saturation = this.normalizePercentage(parts[1]);
            const lightness = this.normalizePercentage(parts[2]);
            if ([hue, saturation, lightness].every((part) => Number.isFinite(part))) {
                return this.hslToRgb(hue, saturation, lightness);
            }
        }

        const resolvedColor = this.resolveCssColor(value);
        if (resolvedColor && resolvedColor !== value) {
            return this.parseColor(resolvedColor, fallback);
        }

        return [fallback[0], fallback[1], fallback[2]];
    }

    private normalizeRgbChannel(channel: string): number {
        const trimmed = channel.trim();
        const parsed = Number.parseFloat(trimmed);
        if (!Number.isFinite(parsed)) {
            return Number.NaN;
        }
        if (trimmed.endsWith("%")) {
            return Math.max(0, Math.min(1, parsed / 100));
        }
        return this.normalizeColorChannel(parsed);
    }

    private normalizeColorChannel(channel: number): number {
        if (channel <= 1) {
            return Math.max(0, Math.min(1, channel));
        }
        return Math.max(0, Math.min(1, channel / 255));
    }

    private normalizeHue(input: string | undefined): number {
        const value = input?.trim() ?? "";
        const parsed = Number.parseFloat(value);
        if (!Number.isFinite(parsed)) {
            return Number.NaN;
        }
        const degrees = value.endsWith("turn")
            ? parsed * 360
            : value.endsWith("rad")
                ? parsed * (180 / Math.PI)
                : parsed;
        return ((degrees % 360) + 360) % 360;
    }

    private normalizePercentage(input: string | undefined): number {
        const value = input?.trim() ?? "";
        const parsed = Number.parseFloat(value);
        if (!Number.isFinite(parsed)) {
            return Number.NaN;
        }
        return Math.max(0, Math.min(1, parsed / (value.endsWith("%") ? 100 : 1)));
    }

    private hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
        const chroma = (1 - Math.abs((2 * lightness) - 1)) * saturation;
        const huePrime = hue / 60;
        const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
        let r = 0;
        let g = 0;
        let b = 0;

        if (huePrime < 1) {
            r = chroma;
            g = x;
        } else if (huePrime < 2) {
            r = x;
            g = chroma;
        } else if (huePrime < 3) {
            g = chroma;
            b = x;
        } else if (huePrime < 4) {
            g = x;
            b = chroma;
        } else if (huePrime < 5) {
            r = x;
            b = chroma;
        } else {
            r = chroma;
            b = x;
        }

        const match = lightness - (chroma / 2);
        return [r + match, g + match, b + match];
    }

    private resolveCssColor(value: string): string | null {
        if (typeof document === "undefined") {
            return null;
        }

        const probe = document.createElement("span");
        probe.style.color = value;
        if (!probe.style.color) {
            return null;
        }

        probe.style.position = "absolute";
        probe.style.visibility = "hidden";
        document.body?.appendChild(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        return resolved || null;
    }

    private actionToCode(action: AgentAction): number {
        if (action === "buy") return 1;
        if (action === "sell") return -1;
        return 0;
    }
}
