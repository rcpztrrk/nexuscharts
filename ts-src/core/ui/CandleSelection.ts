import type { HoveredCandle } from "../../types";

export function resolveClickedSelectionIndex(
    currentSelectedIndex: number | null,
    hoveredCandle: HoveredCandle | null,
    draggedDuringPointer: boolean
): number | null | undefined {
    if (draggedDuringPointer || !hoveredCandle) {
        return undefined;
    }

    return currentSelectedIndex === hoveredCandle.index
        ? null
        : hoveredCandle.index;
}

export function resolveSteppedSelectionIndex(
    currentSelectedIndex: number | null,
    hoveredCandle: HoveredCandle | null,
    count: number,
    step: number
): number | null {
    if (count <= 0) {
        return null;
    }

    if (currentSelectedIndex === null) {
        if (hoveredCandle) {
            return hoveredCandle.index;
        }
        return step >= 0 ? 0 : (count - 1);
    }

    return Math.max(0, Math.min(count - 1, currentSelectedIndex + step));
}

export function resolveBoundarySelectionIndex(count: number, to: "start" | "end"): number | null {
    if (count <= 0) {
        return null;
    }

    return to === "start" ? 0 : (count - 1);
}

export function renderSelectedCandleOverlay(
    ctx: CanvasRenderingContext2D,
    height: number,
    selectedCandle: HoveredCandle | null
): void {
    if (!selectedCandle) {
        return;
    }

    ctx.save();
    ctx.fillStyle = "rgba(255, 204, 102, 0.08)";
    ctx.strokeStyle = "rgba(255, 204, 102, 0.6)";
    ctx.lineWidth = 1;
    ctx.fillRect(selectedCandle.screenX - 14, 0, 28, height);

    ctx.beginPath();
    ctx.moveTo(selectedCandle.screenX, 0);
    ctx.lineTo(selectedCandle.screenX, height);
    ctx.stroke();

    const label = `Selected #${selectedCandle.index + 1}`;
    ctx.font = "12px 'Segoe UI', sans-serif";
    const textWidth = ctx.measureText(label).width;
    const boxWidth = textWidth + 10;
    const boxX = 12;
    const boxY = 12;

    ctx.fillStyle = "rgba(18, 28, 47, 0.92)";
    ctx.fillRect(boxX, boxY, boxWidth, 18);
    ctx.fillStyle = "#ffcc66";
    ctx.fillText(label, boxX + 5, boxY + 13);
    ctx.restore();
}
