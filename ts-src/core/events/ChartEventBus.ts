import type { ChartEventHandler, ChartEventMap, ChartEventName } from "../../types";

export class ChartEventBus {
    private readonly listeners: Partial<Record<ChartEventName, Set<(payload: unknown) => void>>> = {};

    public subscribe<K extends ChartEventName>(eventName: K, handler: ChartEventHandler<K>): () => void {
        const listeners = this.listeners[eventName] ?? new Set<(payload: unknown) => void>();
        listeners.add(handler as (payload: unknown) => void);
        this.listeners[eventName] = listeners;
        return () => {
            this.unsubscribe(eventName, handler);
        };
    }

    public unsubscribe<K extends ChartEventName>(eventName: K, handler: ChartEventHandler<K>): boolean {
        const listeners = this.listeners[eventName];
        if (!listeners) {
            return false;
        }
        return listeners.delete(handler as (payload: unknown) => void);
    }

    public emit<K extends ChartEventName>(eventName: K, payload: ChartEventMap[K]): void {
        const listeners = this.listeners[eventName];
        if (!listeners || listeners.size === 0) {
            return;
        }

        for (const listener of listeners) {
            try {
                (listener as ChartEventHandler<K>)(payload);
            } catch (error) {
                console.error(`[NexusCharts] Event listener for '${eventName}' failed.`, error);
            }
        }
    }
}
