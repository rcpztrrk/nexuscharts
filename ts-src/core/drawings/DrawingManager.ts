import type { DrawingDefinition, DrawingPoint, SeriesGeometry, WorldPoint } from "../../types";

export interface StoredDrawing extends DrawingDefinition {
    id: string;
}

export type DrawingDragMode = "move" | "p0" | "p1" | "poly_move" | "poly_point" | "hline" | "vline";

export interface DrawingDragState {
    id: string;
    mode: DrawingDragMode;
    startWorld: WorldPoint;
    startPoints?: DrawingPoint[];
    startX?: number;
    startY?: number;
    pointIndex?: number;
}

export interface DrawingHitResult {
    id: string;
    mode: DrawingDragMode;
    pointIndex?: number;
}

export interface DrawingHitTestApi {
    getWorldUnitsPerPixel(width: number, height: number): { x: number; y: number };
    resolveDrawingPoint(point: DrawingPoint, geometry: SeriesGeometry | null): DrawingPoint;
    resolveDrawingWorldX(drawing: StoredDrawing, geometry: SeriesGeometry | null): number | null;
    resolveDrawingWorldY(drawing: StoredDrawing, geometry: SeriesGeometry | null): number | null;
    distancePointToSegment(point: WorldPoint, a: DrawingPoint, b: DrawingPoint): number;
}

export class DrawingManager {
    private readonly drawingStore = new Map<string, StoredDrawing>();
    private hoveredDrawingId: string | null = null;
    private activeDrawingId: string | null = null;
    private activeDrawingDrag: DrawingDragState | null = null;
    private contextMenu: HTMLDivElement | null = null;
    private contextMenuTargetId: string | null = null;
    private overlayCanvas: HTMLCanvasElement | null = null;

    public attachOverlay(overlayCanvas: HTMLCanvasElement, contextMenu: HTMLDivElement): void {
        this.overlayCanvas = overlayCanvas;
        this.contextMenu = contextMenu;
    }

    public values(): IterableIterator<StoredDrawing> {
        return this.drawingStore.values();
    }

    public getDrawing(id: string): StoredDrawing | undefined {
        return this.drawingStore.get(id);
    }

    public addDrawing(definition: DrawingDefinition, createId: () => string): string {
        const id = definition.id ?? createId();
        const stored: StoredDrawing = { ...definition, id };
        this.drawingStore.set(id, stored);
        return id;
    }

    public removeDrawing(id: string): boolean {
        const removed = this.drawingStore.delete(id);
        if (!removed) {
            return false;
        }

        if (this.hoveredDrawingId === id) {
            this.hoveredDrawingId = null;
        }
        if (this.activeDrawingId === id) {
            this.activeDrawingId = null;
        }
        if (this.activeDrawingDrag?.id === id) {
            this.activeDrawingDrag = null;
        }
        if (this.contextMenuTargetId === id) {
            this.contextMenuTargetId = null;
        }

        return true;
    }

    public clearDrawings(): void {
        this.drawingStore.clear();
        this.hoveredDrawingId = null;
        this.activeDrawingId = null;
        this.activeDrawingDrag = null;
        this.contextMenuTargetId = null;
    }

    public getHoveredDrawingId(): string | null {
        return this.hoveredDrawingId;
    }

    public setHoveredDrawingId(id: string | null): void {
        this.hoveredDrawingId = id;
    }

    public getActiveDrawingId(): string | null {
        return this.activeDrawingId;
    }

    public setActiveDrawingId(id: string | null): void {
        this.activeDrawingId = id;
    }

    public getActiveDrag(): DrawingDragState | null {
        return this.activeDrawingDrag;
    }

    public setActiveDrag(state: DrawingDragState | null): void {
        this.activeDrawingDrag = state;
    }

    public getContextMenu(): HTMLDivElement | null {
        return this.contextMenu;
    }

    public getContextMenuTargetId(): string | null {
        return this.contextMenuTargetId;
    }

    public showContextMenu(clientX: number, clientY: number, drawingId: string): void {
        if (!this.contextMenu || !this.overlayCanvas) {
            return;
        }
        const parent = this.overlayCanvas.parentElement;
        if (!parent) {
            return;
        }

        const rect = parent.getBoundingClientRect();
        this.contextMenuTargetId = drawingId;
        this.contextMenu.style.display = "block";

        const menuRect = this.contextMenu.getBoundingClientRect();
        const maxX = rect.width - menuRect.width - 6;
        const maxY = rect.height - menuRect.height - 6;
        const left = Math.max(6, Math.min(maxX, clientX - rect.left));
        const top = Math.max(6, Math.min(maxY, clientY - rect.top));
        this.contextMenu.style.left = `${left}px`;
        this.contextMenu.style.top = `${top}px`;
    }

    public hideContextMenu(): void {
        if (!this.contextMenu) {
            return;
        }
        this.contextMenu.style.display = "none";
        this.contextMenuTargetId = null;
    }

    public hitTestDrawing(
        world: WorldPoint,
        width: number,
        height: number,
        geometry: SeriesGeometry | null,
        api: DrawingHitTestApi
    ): DrawingHitResult | null {
        const units = api.getWorldUnitsPerPixel(width, height);
        const threshold = 6 * Math.max(units.x, units.y);
        const drawings = Array.from(this.drawingStore.values());

        for (let i = drawings.length - 1; i >= 0; i -= 1) {
            const drawing = drawings[i];
            if (drawing.type === "line" && drawing.points && drawing.points.length >= 2) {
                const p0 = api.resolveDrawingPoint(drawing.points[0], geometry);
                const p1 = api.resolveDrawingPoint(drawing.points[1], geometry);
                if (Math.hypot(world.x - p0.x, world.y - p0.y) <= threshold) {
                    return { id: drawing.id, mode: "p0" };
                }
                if (Math.hypot(world.x - p1.x, world.y - p1.y) <= threshold) {
                    return { id: drawing.id, mode: "p1" };
                }
                if (api.distancePointToSegment(world, p0, p1) <= threshold) {
                    return { id: drawing.id, mode: "move" };
                }
            } else if (drawing.type === "polyline" && drawing.points && drawing.points.length >= 2) {
                for (let p = 0; p < drawing.points.length; p += 1) {
                    const point = api.resolveDrawingPoint(drawing.points[p], geometry);
                    if (Math.hypot(world.x - point.x, world.y - point.y) <= threshold) {
                        return { id: drawing.id, mode: "poly_point", pointIndex: p };
                    }
                }
                for (let p = 0; p < drawing.points.length - 1; p += 1) {
                    const p0 = api.resolveDrawingPoint(drawing.points[p], geometry);
                    const p1 = api.resolveDrawingPoint(drawing.points[p + 1], geometry);
                    if (api.distancePointToSegment(world, p0, p1) <= threshold) {
                        return { id: drawing.id, mode: "poly_move" };
                    }
                }
            } else if (drawing.type === "horizontal_line") {
                const y = api.resolveDrawingWorldY(drawing, geometry);
                if (typeof y === "number" && Math.abs(world.y - y) <= threshold) {
                    return { id: drawing.id, mode: "hline" };
                }
            } else if (drawing.type === "vertical_line") {
                const x = api.resolveDrawingWorldX(drawing, geometry);
                if (typeof x === "number" && Math.abs(world.x - x) <= threshold) {
                    return { id: drawing.id, mode: "vline" };
                }
            }
        }

        return null;
    }
}

