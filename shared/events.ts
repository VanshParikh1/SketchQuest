import type { DeathEvent, WinEvent } from "./level";

export type GameEventMap = {
  death: DeathEvent;
  win: WinEvent;
};

type Listener<T> = (payload: T) => void;

export class TypedEmitter<Events extends Record<string, unknown>> {
  private listeners: { [K in keyof Events]?: Set<Listener<Events[K]>> } = {};

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    (this.listeners[event] ??= new Set()).add(listener);
    return () => this.off(event, listener);
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    this.listeners[event]?.delete(listener);
  }

  emit<K extends keyof Events>(
    event: K,
    ...args: Events[K] extends void ? [] : [payload: Events[K]]
  ): void {
    this.listeners[event]?.forEach((listener) => listener(args[0] as Events[K]));
  }
}

/** Game -> UI/narrator bridge. Subscribers never touch Phaser internals. */
export const gameEvents = new TypedEmitter<GameEventMap>();
