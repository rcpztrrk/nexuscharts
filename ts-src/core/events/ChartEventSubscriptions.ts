import type { ChartEventHandler, ChartEventName } from "../../types";
import type { ChartEventBus } from "./ChartEventBus";

export function subscribeChartEvent<K extends ChartEventName>(
    eventBus: ChartEventBus,
    eventName: K,
    handler: ChartEventHandler<K>
): () => void {
    return eventBus.subscribe(eventName, handler);
}

export function subscribeChartEventOnce<K extends ChartEventName>(
    eventBus: ChartEventBus,
    eventName: K,
    handler: ChartEventHandler<K>
): () => void {
    return eventBus.subscribeOnce(eventName, handler);
}

export function unsubscribeChartEvent<K extends ChartEventName>(
    eventBus: ChartEventBus,
    eventName: K,
    handler: ChartEventHandler<K>
): boolean {
    return eventBus.unsubscribe(eventName, handler);
}
