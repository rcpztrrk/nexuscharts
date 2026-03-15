export type ControlButtonId =
    | "fit"
    | "axes"
    | "crosshair"
    | "tooltip"
    | "tooltip_mode"
    | "autoscale"
    | "heatmap"
    | "analytics";

export interface ControlButtonState {
    id: ControlButtonId;
    label: string;
    hint: string;
    active: boolean;
    kind: "action" | "toggle";
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ControlBarRenderParams {
    selectedCandleIndex: number | null;
    showControlBar: boolean;
    showAxes: boolean;
    showCrosshair: boolean;
    showTooltip: boolean;
    tooltipMode: "follow" | "fixed";
    autoScaleY: boolean;
    showHeatmap: boolean;
    showAnalyticsPanel: boolean;
}

export function renderControlBar(
    ctx: CanvasRenderingContext2D,
    width: number,
    params: ControlBarRenderParams
): ControlButtonState[] {
    if (!params.showControlBar) {
        return [];
    }

    const buttons: Array<Omit<ControlButtonState, "x" | "y" | "width" | "height">> = [
        { id: "fit", label: "Fit", hint: "F", active: true, kind: "action" },
        { id: "autoscale", label: "AutoY", hint: "Y", active: params.autoScaleY, kind: "toggle" },
        { id: "axes", label: "Axes", hint: "A", active: params.showAxes, kind: "toggle" },
        { id: "crosshair", label: "Cross", hint: "C", active: params.showCrosshair, kind: "toggle" },
        { id: "tooltip", label: "Tip", hint: "T", active: params.showTooltip, kind: "toggle" },
        {
            id: "tooltip_mode",
            label: params.tooltipMode === "fixed" ? "Mode:Fix" : "Mode:Follow",
            hint: "M",
            active: params.tooltipMode === "fixed",
            kind: "toggle",
        },
        { id: "heatmap", label: "Heat", hint: "H", active: params.showHeatmap, kind: "toggle" },
        {
            id: "analytics",
            label: "Panel",
            hint: "G",
            active: params.showAnalyticsPanel,
            kind: "toggle",
        },
    ];

    const controlButtons: ControlButtonState[] = [];

    ctx.save();
    ctx.font = "11px 'Segoe UI', sans-serif";

    let cursorX = 12;
    const cursorY = params.selectedCandleIndex !== null ? 36 : 12;
    const gap = 6;

    for (const button of buttons) {
        const label = `${button.label} ${button.hint}`;
        const textWidth = ctx.measureText(label).width;
        const buttonWidth = textWidth + 14;
        if (cursorX + buttonWidth > (width - 12)) {
            break;
        }

        controlButtons.push({
            ...button,
            x: cursorX,
            y: cursorY,
            width: buttonWidth,
            height: 20,
        });
        cursorX += buttonWidth + gap;
    }

    for (const button of controlButtons) {
        const fill = button.kind === "action"
            ? "rgba(18, 28, 47, 0.92)"
            : button.active
                ? "rgba(21, 69, 119, 0.88)"
                : "rgba(18, 28, 47, 0.78)";
        const stroke = button.active
            ? "rgba(120, 188, 255, 0.55)"
            : "rgba(120, 148, 188, 0.28)";

        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.fillRect(button.x, button.y, button.width, button.height);
        ctx.strokeRect(button.x, button.y, button.width, button.height);

        ctx.fillStyle = button.kind === "action"
            ? "#dce7ff"
            : button.active
                ? "#eef6ff"
                : "#9bb3d6";
        ctx.fillText(button.label, button.x + 6, button.y + 13);

        const hintWidth = ctx.measureText(button.hint).width;
        ctx.fillStyle = button.active ? "rgba(255, 209, 102, 0.95)" : "rgba(173, 191, 221, 0.72)";
        ctx.fillText(button.hint, button.x + button.width - hintWidth - 6, button.y + 13);
    }

    ctx.restore();
    return controlButtons;
}

