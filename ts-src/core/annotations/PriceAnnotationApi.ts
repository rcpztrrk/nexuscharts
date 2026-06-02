import type {
    CandleDataPoint,
    ChartAlertDefinition,
    ChartAlertOptions,
    ChartAnnotationsApplyResult,
    ChartAnnotationsInput,
    ChartAnnotationsSnapshot,
    ChartMarkerDefinition,
    ChartMarkerOptions,
    PriceLineDefinition,
    PriceLineOptions,
} from "../../types";
import { PriceAnnotationManager, resolveMarkerSnapPrice } from "./PriceAnnotationManager";

export interface PriceAnnotationApiOptions {
    manager: PriceAnnotationManager;
    createId: (prefix: "priceLine" | "marker" | "alert") => string;
    getPrimaryCandles: () => readonly CandleDataPoint[];
    clearAlertTriggerKey: (id: string) => void;
    clearAlertTriggerKeys: () => void;
    requestRedraw: () => void;
}

export class PriceAnnotationApi {
    private readonly manager: PriceAnnotationManager;
    private readonly createId: PriceAnnotationApiOptions["createId"];
    private readonly getPrimaryCandles: PriceAnnotationApiOptions["getPrimaryCandles"];
    private readonly clearAlertTriggerKey: PriceAnnotationApiOptions["clearAlertTriggerKey"];
    private readonly clearAlertTriggerKeys: PriceAnnotationApiOptions["clearAlertTriggerKeys"];
    private readonly requestRedraw: PriceAnnotationApiOptions["requestRedraw"];

    constructor(options: PriceAnnotationApiOptions) {
        this.manager = options.manager;
        this.createId = options.createId;
        this.getPrimaryCandles = options.getPrimaryCandles;
        this.clearAlertTriggerKey = options.clearAlertTriggerKey;
        this.clearAlertTriggerKeys = options.clearAlertTriggerKeys;
        this.requestRedraw = options.requestRedraw;
    }

    public addPriceLine(options: PriceLineOptions): string {
        const id = this.manager.addPriceLine(options, () => this.createId("priceLine"));
        this.requestRedraw();
        return id;
    }

    public setPriceLines(lines: readonly PriceLineOptions[]): string[] {
        const ids = this.manager.setPriceLines(lines, () => this.createId("priceLine"));
        this.requestRedraw();
        return ids;
    }

    public updatePriceLine(id: string, patch: Partial<PriceLineOptions>): boolean {
        const updated = this.manager.updatePriceLine(id, patch);
        if (updated) {
            this.requestRedraw();
        }
        return updated;
    }

    public removePriceLine(id: string): boolean {
        const removed = this.manager.removePriceLine(id);
        if (removed) {
            this.requestRedraw();
        }
        return removed;
    }

    public clearPriceLines(): void {
        this.manager.clearPriceLines();
        this.requestRedraw();
    }

    public getPriceLines(): PriceLineDefinition[] {
        return this.manager.getPriceLines();
    }

    public addMarker(options: ChartMarkerOptions): string {
        const id = this.manager.addMarker(this.resolveMarkerSnapOptions(options), () => this.createId("marker"));
        this.requestRedraw();
        return id;
    }

    public setMarkers(markers: readonly ChartMarkerOptions[]): string[] {
        const ids = this.manager.setMarkers(this.resolveMarkerSnapOptionsList(markers), () => this.createId("marker"));
        this.requestRedraw();
        return ids;
    }

    public updateMarker(id: string, patch: Partial<ChartMarkerOptions>): boolean {
        const updated = this.manager.updateMarker(id, patch);
        if (updated) {
            this.requestRedraw();
        }
        return updated;
    }

    public removeMarker(id: string): boolean {
        const removed = this.manager.removeMarker(id);
        if (removed) {
            this.requestRedraw();
        }
        return removed;
    }

    public clearMarkers(): void {
        this.manager.clearMarkers();
        this.requestRedraw();
    }

    public getMarkers(): ChartMarkerDefinition[] {
        return this.manager.getMarkers();
    }

    public clearAnnotations(): void {
        this.manager.clearAnnotations();
        this.requestRedraw();
    }

    public setAnnotations(annotations: ChartAnnotationsInput): ChartAnnotationsApplyResult {
        const result = this.manager.setAnnotations(
            {
                ...annotations,
                markers: annotations.markers
                    ? this.resolveMarkerSnapOptionsList(annotations.markers)
                    : undefined,
            },
            () => this.createId("priceLine"),
            () => this.createId("marker")
        );
        this.requestRedraw();
        return result;
    }

    public getAnnotations(): ChartAnnotationsSnapshot {
        return {
            priceLines: this.getPriceLines(),
            markers: this.getMarkers(),
        };
    }

    public addAlert(options: ChartAlertOptions): string {
        const id = this.manager.addAlert(options, () => this.createId("alert"));
        this.requestRedraw();
        return id;
    }

    public updateAlert(id: string, patch: Partial<ChartAlertOptions>): boolean {
        const updated = this.manager.updateAlert(id, patch);
        if (updated) {
            this.clearAlertTriggerKey(id);
            this.requestRedraw();
        }
        return updated;
    }

    public removeAlert(id: string): boolean {
        const removed = this.manager.removeAlert(id);
        if (removed) {
            this.clearAlertTriggerKey(id);
            this.requestRedraw();
        }
        return removed;
    }

    public clearAlerts(): void {
        this.manager.clearAlerts();
        this.clearAlertTriggerKeys();
        this.requestRedraw();
    }

    public getAlerts(): ChartAlertDefinition[] {
        return this.manager.getAlerts();
    }

    private resolveMarkerSnapOptions(options: ChartMarkerOptions): ChartMarkerOptions {
        return resolveMarkerSnapPrice(options, this.getPrimaryCandles());
    }

    private resolveMarkerSnapOptionsList(markers: readonly ChartMarkerOptions[]): ChartMarkerOptions[] {
        const candles = this.getPrimaryCandles();
        return markers.map((marker) => resolveMarkerSnapPrice(marker, candles));
    }
}
