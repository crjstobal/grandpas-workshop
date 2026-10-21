// Live rooms, kept in memory and saved to disk after every change, so a game survives a server
// restart or a deploy (the family just carries on). Every change is pushed to the TV and the phones
// that listen on the room's event stream.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createRoom, newCode, publicState, tick, afterRecord, afterWarm, afterDoor, afterGlobe, afterOrchestra, afterOrnaments,
  afterMemory, afterStarlight, afterFlight, GameError, type Room, type StoredImage,
} from "./engine";
import type { PublicState } from "../../../shared/types";

const DATA_DIR = process.env.GW_DATA_DIR ? `${process.env.GW_DATA_DIR}/rooms` : fileURLToPath(new URL("../../../.data/rooms", import.meta.url));

const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ROOMS = 500;

type Listener = (s: PublicState) => void;

const rooms = new Map<string, Room>();
const listeners = new Map<string, Set<Listener>>();

// ---- saving: one JSON per room, photos as files next to it ----

const pending = new Map<string, ReturnType<typeof setTimeout>>();
const savedImages = new Set<string>();

function save(r: Room) {
  if (pending.has(r.code)) return;
  pending.set(r.code, setTimeout(() => {
    pending.delete(r.code);
    try {
      const dir = `${DATA_DIR}/${r.code}`;
      mkdirSync(dir, { recursive: true });
      const mimes: Record<string, string> = {};
      for (const [id, img] of r.images) {
        mimes[id] = img.mime;
        if (!savedImages.has(`${r.code}/${id}`)) { writeFileSync(`${dir}/${id}.img`, img.bytes); savedImages.add(`${r.code}/${id}`); }
      }
      writeFileSync(`${dir}/room.tmp`, JSON.stringify({ ...r, images: mimes }));
      renameSync(`${dir}/room.tmp`, `${dir}/room.json`);
    } catch (e) {
      console.warn("Could not save room", r.code, (e as Error).message);
    }
  }, 400).unref());
}

function restore() {
  if (!existsSync(DATA_DIR)) return;
  for (const code of readdirSync(DATA_DIR)) {
    try {
      const dir = `${DATA_DIR}/${code}`;
      const raw = JSON.parse(readFileSync(`${dir}/room.json`, "utf8")) as Room & { images: Record<string, string> };
      if (Date.now() - raw.updatedAt > ROOM_TTL_MS) { rmSync(dir, { recursive: true, force: true }); continue; }
      const images = new Map<string, StoredImage>();
      for (const [id, mime] of Object.entries(raw.images ?? {})) {
        if (existsSync(`${dir}/${id}.img`)) { images.set(id, { mime, bytes: readFileSync(`${dir}/${id}.img`) }); savedImages.add(`${code}/${id}`); }
      }
      const r: Room = { ...raw, images };
      // A pause between chapters (a timer) dies with the old process: finish any move that was due.
      for (const after of [afterWarm, afterDoor, afterGlobe, afterOrchestra, afterRecord, afterOrnaments, afterMemory, afterStarlight, afterFlight]) after(r);
      rooms.set(r.code, r);
    } catch (e) {
      console.warn("Could not restore room", code, (e as Error).message);
    }
  }
  if (rooms.size) console.log(`Restored ${rooms.size} game(s) from disk`);
}
restore();

export function create(): Room {
  sweep();
  if (rooms.size >= MAX_ROOMS) throw new GameError("Too many workshops open right now, try again in a minute.", 503);
  let code = newCode();
  while (rooms.has(code)) code = newCode();
  const r = createRoom(code);
  rooms.set(code, r);
  save(r);
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
  save(r);
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
      rmSync(`${DATA_DIR}/${code}`, { recursive: true, force: true });
    }
  }
}
