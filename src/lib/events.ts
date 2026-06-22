import { EventEmitter } from "events";

declare global {
  var _eventEmitter: EventEmitter | undefined;
}

export const eventEmitter = global._eventEmitter ?? new EventEmitter();

// Ensure the singleton persists across Next.js dev reloads
if (process.env.NODE_ENV !== "production") {
  global._eventEmitter = eventEmitter;
}
