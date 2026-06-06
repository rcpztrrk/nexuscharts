import test from "node:test";
import assert from "node:assert/strict";

import {
  chartToDataURL,
  chartToSVG,
  copyDataURLToClipboard,
  downloadDataURL,
} from "../ts-src/core/export/ImageExport.ts";

interface FakeCanvas {
  width: number;
  height: number;
  calls: string[];
  getContext: () => unknown;
  toDataURL: (type?: string, quality?: number) => string;
}

const createCanvas = (label: string, ctx: unknown = null): FakeCanvas => ({
  width: 320,
  height: 180,
  calls: [],
  getContext: () => ctx,
  toDataURL(type = "image/png", quality?: number) {
    this.calls.push(`toDataURL:${type}:${quality ?? "none"}`);
    return `data:${type};base64,${label}`;
  },
});

test("chartToDataURL exports the base canvas without overlay", () => {
  const canvas = createCanvas("base");

  const dataUrl = chartToDataURL(canvas as any, null, {
    type: "image/jpeg",
    quality: 1.5,
  });

  assert.equal(dataUrl, "data:image/jpeg;base64,base");
  assert.deepEqual(canvas.calls, ["toDataURL:image/jpeg:1"]);
});

test("chartToDataURL composites overlay and background on an output canvas", () => {
  const originalDocument = (globalThis as any).document;
  const operations: string[] = [];
  const ctx = {
    set fillStyle(value: string) {
      operations.push(`fillStyle:${value}`);
    },
    fillRect: (x: number, y: number, width: number, height: number) => {
      operations.push(`fillRect:${x}:${y}:${width}:${height}`);
    },
    drawImage: (canvas: FakeCanvas, x: number, y: number) => {
      operations.push(`drawImage:${canvas.toDataURL()}:${x}:${y}`);
    },
  };
  const output = createCanvas("merged", ctx);
  const base = createCanvas("base");
  const overlay = createCanvas("overlay");

  (globalThis as any).document = {
    createElement: (tagName: string) => {
      assert.equal(tagName, "canvas");
      return output;
    },
  };

  try {
    const dataUrl = chartToDataURL(base as any, overlay as any, {
      includeOverlay: true,
      backgroundColor: "#0b1220",
    });

    assert.equal(dataUrl, "data:image/png;base64,merged");
    assert.deepEqual(operations, [
      "fillStyle:#0b1220",
      "fillRect:0:0:320:180",
      "drawImage:data:image/png;base64,base:0:0",
      "drawImage:data:image/png;base64,overlay:0:0",
    ]);
  } finally {
    (globalThis as any).document = originalDocument;
  }
});

test("chartToSVG escapes embedded data URLs and background attributes", () => {
  const canvas = createCanvas("base");

  const svg = chartToSVG(canvas as any, "data:image/svg+xml,<bad>&\"payload", {
    backgroundColor: "\"<bg>&",
  });

  assert.ok(svg?.includes('width="320" height="180"'));
  assert.ok(svg?.includes('fill="&quot;&lt;bg&gt;&amp;"'));
  assert.ok(svg?.includes('href="data:image/svg+xml,&lt;bad&gt;&amp;&quot;payload"'));
});

test("downloadDataURL clicks a temporary download link", () => {
  const originalDocument = (globalThis as any).document;
  const calls: string[] = [];
  const link = {
    href: "",
    download: "",
    rel: "",
    click: () => calls.push("click"),
    remove: () => calls.push("remove"),
  };

  (globalThis as any).document = {
    createElement: (tagName: string) => {
      assert.equal(tagName, "a");
      return link;
    },
    body: {
      appendChild: (node: unknown) => {
        assert.equal(node, link);
        calls.push("append");
      },
    },
  };

  try {
    assert.equal(downloadDataURL("data:image/png;base64,abc", "chart.png"), true);
    assert.equal(link.href, "data:image/png;base64,abc");
    assert.equal(link.download, "chart.png");
    assert.equal(link.rel, "noopener");
    assert.deepEqual(calls, ["append", "click", "remove"]);
    assert.equal(downloadDataURL(null, "chart.png"), false);
  } finally {
    (globalThis as any).document = originalDocument;
  }
});

test("copyDataURLToClipboard returns false when image clipboard is unsupported", async () => {
  const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalClipboardItem = (globalThis as any).ClipboardItem;
  const originalWarn = console.warn;
  const warnings: string[] = [];

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {},
  });
  (globalThis as any).ClipboardItem = undefined;
  console.warn = (message: string) => {
    warnings.push(message);
  };

  try {
    assert.equal(await copyDataURLToClipboard("data:image/png;base64,abc"), false);
    assert.equal(warnings.length, 1);
  } finally {
    if (originalNavigatorDescriptor) {
      Object.defineProperty(globalThis, "navigator", originalNavigatorDescriptor);
    } else {
      delete (globalThis as any).navigator;
    }
    (globalThis as any).ClipboardItem = originalClipboardItem;
    console.warn = originalWarn;
  }
});
