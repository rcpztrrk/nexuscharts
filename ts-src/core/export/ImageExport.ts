import type { ChartImageExportOptions } from "../../types";

export function chartToDataURL(
    canvas: HTMLCanvasElement | null,
    overlayCanvas: HTMLCanvasElement | null,
    options: ChartImageExportOptions = {}
): string | null {
    if (!canvas) {
        return null;
    }

    const type = options.type ?? "image/png";
    const quality = Number.isFinite(options.quality)
        ? Math.max(0, Math.min(1, Number(options.quality)))
        : undefined;

    if (!options.includeOverlay || !overlayCanvas) {
        return canvas.toDataURL(type, quality);
    }

    const output = document.createElement("canvas");
    output.width = canvas.width;
    output.height = canvas.height;
    const ctx = output.getContext("2d");
    if (!ctx) {
        return canvas.toDataURL(type, quality);
    }

    if (options.backgroundColor) {
        ctx.fillStyle = options.backgroundColor;
        ctx.fillRect(0, 0, output.width, output.height);
    }
    ctx.drawImage(canvas, 0, 0);
    ctx.drawImage(overlayCanvas, 0, 0);
    return output.toDataURL(type, quality);
}

export function downloadDataURL(dataUrl: string | null, filename: string): boolean {
    if (!dataUrl) {
        return false;
    }

    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
}

export function chartToSVG(
    canvas: HTMLCanvasElement | null,
    dataUrl: string | null,
    options: ChartImageExportOptions = {}
): string | null {
    if (!canvas || !dataUrl) {
        return null;
    }

    const width = canvas.width;
    const height = canvas.height;
    const background = options.backgroundColor
        ? `<rect width="100%" height="100%" fill="${escapeXmlAttribute(options.backgroundColor)}"/>`
        : "";

    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
        background,
        `<image href="${escapeXmlAttribute(dataUrl)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/>`,
        "</svg>",
    ].join("");
}

export function downloadTextFile(text: string | null, filename: string, type: string): boolean {
    if (!text) {
        return false;
    }

    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return true;
}

export async function copyDataURLToClipboard(dataUrl: string | null): Promise<boolean> {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        console.warn("[NexusCharts] Clipboard image export is not supported in this browser.");
        return false;
    }
    if (!dataUrl) {
        return false;
    }

    const blob = dataUrlToBlob(dataUrl);
    if (!blob) {
        return false;
    }

    try {
        await navigator.clipboard.write([
            new ClipboardItem({
                [blob.type]: blob,
            }),
        ]);
        return true;
    } catch (error) {
        console.warn("[NexusCharts] Failed to copy chart image to clipboard.", error);
        return false;
    }
}

function escapeXmlAttribute(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function dataUrlToBlob(dataUrl: string): Blob | null {
    const commaIndex = dataUrl.indexOf(",");
    if (commaIndex < 0) {
        return null;
    }

    const metadata = dataUrl.slice(0, commaIndex);
    const payload = dataUrl.slice(commaIndex + 1);
    const mimeType = metadata.match(/^data:([^;]+);base64$/)?.[1] ?? "image/png";

    try {
        const binary = atob(payload);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: mimeType });
    } catch {
        return null;
    }
}
