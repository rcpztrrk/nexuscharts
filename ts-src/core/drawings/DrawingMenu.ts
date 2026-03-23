export function createDrawingContextMenu(onDelete: () => void): HTMLDivElement {
    const menu = document.createElement("div");
    menu.style.position = "absolute";
    menu.style.display = "none";
    menu.style.zIndex = "20";
    menu.style.minWidth = "140px";
    menu.style.background = "rgba(10, 24, 44, 0.96)";
    menu.style.border = "1px solid rgba(120, 148, 188, 0.5)";
    menu.style.borderRadius = "6px";
    menu.style.padding = "4px";
    menu.style.font = "12px 'Segoe UI', sans-serif";
    menu.style.color = "#dce7ff";
    menu.style.boxShadow = "0 8px 22px rgba(0, 0, 0, 0.35)";
    menu.style.pointerEvents = "auto";

    const deleteItem = document.createElement("div");
    deleteItem.textContent = "Delete drawing";
    deleteItem.style.padding = "6px 10px";
    deleteItem.style.cursor = "pointer";
    deleteItem.style.borderRadius = "4px";
    deleteItem.onmouseenter = () => {
        deleteItem.style.background = "rgba(255, 107, 122, 0.15)";
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
