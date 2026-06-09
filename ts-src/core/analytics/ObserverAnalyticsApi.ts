import type { AnalyticsOptions, ObserverFrame, ObserverMetrics } from "../../types";
import type { NexusWasmBridge } from "../wasm/NexusWasmBridge";
import {
    normalizeObserverFrame,
    trimObserverFramesToLimit,
    type ClampFn,
    type NormalizedObserverFrame,
} from "./ObserverAnalytics";

export interface ObserverAnalyticsApiOptions {
    frames: NormalizedObserverFrame[];
    getAnalyticsOptions: () => Required<AnalyticsOptions>;
    clamp: ClampFn;
    isBatchingUpdates: () => boolean;
    queueObserverSync: () => void;
    requestRedraw: () => void;
    wasmBridge: NexusWasmBridge;
}

export class ObserverAnalyticsApi {
    private readonly options: ObserverAnalyticsApiOptions;

    constructor(options: ObserverAnalyticsApiOptions) {
        this.options = options;
    }

    public pushFrame(frame: ObserverFrame): void {
        const frames = this.options.frames;
        const analyticsOptions = this.options.getAnalyticsOptions();
        const normalized = normalizeObserverFrame(
            frame,
            frames.length,
            analyticsOptions.maxFrames,
            this.options.clamp
        );
        if (!normalized) {
            return;
        }

        frames.push(normalized);
        trimObserverFramesToLimit(frames, analyticsOptions.maxFrames);
        if (this.options.isBatchingUpdates()) {
            this.options.queueObserverSync();
        } else {
            this.syncFrameToEngine(normalized);
        }
        this.options.requestRedraw();
    }

    public setFrames(inputFrames: ObserverFrame[]): void {
        const frames = this.options.frames;
        const analyticsOptions = this.options.getAnalyticsOptions();
        frames.length = 0;
        for (let i = 0; i < inputFrames.length; i += 1) {
            const normalized = normalizeObserverFrame(
                inputFrames[i],
                i,
                analyticsOptions.maxFrames,
                this.options.clamp
            );
            if (normalized) {
                frames.push(normalized);
            }
        }
        trimObserverFramesToLimit(frames, analyticsOptions.maxFrames);
        this.options.queueObserverSync();
        this.options.requestRedraw();
    }

    public getFrames(): ObserverFrame[] {
        return this.options.frames.map((frame) => ({ ...frame }));
    }

    public clearFrames(): void {
        this.options.frames.length = 0;
        this.options.queueObserverSync();
        this.options.requestRedraw();
    }

    public getMetrics(window: number = 0): ObserverMetrics {
        const sanitizedWindow = Number.isFinite(window)
            ? Math.max(0, Math.floor(window))
            : 0;

        const wasmMetrics = this.options.wasmBridge.getObserverMetrics(sanitizedWindow);
        if (wasmMetrics) {
            return wasmMetrics;
        }

        const frames = this.options.frames;
        const frameCount = frames.length;
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
            rewardSum += frames[i].reward;
        }

        const last = frames[frameCount - 1];
        return {
            frameCount,
            lastReward: last.reward,
            lastPnl: last.pnl,
            averageReward: rewardSum / span,
            source: "js",
        };
    }

    public syncAllToEngine(): void {
        this.options.wasmBridge.syncObserverFrames(this.options.frames);
    }

    private syncFrameToEngine(frame: NormalizedObserverFrame): void {
        this.options.wasmBridge.pushObserverFrame(frame);
    }
}
