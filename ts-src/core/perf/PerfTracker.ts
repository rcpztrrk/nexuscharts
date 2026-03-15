import type { PerfMetrics } from "../../types";

export class PerfTracker {
    private readonly samples: number[] = [];
    private readonly sampleLimit: number;
    private lastRedrawMs: number = 0;
    private redrawCount: number = 0;
    private lastHeapUsedMB: number | null = null;
    private lastHeapTotalMB: number | null = null;

    public constructor(sampleLimit: number = 360) {
        this.sampleLimit = Number.isFinite(sampleLimit) ? Math.max(1, Math.floor(sampleLimit)) : 360;
    }

    public nowMs(): number {
        if (typeof performance !== "undefined" && typeof performance.now === "function") {
            return performance.now();
        }
        return Date.now();
    }

    public recordSample(durationMs: number): void {
        const sample = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
        this.lastRedrawMs = sample;
        this.redrawCount += 1;

        this.samples.push(sample);
        if (this.samples.length > this.sampleLimit) {
            this.samples.splice(0, this.samples.length - this.sampleLimit);
        }

        if (typeof performance !== "undefined") {
            const memory = (performance as { memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number } }).memory;
            if (memory && typeof memory.usedJSHeapSize === "number") {
                this.lastHeapUsedMB = memory.usedJSHeapSize / (1024 * 1024);
            }
            if (memory && typeof memory.totalJSHeapSize === "number") {
                this.lastHeapTotalMB = memory.totalJSHeapSize / (1024 * 1024);
            }
        }
    }

    public getMetrics(window: number = 60): PerfMetrics {
        const sanitizedWindow = Number.isFinite(window)
            ? Math.max(0, Math.floor(window))
            : 0;

        const sampleCount = this.samples.length;
        if (sampleCount === 0) {
            return {
                redrawCount: this.redrawCount,
                lastRedrawMs: 0,
                avgRedrawMs: 0,
                maxRedrawMs: 0,
                heapUsedMB: this.lastHeapUsedMB,
                heapTotalMB: this.lastHeapTotalMB,
                sampleCount: 0,
            };
        }

        const span = sanitizedWindow > 0 ? Math.min(sanitizedWindow, sampleCount) : sampleCount;
        const start = sampleCount - span;
        let total = 0;
        let max = 0;
        for (let i = start; i < sampleCount; i += 1) {
            const sample = this.samples[i];
            total += sample;
            if (sample > max) {
                max = sample;
            }
        }

        return {
            redrawCount: this.redrawCount,
            lastRedrawMs: this.lastRedrawMs,
            avgRedrawMs: total / span,
            maxRedrawMs: max,
            heapUsedMB: this.lastHeapUsedMB,
            heapTotalMB: this.lastHeapTotalMB,
            sampleCount: span,
        };
    }
}

