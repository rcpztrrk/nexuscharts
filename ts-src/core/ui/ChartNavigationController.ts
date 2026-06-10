import type { SeriesGeometry, WorldPoint } from "../../types";
import {
    calculateAnchoredZoomViewport,
    calculateFitToDataViewport,
    calculateLatestDataViewport,
    calculateTimeRangeViewport,
    type ChartViewportState,
    type PrimarySeriesViewportStats,
} from "./ChartViewport";

export interface ChartNavigationSurface {
    width: number;
    height: number;
}

export interface ChartNavigationControllerOptions {
    isReady: () => boolean;
    getSurface: () => ChartNavigationSurface | null;
    getHoverCanvasPoint: () => { x: number | null; y: number | null };
    getViewportState: () => ChartViewportState;
    setViewportState: (viewport: ChartViewportState) => void;
    canvasToWorldPoint: (
        canvasX: number,
        canvasY: number,
        width: number,
        height: number
    ) => WorldPoint;
    panCamera: (deltaX: number, deltaY: number) => void;
    zoomCamera: (zoomFactor: number) => void;
    applyCameraView: () => void;
    autoScaleVisibleY: () => void;
    afterNavigation: () => void;
    getPrimarySeriesStats: () => PrimarySeriesViewportStats | null;
    buildSeriesGeometry: () => SeriesGeometry | null;
    timeToWorldX: (time: number | string, geometry: SeriesGeometry) => number | null;
}

export class ChartNavigationController {
    private readonly options: ChartNavigationControllerOptions;

    constructor(options: ChartNavigationControllerOptions) {
        this.options = options;
    }

    public pan(deltaX: number, deltaY: number): void {
        if (!this.options.isReady()) {
            return;
        }

        const viewport = this.options.getViewportState();
        this.options.setViewportState({
            ...viewport,
            centerX: viewport.centerX + deltaX,
            centerY: viewport.centerY + deltaY,
        });
        this.options.panCamera(deltaX, deltaY);
        this.options.autoScaleVisibleY();
        this.options.afterNavigation();
    }

    public zoom(zoomFactor: number, axis: "x" | "y" | "both" = "x"): void {
        if (!this.options.isReady()) {
            return;
        }

        const surface = this.options.getSurface();
        const hover = this.options.getHoverCanvasPoint();
        const anchorX = hover.x ?? (surface ? surface.width * 0.5 : null);
        const anchorY = hover.y ?? (surface ? surface.height * 0.5 : null);
        const viewport = this.options.getViewportState();
        const anchoredWorld = surface && anchorX !== null && anchorY !== null
            ? this.options.canvasToWorldPoint(anchorX, anchorY, surface.width, surface.height)
            : null;

        if (surface && anchoredWorld && anchorX !== null && anchorY !== null) {
            this.options.setViewportState(calculateAnchoredZoomViewport(
                viewport,
                surface,
                { x: anchorX, y: anchorY },
                anchoredWorld,
                zoomFactor,
                axis
            ));
            this.options.applyCameraView();
            this.options.autoScaleVisibleY();
        } else {
            this.options.setViewportState({
                ...viewport,
                zoomX: axis === "y" ? viewport.zoomX : clampNavigationZoom(viewport.zoomX * zoomFactor),
                zoomY: axis === "x" ? viewport.zoomY : clampNavigationZoom(viewport.zoomY * zoomFactor),
            });
            this.options.zoomCamera(zoomFactor);
        }

        this.options.afterNavigation();
    }

    public fitToData(): void {
        const stats = this.options.getPrimarySeriesStats();
        if (!stats || !this.options.getSurface()) {
            return;
        }

        const viewport = calculateFitToDataViewport(stats);
        if (viewport) {
            this.applyViewportState(viewport);
        }
    }

    public focusLatestData(visibleCandles: number = 140): void {
        const geometry = this.options.buildSeriesGeometry();
        if (!geometry || !this.options.getSurface() || geometry.candles.length === 0) {
            return;
        }

        const viewport = calculateLatestDataViewport(geometry, visibleCandles);
        if (viewport) {
            this.applyViewportState(viewport);
        }
    }

    public focusTimeRange(
        fromTime: number | string,
        toTime: number | string,
        preserveY: boolean = true
    ): void {
        const geometry = this.options.buildSeriesGeometry();
        if (!geometry || geometry.candles.length === 0) {
            return;
        }

        const fromX = this.options.timeToWorldX(fromTime, geometry);
        const toX = this.options.timeToWorldX(toTime, geometry);
        if (fromX === null || toX === null) {
            return;
        }

        this.applyViewportState(calculateTimeRangeViewport(
            geometry,
            fromX,
            toX,
            this.options.getViewportState(),
            preserveY
        ));
    }

    private applyViewportState(viewport: ChartViewportState): void {
        this.options.setViewportState(viewport);
        this.options.applyCameraView();
        this.options.afterNavigation();
    }
}

function clampNavigationZoom(value: number): number {
    return Math.min(5.0, Math.max(0.2, value));
}
