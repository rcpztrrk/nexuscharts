import type {
    ChartDrawingUpdateMode,
    DrawingDefinition,
    HoveredCandle,
    WorldPoint,
    SeriesGeometry,
} from "../../types";
import type { DrawingCoordinateApi } from "../drawings/DrawingEngine";
import {
    applyAnchorsToDrawing,
    applyDragToDrawing,
    resolveDrawingPoint,
    resolveDrawingWorldX,
    resolveDrawingWorldY,
} from "../drawings/DrawingEngine";
import { DrawingManager, type DrawingHitTestApi } from "../drawings/DrawingManager";
import { resolveClickedSelectionIndex } from "./CandleSelection";

export interface ChartInteractionState {
    isDragging: boolean;
    draggedDuringPointer: boolean;
    lastPointerX: number;
    lastPointerY: number;
}

export interface ChartInteractionControllerConfig {
    canvas: HTMLCanvasElement;
    getOverlayCanvas: () => HTMLCanvasElement | null;
    state: ChartInteractionState;
    getCurrentZoomX: () => number;
    getCurrentZoomY: () => number;
    getAutoScaleY: () => boolean;
    getControlButtonAtClientPosition: (clientX: number, clientY: number) => unknown;
    updateHoverFromClientPosition: (clientX: number, clientY: number) => void;
    screenToWorld: (clientX: number, clientY: number) => WorldPoint | null;
    buildSeriesGeometry: () => SeriesGeometry | null;
    drawingManager: DrawingManager;
    drawingHitTestApi: DrawingHitTestApi;
    drawingCoordinateApi: DrawingCoordinateApi;
    setActiveDrawingSelection: (id: string) => void;
    clearActiveDrawingInteraction: () => void;
    redrawDrawings: () => void;
    pan: (deltaX: number, deltaY: number) => void;
    zoom: (zoomFactor: number, axis?: "x" | "y" | "both") => void;
    activateHoveredDrawingSelection: () => boolean;
    clearActiveDrawingSelection: () => void;
    getSelectedCandleIndex: () => number | null;
    getHoveredCandle: () => HoveredCandle | null;
    setSelectedCandleIndex: (index: number | null) => void;
    cloneDrawingDefinition: (drawing: DrawingDefinition) => DrawingDefinition | null;
    getDrawingSnapshot: (id: string) => DrawingDefinition | null;
    emitDrawingUpdated: (
        drawing: DrawingDefinition,
        meta: { mode: ChartDrawingUpdateMode; pointIndex: number | null; previousDrawing: DrawingDefinition | null }
    ) => void;
    handleControlBarClick: (clientX: number, clientY: number) => boolean;
    emitClick: (clientX: number, clientY: number, source: "mouse" | "touch") => void;
    fitToData: () => void;
    toggleUiFlag: (flag: "showAxes" | "showCrosshair" | "showTooltip") => void;
    toggleAutoScaleY: () => void;
    toggleTooltipMode: () => void;
    toggleAnalyticsFlag: (flag: "showHeatmap") => void;
    toggleAnalyticsPanel: () => void;
    moveSelection: (step: -1 | 1) => void;
    jumpSelection: (edge: "start" | "end") => void;
    clearSelectedCandle: () => void;
    emitCrosshairMove: () => void;
}

