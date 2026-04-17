export interface UpdateBatchCallbacks {
    syncAllSeries: () => void;
    recomputeIndicators: () => void;
    syncAllObserverFrames: () => void;
    autoScaleVisibleY: () => void;
    refreshHoverFromStoredPointer: () => void;
    redrawDrawings: () => void;
    emitVisibleRangeChange: () => void;
}

export class NexusChartUpdateBatch {
    private depth: number = 0;
    private pendingSeriesSync: boolean = false;
    private pendingIndicatorRecompute: boolean = false;
    private pendingObserverSync: boolean = false;
    private pendingAutoScale: boolean = false;
    private pendingHoverRefresh: boolean = false;
    private pendingRedraw: boolean = false;
    private pendingVisibleRangeEmit: boolean = false;

    constructor(private readonly callbacks: UpdateBatchCallbacks) {}

    public run<T>(callback: () => T): T {
        this.depth += 1;
        try {
            return callback();
        } finally {
            this.depth = Math.max(0, this.depth - 1);
            if (this.depth === 0) {
                this.flush();
            }
        }
    }

    public isBatching(): boolean {
        return this.depth > 0;
    }

    public requestRedraw(): void {
        if (this.isBatching()) {
            this.pendingRedraw = true;
            return;
        }
        this.callbacks.redrawDrawings();
    }

    public requestHoverRefresh(): void {
        if (this.isBatching()) {
            this.pendingHoverRefresh = true;
            return;
        }
        this.callbacks.refreshHoverFromStoredPointer();
    }

    public requestVisibleRangeEmit(): void {
        if (this.isBatching()) {
            this.pendingVisibleRangeEmit = true;
            return;
        }
        this.callbacks.emitVisibleRangeChange();
    }

    public queueIndicatorRecompute(): void {
        if (this.isBatching()) {
            this.pendingIndicatorRecompute = true;
            return;
        }
        this.callbacks.recomputeIndicators();
    }

    public queueObserverSync(): void {
        if (this.isBatching()) {
            this.pendingObserverSync = true;
            return;
        }
        this.callbacks.syncAllObserverFrames();
    }

    public queuePrimarySeriesMutation(syncPrimaryNow: () => void): void {
        if (this.isBatching()) {
            this.pendingSeriesSync = true;
            this.pendingIndicatorRecompute = true;
            this.pendingAutoScale = true;
            this.pendingHoverRefresh = true;
            this.pendingRedraw = true;
            this.pendingVisibleRangeEmit = true;
            return;
        }

        syncPrimaryNow();
        this.callbacks.recomputeIndicators();
        this.callbacks.autoScaleVisibleY();
        this.callbacks.refreshHoverFromStoredPointer();
        this.callbacks.redrawDrawings();
        this.callbacks.emitVisibleRangeChange();
    }

    private flush(): void {
        const shouldSyncSeries = this.pendingSeriesSync;
        const shouldRecomputeIndicators = this.pendingIndicatorRecompute;
        const shouldSyncObservers = this.pendingObserverSync;
        const shouldAutoScale = this.pendingAutoScale;
        const shouldRefreshHover = this.pendingHoverRefresh;
        const shouldRedraw = this.pendingRedraw;
        const shouldEmitVisibleRange = this.pendingVisibleRangeEmit;

        this.pendingSeriesSync = false;
        this.pendingIndicatorRecompute = false;
        this.pendingObserverSync = false;
        this.pendingAutoScale = false;
        this.pendingHoverRefresh = false;
        this.pendingRedraw = false;
        this.pendingVisibleRangeEmit = false;

        if (shouldSyncSeries) {
            this.callbacks.syncAllSeries();
        }
        if (shouldRecomputeIndicators) {
            this.callbacks.recomputeIndicators();
        }
        if (shouldSyncObservers) {
            this.callbacks.syncAllObserverFrames();
        }
        if (shouldAutoScale) {
            this.callbacks.autoScaleVisibleY();
        }
        if (shouldRefreshHover) {
            this.callbacks.refreshHoverFromStoredPointer();
        }
        if (shouldRedraw) {
            this.callbacks.redrawDrawings();
            return;
        }
        if (shouldEmitVisibleRange) {
            this.callbacks.emitVisibleRangeChange();
        }
    }
}
