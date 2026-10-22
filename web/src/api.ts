// Talking to the game server, plus the live room state hook used by both screens.
import { useEffect, useState } from "react";
import type { AlexaCard, AlexaTurn, FinalePhase, IcingStroke, Player, ProductId, PublicState, ScanKind, ScanResult } from "../../shared/types";

export type { AlexaTurn };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? "Something went wrong.");
  return body as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const post = <T = { done: boolean }>(code: string, path: string, body: unknown = {}) => call<T>(`/api/rooms/${code}/${path}`, json(body));

export const api = {
  createRoom: () => call<{ code: string; joinUrl: string }>("/api/rooms", { method: "POST" }),
  getRoom: (code: string) => call<PublicState>(`/api/rooms/${code}`),
  join: (code: string, name: string, deviceId: string, grownUp: boolean) => post<Player>(code, "join", { name, deviceId, grownUp }),
  leave: (code: string, playerId: string, deviceId: string) => post<void>(code, "leave", { playerId, deviceId }),
  advance: (code: string) => post<{ chapter: string }>(code, "advance"),
  skipTurn: (code: string) => post<void>(code, "skip-turn"),
  /** Every shake, in every chapter that uses shaking (wind, statues, starlight, flight). */
  shake: (code: string, playerId: string, energy: number) => post<void>(code, "shake", { playerId, energy }),
  give: (code: string, findId: string) => post(code, "give", { findId }),
  unlock: (code: string) => post(code, "unlock"),
  drawer: (code: string, combo: string) => post(code, "drawer", { code: combo }),
  globeGear: (code: string, playerId: string, x: number, y: number, hold: number) => post(code, "globe-gear", { playerId, x, y, hold }),
  globeResult: (code: string, playerId: string, ok: boolean, n?: number) => post(code, "globe-result", { playerId, ok, n }),
  skip: (code: string, playerId: string) => post<{ chapter: string }>(code, "skip", { playerId }),
  orchestra: (code: string, round: number) => post(code, "orchestra", { round }),
  record: (code: string) => post(code, "record"),
  recordDone: (code: string) => post(code, "record-done"),
  danceMove: (code: string) => post(code, "dance-move"),
  hang: (code: string, findId: string, hook: number) => post(code, "hang", { findId, hook }),
  quiz: (code: string, pick: number) => post(code, "quiz", { pick }),
  catch: (code: string) => post(code, "catch"),
  flight: (code: string, progress: number) => post(code, "flight", { progress }),
  finale: (code: string, phase: FinalePhase) => post(code, "finale", { phase }),
  stroke: (code: string, playerId: string, stroke: Omit<IcingStroke, "playerId">) => post<void>(code, "stroke", { playerId, stroke }),
  clearStrokes: (code: string, playerId: string) => post<void>(code, "clear-strokes", { playerId }),
  cookieDone: (code: string) => post<void>(code, "cookie-done"),
  alexa: (code: string, message: string) => post<{ text: string; card?: AlexaCard }>(code, "alexa", { message }),
  products: (code: string) => call<{ productId: ProductId; title: string; pitch: string; price: string; priceSpoken: string; owned: boolean }[]>(`/api/rooms/${code}/products`),
  approve: (code: string, checkoutId: string, playerId: string, yes: boolean) => post<{ status: string }>(code, "purchase/approve", { checkoutId, playerId, yes }),
  appstorePurchase: (code: string, productId: ProductId, receiptId?: string) => post<{ status: string; receiptId: string }>(code, "purchase/appstore", { productId, receiptId }),
  scan: (code: string, playerId: string, kind: ScanKind, image: Blob) => {
    const form = new FormData();
    form.set("playerId", playerId);
    form.set("kind", kind);
    form.set("image", image, "scan.jpg");
    return call<ScanResult>(`/api/rooms/${code}/scan`, { method: "POST", body: form });
  },
};

/** Live state of a room over Server-Sent Events. Falls back to polling when the network
 * buffers the stream (some proxies and tunnels do), so the TV never gets stuck. */
export function useRoom(code: string | null) {
  const [state, setState] = useState<PublicState | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!code) return;
    // Live updates come over Server-Sent Events. A browser closes an EventSource for good when the
    // server answers with an error (a restart or deploy), and some proxies and TV browsers stall it
    // quietly, so a watchdog reopens it, and polls the plain snapshot until the stream is back.
    let alive = true;
    let es: EventSource | null = null;
    let lastHeard = Date.now();
    let poll: ReturnType<typeof setInterval> | null = null;
    const fetchOnce = () => fetch(`/api/rooms/${code}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((s: PublicState) => { if (alive) { setState(s); setError(null); } })
      .catch((st) => alive && setError(st === 404 ? "This workshop has closed." : "Reconnecting to the workshop..."));
    const startPolling = () => { if (!poll) { void fetchOnce(); poll = setInterval(fetchOnce, 1000); } };
    const stopPolling = () => { if (poll) { clearInterval(poll); poll = null; } };
    const open = () => {
      es?.close();
      lastHeard = Date.now();
      es = new EventSource(`/api/rooms/${code}/events`);
      es.addEventListener("state", (e) => {
        lastHeard = Date.now();
        stopPolling();
        setState(JSON.parse((e as MessageEvent).data));
        setError(null);
      });
      es.addEventListener("ping", () => { lastHeard = Date.now(); });
      es.onerror = () => { startPolling(); };
    };
    open();
    // No first state within 2.5 s: poll while the stream gets going.
    const first = setTimeout(() => { if (Date.now() - lastHeard >= 2400) startPolling(); }, 2500);
    // The server pings every 5 s: 12 s of silence, or a closed stream, means reopen it.
    const watchdog = setInterval(() => {
      if (es?.readyState === EventSource.CLOSED || Date.now() - lastHeard > 12_000) { startPolling(); open(); }
    }, 2000);
    // Back from the background (a phone's screen turned off): catch up at once.
    const onVisible = () => { if (document.visibilityState === "visible") { void fetchOnce(); open(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      es?.close();
      clearTimeout(first);
      clearInterval(watchdog);
      stopPolling();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [code]);
  return { state, error };
}
