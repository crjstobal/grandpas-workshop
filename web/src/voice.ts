// The voice director: one voice at a time, never a pile-up.
//
// - "story" lines (the narrator, Grandpa's messages, the letter) are never dropped. They wait for
//   whoever is talking to finish, and while one is waiting, Jingle's chatter is cleared.
// - "chatter" (Jingle reacting to things) is disposable: only the latest queued line is kept, and
//   it is dropped if it has waited too long to still make sense.
// - "alexa" interrupts chatter, like a real assistant answering you.
// Music ducks while anyone speaks. Audio comes from the server (pre-rendered ElevenLabs lines,
// live ElevenLabs, or Polly); the browser's own speech is the last resort.
import { musicBox } from "./music";

export type Speaker = "narrator" | "jingle" | "grandpa" | "alexa";
export type LineKind = "story" | "chatter" | "alexa";

interface Line { who: Speaker; text: string; kind: LineKind; at: number; done?: () => void }

const CHATTER_MAX_WAIT_MS = 4000;
/** A breath between one line and the next, so voices never tread on each other. */
const GAP_STORY_MS = 900;
const GAP_CHATTER_MS = 450;

let queue: Line[] = [];
let current: { line: Line; audio: HTMLAudioElement | null } | null = null;
let paused = false;
const listeners = new Set<(who: Speaker | null) => void>();
const prefetched = new Map<string, Promise<string | null>>();

const kindOf = (who: Speaker): LineKind => (who === "jingle" ? "chatter" : who === "alexa" ? "alexa" : "story");
const url = (who: Speaker, text: string) => `/api/voice?who=${who}&text=${encodeURIComponent(text.trim())}`;

/** Queue a line. Returns a promise that resolves when it has been spoken (or dropped). */
export function speak(who: Speaker, text: string, opts: { kind?: LineKind; interrupt?: boolean } = {}): Promise<void> {
  if (!text?.trim()) return Promise.resolve();
  const kind = opts.kind ?? kindOf(who);
  return new Promise((done) => {
    const line: Line = { who, text: text.trim(), kind, at: Date.now(), done };
    if (opts.interrupt) stop();
    if (kind === "chatter") {
      // Only the newest chatter waits; older chatter is stale by now.
      queue = queue.filter((l) => { if (l.kind === "chatter") { l.done?.(); return false; } return true; });
      if (queue.some((l) => l.kind === "story")) { done(); return; }
    } else {
      queue = queue.filter((l) => { if (l.kind === "chatter") { l.done?.(); return false; } return true; });
    }
    if (kind === "alexa" && current?.line.kind === "chatter") skip();
    queue.push(line);
    prefetch(line);
    void pump();
  });
}

/** Stops everything and empties the queue. */
export function stop() {
  for (const l of queue) l.done?.();
  queue = [];
  skip();
  try { speechSynthesis?.cancel(); } catch { /* none */ }
}

/** The remote's play/pause: pauses and resumes whoever is talking. */
export function togglePause() {
  paused = !paused;
  if (current?.audio) { if (paused) current.audio.pause(); else void current.audio.play().catch(() => {}); }
  if (!paused) void pump();
  return paused;
}
export const isPaused = () => paused;

/** Who is talking right now (null when quiet). For the Alexa ring, Jingle's beak, subtitles... */
export function onSpeaking(fn: (who: Speaker | null) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export const speaking = () => current?.line.who ?? null;

/** What is being said right now, for subtitles. */
const lineListeners = new Set<(line: { who: Speaker; text: string } | null) => void>();
export function onLine(fn: (line: { who: Speaker; text: string } | null) => void) {
  lineListeners.add(fn);
  fn(current ? { who: current.line.who, text: current.line.text } : null);
  return () => { lineListeners.delete(fn); };
}

/** Resolves once nobody has been speaking (and nothing is queued) for `quietMs`: a game waits for
 * it before playing sounds the family has to listen to. */
export function whenQuiet(quietMs = 700): Promise<void> {
  return new Promise((resolve) => {
    let since = Date.now();
    const t = setInterval(() => {
      if (current || queue.length || pumping) since = Date.now();
      else if (Date.now() - since >= quietMs) { clearInterval(t); resolve(); }
    }, 100);
  });
}

function emit(who: Speaker | null) {
  musicBox.duck(who === null ? null : who === "narrator" || who === "grandpa" ? "story" : "chat");
  for (const l of listeners) l(who);
}

function skip() {
  if (!current) return;
  const c = current;
  current = null;
  c.audio?.pause();
  c.line.done?.();
}

function prefetch(line: Line) {
  const k = `${line.who}:${line.text}`;
  if (prefetched.has(k)) return prefetched.get(k)!;
  const p = fetch(url(line.who, line.text))
    .then(async (res) => (res.status === 200 ? URL.createObjectURL(await res.blob()) : null))
    .catch(() => null);
  prefetched.set(k, p);
  if (prefetched.size > 80) prefetched.delete(prefetched.keys().next().value!);
  return p;
}

let pumping = false;
async function pump() {
  if (pumping || current || paused) return;
  pumping = true;
  try {
    while (queue.length && !paused) {
      const line = queue.shift()!;
      if (line.kind === "chatter" && Date.now() - line.at > CHATTER_MAX_WAIT_MS) { line.done?.(); continue; }
      // Warm up the next one while this one plays.
      if (queue[0]) prefetch(queue[0]);
      const src = await prefetch(line);
      current = { line, audio: null };
      emit(line.who);
      for (const l of lineListeners) l({ who: line.who, text: line.text });
      if (src) await playAudio(src); else await browserSpeak(line);
      if (current?.line === line) { current = null; line.done?.(); }
      for (const l of lineListeners) l(null);
      emit(null);
      if (queue.length) await new Promise((r) => setTimeout(r, line.kind === "chatter" ? GAP_CHATTER_MS : GAP_STORY_MS));
    }
  } finally {
    pumping = false;
  }
}

function playAudio(src: string) {
  return new Promise<void>((resolve) => {
    const a = new Audio(src);
    if (current) current.audio = a;
    const end = () => resolve();
    a.onended = end;
    a.onerror = end;
    a.onpause = () => { if (!paused) end(); };
    a.play().catch(end);
  });
}

function browserSpeak(line: Line) {
  return new Promise<void>((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(line.text);
    u.lang = line.who === "narrator" || line.who === "grandpa" ? "en-GB" : "en-US";
    u.pitch = line.who === "jingle" ? 1.6 : line.who === "grandpa" ? 0.7 : line.who === "narrator" ? 0.85 : 1;
    u.rate = line.who === "narrator" || line.who === "grandpa" ? 0.92 : 1;
    // Some browsers never fire onend: time out by length.
    const t = setTimeout(resolve, 1500 + line.text.length * 80);
    u.onend = u.onerror = () => { clearTimeout(t); resolve(); };
    speechSynthesis.speak(u);
  });
}