export function attachChartInteractionController(config: ChartInteractionControllerConfig): () => void {
    let pinchDistance: number | null = null;
    let touchSelectionArmed = false;
    let longPressTimer: number | null = null;
    let longPressTriggered = false;
    let lastTapAt = 0;
    let updatedDrawingIdDuringPointer: string | null = null;
    let dragStartDrawingSnapshot: DrawingDefinition | null = null;
    let lastTapX = 0;
    let lastTapY = 0;
    const longPressDelayMs = 380;
    const touchDragThresholdPx = 8;
    const doubleTapDelayMs = 280;
    const doubleTapDistancePx = 26;

    const clearLongPressTimer = () => {
        if (longPressTimer !== null) {
            window.clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    };

    const beginPointerInteraction = (clientX: number, clientY: number): boolean => {
        if (config.getControlButtonAtClientPosition(clientX, clientY)) {
            return false;
        }

        config.state.draggedDuringPointer = false;
        config.state.lastPointerX = clientX;
        config.state.lastPointerY = clientY;
        config.updateHoverFromClientPosition(clientX, clientY);
        const world = config.screenToWorld(clientX, clientY);
        const surface = config.getOverlayCanvas() ?? config.canvas;
        const geometry = config.buildSeriesGeometry();
        if (world && surface) {
            const hit = config.drawingManager.hitTestDrawing(
                world,
                surface.width,
                surface.height,
                geometry,
                config.drawingHitTestApi
            );
            if (hit) {
                const drawing = config.drawingManager.getDrawing(hit.id);
                if (drawing) {
                    applyAnchorsToDrawing(drawing, geometry, config.drawingCoordinateApi);
                    const resolvedPoints = drawing.points
                        ? drawing.points.map((point) => resolveDrawingPoint(point, geometry, config.drawingCoordinateApi))
                        : undefined;
                    const resolvedX = resolveDrawingWorldX(drawing, geometry, config.drawingCoordinateApi);
                    const resolvedY = resolveDrawingWorldY(drawing, geometry, config.drawingCoordinateApi);

                    config.setActiveDrawingSelection(hit.id);
                    updatedDrawingIdDuringPointer = null;
                    dragStartDrawingSnapshot = config.cloneDrawingDefinition(drawing);
                    config.drawingManager.setActiveDrag({
                        id: hit.id,
                        mode: hit.mode,
                        pointIndex: hit.pointIndex,
                        startWorld: world,
                        startPoints: resolvedPoints,
                        startX: resolvedX ?? drawing.x,
                        startY: resolvedY ?? drawing.y,
                    });
                    config.state.isDragging = false;
                    config.redrawDrawings();
                    return true;
                }
            }
        }
        config.clearActiveDrawingInteraction();
        dragStartDrawingSnapshot = null;
        config.state.isDragging = true;
        return true;
    };

    const movePointerInteraction = (clientX: number, clientY: number): void => {
        const activeDrag = config.drawingManager.getActiveDrag();
        if (activeDrag) {
            const world = config.screenToWorld(clientX, clientY);
            if (!world) {
                return;
            }
            const drawing = config.drawingManager.getDrawing(activeDrag.id);
            if (!drawing) {
                config.drawingManager.clearActiveInteraction();
                return;
            }

            const geometry = config.buildSeriesGeometry();
            config.state.draggedDuringPointer = true;
            applyDragToDrawing(drawing, activeDrag, world, geometry, config.drawingCoordinateApi);
            updatedDrawingIdDuringPointer = drawing.id;
            config.drawingManager.setHoveredDrawingId(drawing.id);
            config.redrawDrawings();
            return;
        }

        if (config.state.isDragging) {
            const dx = clientX - config.state.lastPointerX;
            const dy = clientY - config.state.lastPointerY;
            if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                config.state.draggedDuringPointer = true;
            }
            config.state.lastPointerX = clientX;
            config.state.lastPointerY = clientY;

            const width = config.canvas.width || 1;
            const height = config.canvas.height || 1;
            const worldUnitsPerPixelX = (2.0 * config.getCurrentZoomX()) / width;
            const worldUnitsPerPixelY = (2.0 * config.getCurrentZoomY()) / height;
            const panY = config.getAutoScaleY() ? 0 : (dy * worldUnitsPerPixelY);
            config.pan(-dx * worldUnitsPerPixelX, panY);
            return;
        }

        config.state.lastPointerX = clientX;
        config.state.lastPointerY = clientY;
        config.updateHoverFromClientPosition(clientX, clientY);
        config.redrawDrawings();
    };

    const activateSelectionFromPointer = (): void => {
        if (config.activateHoveredDrawingSelection()) {
            config.redrawDrawings();
            return;
        }
        config.clearActiveDrawingSelection();
        const nextIndex = resolveClickedSelectionIndex(
            config.getSelectedCandleIndex(),
            config.getHoveredCandle(),
            config.state.draggedDuringPointer
        );
        if (nextIndex === undefined) {
            return;
        }
        config.setSelectedCandleIndex(nextIndex);
    };

    const stopDragging = () => {
        config.state.isDragging = false;
        const activeDrag = config.drawingManager.getActiveDrag();
        if (activeDrag) {
            config.drawingManager.setActiveDrag(null);
            if (updatedDrawingIdDuringPointer === activeDrag.id) {
                const updatedDrawing = config.getDrawingSnapshot(activeDrag.id);
                if (updatedDrawing) {
                    config.emitDrawingUpdated(updatedDrawing, {
                        mode: activeDrag.mode,
                        pointIndex: activeDrag.pointIndex ?? null,
                        previousDrawing: dragStartDrawingSnapshot,
                    });
                }
            }
        }
        updatedDrawingIdDuringPointer = null;
        dragStartDrawingSnapshot = null;
    };

    const scheduleLongPress = (clientX: number, clientY: number): void => {
        clearLongPressTimer();
        longPressTriggered = false;
        longPressTimer = window.setTimeout(() => {
            longPressTimer = null;
            if (!touchSelectionArmed || config.state.draggedDuringPointer) {
                return;
            }
            config.updateHoverFromClientPosition(clientX, clientY);
            activateSelectionFromPointer();
            stopDragging();
            touchSelectionArmed = false;
            longPressTriggered = true;
        }, longPressDelayMs);
    };

    const onMouseDown = (event: MouseEvent) => {
        beginPointerInteraction(event.clientX, event.clientY);
    };

    const onMouseMove = (event: MouseEvent) => {
        movePointerInteraction(event.clientX, event.clientY);
    };

    const onClick = (event: MouseEvent) => {
        if (config.handleControlBarClick(event.clientX, event.clientY)) {
            return;
        }
        activateSelectionFromPointer();
        config.emitClick(event.clientX, event.clientY, "mouse");
    };

    const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        config.updateHoverFromClientPosition(event.clientX, event.clientY);
        const zoomFactor = event.deltaY > 0 ? 1.08 : 0.92;
        const axis = (event.shiftKey || event.altKey) ? "y" : "x";
        config.zoom(zoomFactor, axis);
    };

    const onContextMenu = (event: MouseEvent) => {
        event.preventDefault();
        config.updateHoverFromClientPosition(event.clientX, event.clientY);
        config.drawingManager.showContextMenuForSelection(event.clientX, event.clientY);
    };

    const onGlobalDown = (event: MouseEvent) => {
        const target = event.target as Node | null;
        config.drawingManager.dismissContextMenuIfOutside(target);
    };

    const onDoubleClick = () => {
        config.fitToData();
    };

    const onKeyDown = (event: KeyboardEvent) => {
        if (event.repeat) {
            return;
        }

        const target = event.target as HTMLElement | null;
        const tagName = target?.tagName?.toLowerCase();
        if (target?.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select") {
            return;
        }

        switch (event.key.toLowerCase()) {
            case "f":
                config.fitToData();
                event.preventDefault();
                break;
            case "a":
                config.toggleUiFlag("showAxes");
                event.preventDefault();
                break;
            case "c":
                config.toggleUiFlag("showCrosshair");
                event.preventDefault();
                break;
            case "t":
                config.toggleUiFlag("showTooltip");
                event.preventDefault();
                break;
            case "y":
                config.toggleAutoScaleY();
                event.preventDefault();
                break;
            case "m":
                config.toggleTooltipMode();
                event.preventDefault();
                break;
            case "h":
                config.toggleAnalyticsFlag("showHeatmap");
                event.preventDefault();
                break;
            case "g":
                config.toggleAnalyticsPanel();
                event.preventDefault();
                break;
            case "arrowleft":
                config.moveSelection(-1);
                event.preventDefault();
                break;
            case "arrowright":
                config.moveSelection(1);
                event.preventDefault();
                break;
            case "home":
                config.jumpSelection("start");
                event.preventDefault();
                break;
            case "end":
                config.jumpSelection("end");
                event.preventDefault();
                break;
            case "escape":
                config.clearSelectedCandle();
                config.drawingManager.hideContextMenu();
                event.preventDefault();
                break;
            default:
                break;
        }
    };

    const clearHover = () => {
        config.drawingManager.setHoveredDrawingId(null);
        config.emitCrosshairMove();
        config.redrawDrawings();
    };

    const touchDistance = (touches: TouchList): number => {
        if (touches.length < 2) {
            return 0;
        }
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.hypot(dx, dy);
    };

    const touchCenter = (touches: TouchList): { x: number; y: number } => {
        if (touches.length === 0) {
            return { x: 0, y: 0 };
        }
        if (touches.length === 1) {
            return { x: touches[0].clientX, y: touches[0].clientY };
        }
        return {
            x: (touches[0].clientX + touches[1].clientX) * 0.5,
            y: (touches[0].clientY + touches[1].clientY) * 0.5,
        };
    };

    const onTouchStart = (event: TouchEvent) => {
        if (event.touches.length === 1) {
            const touch = event.touches[0];
            if (config.handleControlBarClick(touch.clientX, touch.clientY)) {
                event.preventDefault();
                touchSelectionArmed = false;
                clearLongPressTimer();
                return;
            }

            pinchDistance = null;
            longPressTriggered = false;
            touchSelectionArmed = beginPointerInteraction(touch.clientX, touch.clientY);
            if (touchSelectionArmed) {
                scheduleLongPress(touch.clientX, touch.clientY);
            }
            event.preventDefault();
            return;
        }

        if (event.touches.length >= 2) {
            clearLongPressTimer();
            const center = touchCenter(event.touches);
            config.updateHoverFromClientPosition(center.x, center.y);
            config.state.isDragging = false;
            config.drawingManager.setActiveDrag(null);
            config.state.draggedDuringPointer = true;
            touchSelectionArmed = false;
            pinchDistance = touchDistance(event.touches);
            config.redrawDrawings();
            event.preventDefault();
        }
    };

    const onTouchMove = (event: TouchEvent) => {
        if (event.touches.length >= 2) {
            clearLongPressTimer();
            const nextDistance = touchDistance(event.touches);
            const center = touchCenter(event.touches);
            config.updateHoverFromClientPosition(center.x, center.y);
            if (pinchDistance && nextDistance > 0) {
                const zoomFactor = pinchDistance / nextDistance;
                if (Number.isFinite(zoomFactor) && Math.abs(zoomFactor - 1) > 0.001) {
                    config.zoom(zoomFactor, "x");
                }
            }
            pinchDistance = nextDistance;
            config.state.draggedDuringPointer = true;
            touchSelectionArmed = false;
            event.preventDefault();
            return;
        }

        if (event.touches.length === 1) {
            const touch = event.touches[0];
            const moveDistance = Math.hypot(touch.clientX - config.state.lastPointerX, touch.clientY - config.state.lastPointerY);
            if (moveDistance > touchDragThresholdPx) {
                clearLongPressTimer();
                touchSelectionArmed = false;
            }
            movePointerInteraction(touch.clientX, touch.clientY);
            if (config.state.draggedDuringPointer) {
                touchSelectionArmed = false;
                clearLongPressTimer();
            }
            event.preventDefault();
        }
    };

    const onTouchEnd = (event: TouchEvent) => {
        if (event.touches.length >= 2) {
            pinchDistance = touchDistance(event.touches);
            touchSelectionArmed = false;
            clearLongPressTimer();
            event.preventDefault();
            return;
        }

        if (event.touches.length === 1) {
            const touch = event.touches[0];
            pinchDistance = null;
            clearLongPressTimer();
            config.state.lastPointerX = touch.clientX;
            config.state.lastPointerY = touch.clientY;
            config.state.isDragging = true;
            config.drawingManager.setActiveDrag(null);
            config.state.draggedDuringPointer = true;
            touchSelectionArmed = false;
            event.preventDefault();
            return;
        }

        pinchDistance = null;
        clearLongPressTimer();
        if (longPressTriggered) {
            longPressTriggered = false;
            touchSelectionArmed = false;
            stopDragging();
            event.preventDefault();
            return;
        }

        if (touchSelectionArmed && !config.state.draggedDuringPointer) {
            activateSelectionFromPointer();
            config.emitClick(config.state.lastPointerX, config.state.lastPointerY, "touch");
            const now = performance.now();
            const isDoubleTap = (now - lastTapAt) <= doubleTapDelayMs
                && Math.hypot(config.state.lastPointerX - lastTapX, config.state.lastPointerY - lastTapY) <= doubleTapDistancePx;
            if (isDoubleTap) {
                config.fitToData();
                lastTapAt = 0;
            } else {
                lastTapAt = now;
                lastTapX = config.state.lastPointerX;
                lastTapY = config.state.lastPointerY;
            }
        }
        touchSelectionArmed = false;
        stopDragging();
        event.preventDefault();
    };

    const onTouchCancel = () => {
        pinchDistance = null;
        touchSelectionArmed = false;
        clearLongPressTimer();
        longPressTriggered = false;
        stopDragging();
    };

    config.canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopDragging);
    config.canvas.addEventListener("mouseleave", stopDragging);
    config.canvas.addEventListener("mouseleave", clearHover);
    config.canvas.addEventListener("click", onClick);
    config.canvas.addEventListener("dblclick", onDoubleClick);
    config.canvas.addEventListener("wheel", onWheel, { passive: false });
    config.canvas.addEventListener("contextmenu", onContextMenu);
    config.canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    config.canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    config.canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    config.canvas.addEventListener("touchcancel", onTouchCancel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onGlobalDown);

    return () => {
        config.canvas.removeEventListener("mousedown", onMouseDown);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", stopDragging);
        config.canvas.removeEventListener("mouseleave", stopDragging);
        config.canvas.removeEventListener("mouseleave", clearHover);
        config.canvas.removeEventListener("click", onClick);
        config.canvas.removeEventListener("dblclick", onDoubleClick);
        config.canvas.removeEventListener("wheel", onWheel);
        config.canvas.removeEventListener("contextmenu", onContextMenu);
        config.canvas.removeEventListener("touchstart", onTouchStart);
        config.canvas.removeEventListener("touchmove", onTouchMove);
        config.canvas.removeEventListener("touchend", onTouchEnd);
        config.canvas.removeEventListener("touchcancel", onTouchCancel);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("mousedown", onGlobalDown);
        clearLongPressTimer();
        config.state.isDragging = false;
    };
}
