// Live rooms, kept in memory: a game lasts half an hour and nothing needs to survive a restart.
// Every change is pushed to the TV and the phones that listen on the room's event stream.
import { createRoom, newCode, publicState, tick, afterRecord, GameError, type Room } from "./engine";
import type { PublicState } from "../../../shared/types";

const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ROOMS = 500;

type Listener = (s: PublicState) => void;

const rooms = new Map<string, Room>();
const listeners = new Map<string, Set<Listener>>();

export function create(): Room {
  sweep();
  if (rooms.size >= MAX_ROOMS) throw new GameError("Too many workshops open right now, try again in a minute.", 503);
  let code = newCode();
  while (rooms.has(code)) code = newCode();
  const r = createRoom(code);
  rooms.set(code, r);
  return r;
}

export function get(code: string): Room {
  const r = rooms.get(code.toUpperCase());
  if (!r) throw new GameError("This workshop does not exist or has closed.", 404);
  return r;
}

/** Runs a change on a room and broadcasts the new state. */
export function mutate<T>(code: string, fn: (r: Room) => T): T {
  const r = get(code);
  const out = fn(r);
  r.updatedAt = Date.now();
  broadcast(r);
  return out;
}

export function broadcast(r: Room) {
  const s = publicState(r);
  for (const l of listeners.get(r.code) ?? []) l(s);
}

export function subscribe(code: string, l: Listener) {
  const r = get(code);
  let set = listeners.get(r.code);
  if (!set) listeners.set(r.code, (set = new Set()));
  set.add(l);
  l(publicState(r));
  return () => set!.delete(l);
}

/** Runs fn on the room later, if it still exists. Used for timed beats (door opening, record playing). */
export function later(code: string, ms: number, fn: (r: Room) => void) {
  setTimeout(() => {
    if (rooms.has(code)) mutate(code, fn);
  }, ms);
}

// Timed phases (statues) move on by themselves, a few times a second.
setInterval(() => {
  const now = Date.now();
  for (const r of rooms.values()) {
    const t = tick(r, now);
    if (!t) continue;
    r.updatedAt = now;
    broadcast(r);
    if (t === "song") later(r.code, 6_000, afterRecord);
  }
}, 200).unref();

function sweep() {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (now - r.updatedAt > ROOM_TTL_MS) {
      rooms.delete(code);
      listeners.delete(code);
    }
  }
}
