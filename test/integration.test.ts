import test from "node:test";
import assert from "node:assert/strict";

import type {
  CandleDataPoint,
  ChartDrawingUpdateEvent,
  ChartTimeScaleChangeEvent,
  DrawingDefinition,
  SeriesGeometry,
} from "../ts-src/types.ts";
import {
  applyAnchorsToDrawing,
  applyDragToDrawing,
  distancePointToSegment,
  type DrawingCoordinateApi,
} from "../ts-src/core/drawings/DrawingEngine.ts";
import { IndicatorEngine } from "../ts-src/core/indicators/IndicatorEngine.ts";
import { createChartTheme } from "../ts-src/core/theme/ChartTheme.ts";

const theme = createChartTheme();

const candles: CandleDataPoint[] = [
  { time: 1000, open: 100, high: 103, low: 99, close: 102 },
  { time: 2000, open: 102, high: 105, low: 101, close: 104 },
  { time: 3000, open: 104, high: 106, low: 103, close: 105 },
  { time: 4000, open: 105, high: 108, low: 104, close: 107 },
];

const geometry: SeriesGeometry = {
  candles: candles.map((source, i) => ({
    source,
    x: -0.8 + (i * 0.5),
    open: source.open,
    high: source.high,
    low: source.low,
    close: source.close,
  })),
  minPrice: 90,
  maxPrice: 120,
  scale: 1,
};

const coordinateApi: DrawingCoordinateApi = {
  timeToWorldX(time, g) {
    const numeric = Number(time);
    const index = g.candles.findIndex((c) => Number(c.source.time) === numeric);
    return index >= 0 ? g.candles[index].x : null;
  },
  worldXToTime(worldX, g) {
    let nearest = g.candles[0];
    let best = Math.abs(worldX - nearest.x);
    for (let i = 1; i < g.candles.length; i += 1) {
      const c = g.candles[i];
      const d = Math.abs(worldX - c.x);
      if (d < best) {
        nearest = c;
        best = d;
      }
    }
    return nearest.source.time;
  },
  priceToWorldY(price) {
    return price;
  },
  worldYToPrice(worldY) {
    return worldY;
  },
};

test("DrawingEngine applies time/price anchors to world coordinates", () => {
  const drawing = {
    id: "line_1",
    type: "line",
    points: [
      { x: 0, y: 0, time: 1000, price: 101 },
      { x: 0, y: 0, time: 3000, price: 105 },
    ],
  } as const;

  const editable = {
    ...drawing,
    points: drawing.points.map((p) => ({ ...p })),
  };

  applyAnchorsToDrawing(editable, geometry, coordinateApi);

  assert.equal(editable.points[0].x, geometry.candles[0].x);
  assert.equal(editable.points[1].x, geometry.candles[2].x);
  assert.equal(editable.points[0].y, 101);
  assert.equal(editable.points[1].y, 105);
});

test("DrawingEngine drag updates a single polyline handle and syncs anchors", () => {
  const drawing = {
    id: "poly_1",
    type: "polyline",
    points: [
      { x: geometry.candles[0].x, y: 100, time: 1000, price: 100 },
      { x: geometry.candles[1].x, y: 102, time: 2000, price: 102 },
      { x: geometry.candles[2].x, y: 104, time: 3000, price: 104 },
    ],
  };

  applyDragToDrawing(
    drawing,
    {
      id: drawing.id,
      mode: "poly_point",
      pointIndex: 1,
      startWorld: { x: 0, y: 0 },
      startPoints: drawing.points.map((p) => ({ ...p })),
    },
    { x: 0.3, y: -1.0 },
    geometry,
    coordinateApi
  );

  assert.equal(drawing.points[0].x, geometry.candles[0].x);
  assert.equal(drawing.points[2].x, geometry.candles[2].x);
  assert.equal(drawing.points[1].x, geometry.candles[1].x + 0.3);
  assert.equal(drawing.points[1].y, 101);
  assert.equal(typeof drawing.points[1].time, "number");
  assert.equal(drawing.points[1].price, 101);
});

test("distancePointToSegment returns near-zero for points on segment", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 2, y: 0 };
  const p = { x: 1, y: 0 };
  assert.ok(distancePointToSegment(p, a, b) < 1e-6);
});

test("IndicatorEngine toggles lower pane availability with RSI indicators", () => {
  const engine = new IndicatorEngine();
  const createId = (() => {
    let i = 0;
    return () => `ind_${++i}`;
  })();

  assert.equal(engine.hasLowerPane(), false);

  const id = engine.addIndicator({ type: "rsi", period: 14, pane: "lower" }, createId, theme);
  engine.recompute(candles);

  assert.equal(engine.hasLowerPane(), true);
  assert.ok(engine.getIndicators().some((indicator) => indicator.id === id));
  assert.equal(engine.removeIndicator(id), true);
  assert.equal(engine.hasLowerPane(), false);
});

test("Event and time-scale payload contract remains stable", () => {
  const drawing: DrawingDefinition = {
    id: "d_1",
    type: "line",
    points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  };

  const drawingEvent: ChartDrawingUpdateEvent = {
    drawing,
    previousDrawing: { ...drawing, points: drawing.points?.map((p) => ({ ...p })) },
    reason: "drag",
    mode: "poly_point",
    pointIndex: 1,
  };

  const timeScaleEvent: ChartTimeScaleChangeEvent = {
    zoom: 1.2,
    zoomX: 1.4,
    zoomY: 0.9,
    centerX: 0,
    centerY: 0,
    viewportWidth: 1280,
    viewportHeight: 720,
    timeAxis: { timezone: "UTC", gapMode: "compress" },
    visibleRange: {
      startIndex: 10,
      endIndex: 40,
      fromTime: 1000,
      toTime: 4000,
      fromPrice: 98,
      toPrice: 111,
    },
  };

  assert.equal(drawingEvent.mode, "poly_point");
  assert.equal(drawingEvent.pointIndex, 1);
  assert.equal(timeScaleEvent.timeAxis.timezone, "UTC");
  assert.equal(timeScaleEvent.visibleRange.startIndex, 10);
});
