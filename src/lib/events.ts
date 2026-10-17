import { EventEmitter } from "events";

declare global {
  var _eventEmitter: EventEmitter | undefined;
}

export const eventEmitter = global._eventEmitter ?? new EventEmitter();

// Keep one emitter per process — it must survive Next.js dev reloads, and the
// custom server's telephony bridge (plain JS, outside the Next bundle) reaches
// it through the same global to push live call updates.
global._eventEmitter = eventEmitter;
// Every open conversation drawer adds listeners; don't warn at the default 10.
eventEmitter.setMaxListeners(0);
