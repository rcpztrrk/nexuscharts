import type {
    ChartAlertDefinition,
    ChartAlertOptions,
    ChartAnnotationsApplyResult,
    ChartAnnotationsInput,
    ChartMarkerDefinition,
    ChartMarkerOptions,
    CandleDataPoint,
    PriceLineDefinition,
    PriceLineOptions,
} from "../../types";

export class PriceAnnotationManager {
    private readonly priceLines = new Map<string, PriceLineDefinition>();
    private readonly markers = new Map<string, ChartMarkerDefinition>();
    private readonly alerts = new Map<string, ChartAlertDefinition>();

    public addPriceLine(options: PriceLineOptions, createId: () => string): string {
        const id = options.id ?? createId();
        this.priceLines.set(id, this.normalizePriceLine(id, options));
        return id;
    }

    public setPriceLines(lines: readonly PriceLineOptions[], createId: () => string): string[] {
        this.priceLines.clear();
        return lines.map((line) => this.addPriceLine(line, createId));
    }

    public updatePriceLine(id: string, patch: Partial<PriceLineOptions>): boolean {
        const current = this.priceLines.get(id);
        if (!current) {
            return false;
        }
        this.priceLines.set(id, this.normalizePriceLine(id, { ...current, ...patch }));
        return true;
    }

    public removePriceLine(id: string): boolean {
        return this.priceLines.delete(id);
    }

    public clearPriceLines(): void {
        this.priceLines.clear();
    }

    public getPriceLines(): PriceLineDefinition[] {
        return Array.from(this.priceLines.values()).map((line) => ({
            ...line,
            dash: line.dash ? [...line.dash] : undefined,
        }));
    }

    public addMarker(options: ChartMarkerOptions, createId: () => string): string {
        const id = options.id ?? createId();
        this.markers.set(id, this.normalizeMarker(id, options));
        return id;
    }

    public setMarkers(markers: readonly ChartMarkerOptions[], createId: () => string): string[] {
        this.markers.clear();
        return markers.map((marker) => this.addMarker(marker, createId));
    }

    public setAnnotations(
        annotations: ChartAnnotationsInput,
        createPriceLineId: () => string,
        createMarkerId: () => string
    ): ChartAnnotationsApplyResult {
        return {
            priceLineIds: this.setPriceLines(annotations.priceLines ?? [], createPriceLineId),
            markerIds: this.setMarkers(annotations.markers ?? [], createMarkerId),
        };
    }

    public updateMarker(id: string, patch: Partial<ChartMarkerOptions>): boolean {
        const current = this.markers.get(id);
        if (!current) {
            return false;
        }
        this.markers.set(id, this.normalizeMarker(id, { ...current, ...patch }));
        return true;
    }

    public removeMarker(id: string): boolean {
        return this.markers.delete(id);
    }

    public clearMarkers(): void {
        this.markers.clear();
    }

    public getMarkers(): ChartMarkerDefinition[] {
        return Array.from(this.markers.values()).map((marker) => ({ ...marker }));
    }

    public addAlert(options: ChartAlertOptions, createId: () => string): string {
        const id = options.id ?? createId();
        this.alerts.set(id, this.normalizeAlert(id, options));
        return id;
    }

    public updateAlert(id: string, patch: Partial<ChartAlertOptions>): boolean {
        const current = this.alerts.get(id);
        if (!current) {
            return false;
        }
        this.alerts.set(id, this.normalizeAlert(id, { ...current, ...patch }));
        return true;
    }

    public removeAlert(id: string): boolean {
        return this.alerts.delete(id);
    }

    public clearAlerts(): void {
        this.alerts.clear();
    }

    public getAlerts(): ChartAlertDefinition[] {
        return Array.from(this.alerts.values()).map((alert) => ({
            ...alert,
            dash: alert.dash ? [...alert.dash] : undefined,
        }));
    }

    public hasAnnotations(): boolean {
        return this.priceLines.size > 0 || this.markers.size > 0 || this.alerts.size > 0;
    }

    public clearAnnotations(): void {
        this.priceLines.clear();
        this.markers.clear();
    }

    private normalizePriceLine(id: string, options: PriceLineOptions): PriceLineDefinition {
        return {
            id,
            price: Number(options.price),
            label: options.label,
            color: options.color,
            width: Number.isFinite(options.width) ? Math.max(1, Number(options.width)) : 1,
            dash: options.dash ? [...options.dash] : undefined,
            axisLabel: options.axisLabel ?? true,
        };
    }

    private normalizeMarker(id: string, options: ChartMarkerOptions): ChartMarkerDefinition {
        return {
            id,
            time: options.time,
            price: Number(options.price),
            label: options.label,
            color: options.color,
            textColor: options.textColor,
            shape: options.shape ?? "circle",
            size: Number.isFinite(options.size) ? Math.max(4, Number(options.size)) : 7,
            snapTo: options.snapTo,
        };
    }

    private normalizeAlert(id: string, options: ChartAlertOptions): ChartAlertDefinition {
        return {
            id,
            price: Number(options.price),
            label: options.label,
            condition: options.condition ?? "crossing",
            color: options.color,
            width: Number.isFinite(options.width) ? Math.max(1, Number(options.width)) : 1,
            dash: options.dash ? [...options.dash] : [6, 4],
            enabled: options.enabled ?? true,
        };
    }
}

export function resolveMarkerSnapPrice(
    marker: ChartMarkerOptions,
    candles: readonly CandleDataPoint[]
): ChartMarkerOptions {
    if (!marker.snapTo || candles.length === 0) {
        return marker;
    }

    const exact = candles.find((candle) => String(candle.time) === String(marker.time));
    const target = exact ?? findNearestNumericTimeCandle(marker.time, candles);
    if (!target) {
        return marker;
    }

    const snappedPrice = Number(target[marker.snapTo]);
    if (!Number.isFinite(snappedPrice)) {
        return marker;
    }

    return {
        ...marker,
        time: target.time,
        price: snappedPrice,
    };
}

function findNearestNumericTimeCandle(
    time: number | string,
    candles: readonly CandleDataPoint[]
): CandleDataPoint | null {
    const targetTime = Number(time);
    if (!Number.isFinite(targetTime)) {
        return null;
    }

    let nearest: CandleDataPoint | null = null;
    let nearestDistance = Infinity;
    for (const candle of candles) {
        const candleTime = Number(candle.time);
        if (!Number.isFinite(candleTime)) {
            continue;
        }
        const distance = Math.abs(candleTime - targetTime);
        if (distance < nearestDistance) {
            nearest = candle;
            nearestDistance = distance;
        }
    }

    return nearest;
}
