import type { CandleDataPoint, ChartTheme, IndicatorDefinition, IndicatorSeries } from "../../types";
import { IndicatorEngine } from "./IndicatorEngine";
import type { IndicatorPaneRect } from "./IndicatorOverlayRenderer";

export class IndicatorPaneManager {
    private readonly engine = new IndicatorEngine();
    private paneHeightRatio: number = 0.26;

    public values(): IterableIterator<IndicatorSeries> {
        return this.engine.values();
    }

    public addIndicator(definition: IndicatorDefinition, createId: () => string, theme: ChartTheme): string {
        return this.engine.addIndicator(definition, createId, theme);
    }

    public removeIndicator(id: string): boolean {
        return this.engine.removeIndicator(id);
    }

    public clearIndicators(): void {
        this.engine.clearIndicators();
    }

    public getIndicators(): IndicatorSeries[] {
        return this.engine.getIndicators();
    }

    public getLowerIndicators(): IndicatorSeries[] {
        return this.engine.getLowerIndicators();
    }

    public recompute(sourceCandles: CandleDataPoint[]): void {
        this.engine.recompute(sourceCandles);
    }

    public applyTheme(theme: ChartTheme): void {
        this.engine.applyTheme(theme);
    }

    public getPaneBounds(width: number, height: number): IndicatorPaneRect | null {
        if (!this.engine.hasLowerPane()) {
            return null;
        }

        const panelHeight = Math.max(110, Math.min(200, height * this.paneHeightRatio));
        const panelY = height - panelHeight;
        const panelX = 0;
        const panelWidth = width;
        const padding = 10;

        return {
            x: panelX,
            y: panelY,
            width: panelWidth,
            height: panelHeight,
            innerX: panelX + padding,
            innerY: panelY + padding,
            innerWidth: Math.max(0, panelWidth - (padding * 2)),
            innerHeight: Math.max(0, panelHeight - (padding * 2)),
        };
    }
}
