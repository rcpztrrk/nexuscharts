import type { ChartTheme } from "../../types";
import { fontSpec } from "../theme/ChartTheme";

export function applyDrawingContextMenuTheme(menu: HTMLDivElement, theme: ChartTheme): void {
    menu.dataset.deleteHover = theme.drawings.menuDeleteHover;
    menu.style.position = "absolute";
    menu.style.display = "none";
    menu.style.zIndex = "20";
    menu.style.minWidth = "140px";
    menu.style.background = theme.surface.menuBackground;
    menu.style.border = `1px solid ${theme.surface.menuBorder}`;
    menu.style.borderRadius = "6px";
    menu.style.padding = "4px";
    menu.style.font = fontSpec(theme.typography.tooltipSize, theme);
    menu.style.color = theme.surface.menuText;
    menu.style.boxShadow = theme.surface.menuShadow;
    menu.style.pointerEvents = "auto";
}

export function createDrawingContextMenu(theme: ChartTheme, onDelete: () => void): HTMLDivElement {
    const menu = document.createElement("div");
    applyDrawingContextMenuTheme(menu, theme);
    const deleteItem = document.createElement("div");
    deleteItem.textContent = "Delete drawing";
    deleteItem.style.padding = "6px 10px";
    deleteItem.style.cursor = "pointer";
    deleteItem.style.borderRadius = "4px";
    deleteItem.onmouseenter = () => {
        deleteItem.style.background = menu.dataset.deleteHover ?? "transparent";
    };
    deleteItem.onmouseleave = () => {
        deleteItem.style.background = "transparent";
    };
    deleteItem.onclick = (event) => {
        event.stopPropagation();
        onDelete();
    };
    menu.appendChild(deleteItem);

    return menu;
}
