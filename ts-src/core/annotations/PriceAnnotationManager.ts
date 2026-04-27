import type {
    ChartMarkerDefinition,
    ChartMarkerOptions,
    PriceLineDefinition,
    PriceLineOptions,
} from "../../types";

export class PriceAnnotationManager {
    private readonly priceLines = new Map<string, PriceLineDefinition>();
    private readonly markers = new Map<string, ChartMarkerDefinition>();

    public addPriceLine(options: PriceLineOptions, createId: () => string): string {
        const id = options.id ?? createId();
        this.priceLines.set(id, this.normalizePriceLine(id, options));
        return id;
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

    public hasAnnotations(): boolean {
        return this.priceLines.size > 0 || this.markers.size > 0;
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
        };
    }
}
