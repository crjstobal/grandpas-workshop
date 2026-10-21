// HTTP entry: the game API used by the TV and the phones, their live event stream, and the MCP
// endpoint used by assistants. Runtime-agnostic (Hono); node.ts serves it.
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { ScanKind, ScanResult } from "../../shared/types";
import * as game from "./game/engine";
import * as rooms from "./game/rooms";
import { buildMcpServer } from "./mcp";
import { judge, writeLetter, MODEL_ID, MOCK } from "./brain/nova";
import { talk } from "./brain/alexa";
import { speak, SPEAKERS, type Speaker } from "./brain/voice";
import { allow } from "./limits";

const SCAN_KINDS: ScanKind[] = ["key", "warm", "ornament", "cookie"];
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function createApp(opts: { phoneBaseUrl: () => string }) {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof game.GameError) return c.json({ error: err.message }, err.status as 400);
    console.error(err);
    return c.json({ error: "Something went wrong in the workshop." }, 500);
  });

  app.get("/api/health", (c) => c.json({ ok: true, model: MODEL_ID, mock: MOCK }));

  // ---- rooms (the TV creates one; phones join it) ----
  app.post("/api/rooms", (c) => {
    if (!allow(`room:${ip(c.req.raw)}`, 30)) return c.json({ error: "Too many workshops from here today." }, 429);
    const r = rooms.create();
    return c.json({ code: r.code, joinUrl: `${opts.phoneBaseUrl()}/play/${r.code}` }, 201);
  });

  // Plain snapshot, for clients whose network buffers the event stream (some proxies do).
  app.get("/api/rooms/:code", (c) => c.json(game.publicState(rooms.get(c.req.param("code")))));

  app.get("/api/rooms/:code/events", (c) => {
    const code = c.req.param("code");
    rooms.get(code); // 404 before opening the stream
    return streamSSE(c, async (stream) => {
      const queue: string[] = [];
      let wake: (() => void) | null = null;
      const off = rooms.subscribe(code, (s) => { queue.push(JSON.stringify(s)); wake?.(); });
      stream.onAbort(() => { off(); wake?.(); });
      while (!stream.aborted) {
        while (queue.length) await stream.writeSSE({ event: "state", data: queue.shift()! });
        await new Promise<void>((res) => { wake = res; setTimeout(res, 15_000); });
        wake = null;
        if (!queue.length && !stream.aborted) await stream.writeSSE({ event: "ping", data: "" });
      }
    });
  });

  app.post("/api/rooms/:code/join", async (c) => {
    const { name, deviceId, grownUp } = await c.req.json<{ name?: string; deviceId?: string; grownUp?: boolean }>();
    return c.json(rooms.mutate(c.req.param("code"), (r) => game.join(r, String(name ?? ""), String(deviceId ?? ""), grownUp === true)));
  });

  app.post("/api/rooms/:code/leave", async (c) => {
    const { playerId, deviceId } = await c.req.json<{ playerId: string; deviceId: string }>();
    rooms.mutate(c.req.param("code"), (r) => game.leave(r, String(playerId ?? ""), String(deviceId ?? "")));
    return c.body(null, 204);
  });

  // The remote's OK button, in chapters that are pure story.
  app.post("/api/rooms/:code/advance", (c) => c.json({ chapter: rooms.mutate(c.req.param("code"), game.advance) }));

  // Offline development only: jump to any chapter to check its screen.
  if (MOCK) app.post("/api/rooms/:code/dev/goto/:chapter", (c) =>
    c.json({ chapter: rooms.mutate(c.req.param("code"), (r) => game.devGoto(r, c.req.param("chapter") as never)) }));

  app.post("/api/rooms/:code/skip-turn", (c) => {
    rooms.mutate(c.req.param("code"), game.skipTurn);
    return c.body(null, 204);
  });

  // Every shake from a phone; what it does depends on the chapter.
  app.post("/api/rooms/:code/shake", async (c) => {
    const { playerId, energy } = await c.req.json<{ playerId: string; energy: number }>();
    rooms.mutate(c.req.param("code"), (r) => game.shake(r, String(playerId ?? ""), Number(energy) || 0));
    return c.body(null, 204);
  });

  // ---- what Jingle does on the TV ----
  /** Runs a step; when it reports true, the story moves on after a pause. */
  const step = (path: string, run: (r: game.Room, body: Record<string, unknown>) => boolean | void, then?: (r: game.Room) => void, pause = 6_000) => {
    app.post(`/api/rooms/:code/${path}`, async (c) => {
      const code = c.req.param("code");
      const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
      const done = rooms.mutate(code, (r) => run(r, body));
      if (done && then) rooms.later(code, pause, then);
      return c.json({ done: !!done });
    });
  };
  step("give", (r, b) => game.giveWarm(r, String(b.findId ?? "")), game.afterWarm, 7_000);
  step("unlock", (r) => game.unlockDoor(r), game.afterDoor, 5_000);
  step("drawer", (r, b) => game.tryDrawer(r, String(b.code ?? "")));
  step("globe-gear", (r, b) => { game.globeGear(r, String(b.playerId ?? ""), Number(b.x), Number(b.y), Number(b.hold)); });
  step("globe-result", (r, b) => game.globeResult(r, String(b.playerId ?? ""), b.ok === true), game.afterGlobe, 7_000);
  step("orchestra", (r, b) => game.orchestraDone(r, Number(b.round)), game.afterOrchestra, 8_000);
  // The record carries Grandpa's voice: the TV says when his message is over, with a fallback.
  step("record", (r) => game.playRecord(r), game.startDance, 40_000);
  step("record-done", (r) => game.startDance(r));
  step("dance-move", (r) => game.danceMove(r));
  step("hang", (r, b) => game.hangOrnament(r, String(b.findId ?? ""), Number(b.hook)), game.afterOrnaments, 6_000);
  step("quiz", (r, b) => game.answerQuiz(r, Number(b.pick)).done, game.afterMemory, 7_000);
  step("catch", (r) => game.catchSparkle(r), game.afterStarlight, 6_000);
  step("flight", (r, b) => game.flightProgress(r, Number(b.progress)), game.afterFlight, 5_000);
  step("finale", (r, b) => game.setFinale(r, String(b.phase ?? "") as never));

  // ---- the gingerbread for Grandpa ----
  app.post("/api/rooms/:code/stroke", bodyLimit({ maxSize: 32 * 1024 }), async (c) => {
    const { playerId, stroke } = await c.req.json<{ playerId: string; stroke: never }>();
    rooms.mutate(c.req.param("code"), (r) => game.addStroke(r, String(playerId ?? ""), stroke ?? ({} as never)));
    return c.body(null, 204);
  });
  app.post("/api/rooms/:code/clear-strokes", async (c) => {
    const { playerId } = await c.req.json<{ playerId: string }>();
    rooms.mutate(c.req.param("code"), (r) => game.clearStrokes(r, String(playerId ?? "")));
    return c.body(null, 204);
  });
  /** Nobody pressed "Give it to Grandpa": the TV moves on by itself. */
  app.post("/api/rooms/:code/cookie-done", (c) => {
    const code = c.req.param("code");
    if (rooms.mutate(code, game.finishCookie)) void finale(code);
    return c.body(null, 204);
  });

  // A phone scans a drawing or an object. multipart: playerId, kind, image (jpeg, already resized on the phone).
  app.post("/api/rooms/:code/scan", bodyLimit({ maxSize: 3 * 1024 * 1024 }), async (c) => {
    const code = c.req.param("code");
    const form = await c.req.formData();
    const playerId = String(form.get("playerId") ?? "");
    const kind = String(form.get("kind") ?? "") as ScanKind;
    const file = form.get("image");
    if (!SCAN_KINDS.includes(kind)) return c.json({ error: "Unknown scan." }, 400);
    if (!(file instanceof File) || !IMAGE_TYPES.has(file.type)) return c.json({ error: "Send a photo." }, 400);
    const r = rooms.get(code);
    const p = game.player(r, playerId);
    game.scanAllowed(r, kind, p.id);
    if (!allow(`scan:${code}`, 200)) return c.json({ error: "Jingle is tired of looking at photos for today." }, 429);

    if (kind !== "cookie") rooms.mutate(code, (x) => game.say(x, `Ooh, ${p.name} is showing me something...`));
    const bytes = Buffer.from(await file.arrayBuffer());
    const v = await judge(kind, bytes, file.type, p.name);
    const result: ScanResult = { accepted: v.accepted || kind === "cookie", label: v.label, jingleLine: v.jingleLine };
    let cookieDone = false;
    rooms.mutate(code, (x) => {
      game.scanAllowed(x, kind); // the chapter may have moved on while the judge was looking
      if (!result.accepted) { game.say(x, v.jingleLine); return; }
      const imageId = game.storeImage(x, bytes, file.type);
      result.find = game.acceptFind(x, p.id, kind, v.label, imageId, v.jingleLine);
      if (kind === "cookie") cookieDone = game.finishCookie(x);
    });
    if (cookieDone) void finale(code);
    return c.json(result);
  });

  app.get("/api/rooms/:code/images/:id", (c) => {
    const img = rooms.get(c.req.param("code")).images.get(c.req.param("id"));
    if (!img) return c.json({ error: "Not found." }, 404);
    return c.body(new Uint8Array(img.bytes), 200, { "content-type": img.mime, "cache-control": "private, max-age=86400" });
  });

  // ---- purchases (simulated, no money moves) ----
  app.get("/api/rooms/:code/products", (c) => c.json(game.products(rooms.get(c.req.param("code")))));

  // The grown-up approves or declines a purchase Alexa started, on their phone.
  app.post("/api/rooms/:code/purchase/approve", async (c) => {
    const { checkoutId, playerId, yes } = await c.req.json<{ checkoutId: string; playerId: string; yes: boolean }>();
    const code = c.req.param("code");
    const out = rooms.mutate(code, (r) => {
      const res = game.approveCheckout(r, String(checkoutId ?? ""), String(playerId ?? ""), yes === true);
      const card = game.checkoutCard(r);
      game.setAlexa(r, res.status === "completed"
        ? `Your grown-up said yes! ${"title" in res ? res.title : "It"} is ready. I sent the receipt to their phone.`
        : "I didn't get permission. That's okay, let's keep playing.", card);
      return res;
    });
    if ("warmed" in out && out.warmed) rooms.later(code, 7_000, game.afterWarm);
    return c.json(out);
  });

  // A purchase made on the TV through the Fire TV Appstore (Vega In-App Purchasing), or its
  // browser stand-in. The receipt comes from the Appstore.
  app.post("/api/rooms/:code/purchase/appstore", async (c) => {
    const { productId, receiptId } = await c.req.json<{ productId: string; receiptId?: string }>();
    const code = c.req.param("code");
    const out = rooms.mutate(code, (r) => game.completePurchase(r, String(productId ?? "") as never, "appstore", receiptId ? String(receiptId) : undefined));
    if (out.warmed) rooms.later(code, 7_000, game.afterWarm);
    return c.json(out);
  });

  // ---- simulated Alexa+ ----
  app.post("/api/rooms/:code/alexa", bodyLimit({ maxSize: 16 * 1024 }), async (c) => {
    const code = c.req.param("code");
    const { message } = await c.req.json<{ message?: string }>();
    if (!message || typeof message !== "string" || message.length > 500) return c.json({ error: "Say something to Alexa." }, 400);
    if (!allow(`alexa:${code}`, 150)) return c.json({ error: "Alexa needs a rest." }, 429);
    return c.json(await talk(code, message));
  });

  // ---- voices (ElevenLabs, Amazon Polly as fallback) ----
  app.get("/api/voice", async (c) => {
    const speaker = c.req.query("who") as Speaker;
    const text = (c.req.query("text") ?? "").slice(0, 1500);
    if (!SPEAKERS.includes(speaker) || !text) return c.json({ error: "Nothing to say." }, 400);
    if (!allow(`voice:${ip(c.req.raw)}`, 1500)) return c.json({ error: "Too many voices." }, 429);
    const mp3 = await speak(speaker, text);
    if (!mp3) return c.body(null, 204);
    return c.body(new Uint8Array(mp3), 200, { "content-type": "audio/mpeg", "cache-control": "public, max-age=86400" });
  });

  // ---- MCP (Streamable HTTP, stateless, spec 2025-11-25) ----
  // The room code in the URL scopes every tool to one family's game.
  app.all("/mcp/:code", bodyLimit({ maxSize: 64 * 1024 }), async (c) => {
    if (c.req.method !== "POST") {
      return c.json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }, 405);
    }
    const code = c.req.param("code");
    try { rooms.get(code); } catch {
      return c.json({ jsonrpc: "2.0", error: { code: -32001, message: "Unknown or closed workshop." }, id: null }, 404);
    }
    const server = buildMcpServer(code.toUpperCase());
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    try {
      return await transport.handleRequest(c.req.raw);
    } finally {
      await server.close();
    }
  });

  return app;
}

async function finale(code: string) {
  try {
    const m = game.memories(rooms.get(code));
    const letter = await writeLetter(m);
    rooms.mutate(code, (r) => game.setLetter(r, letter));
  } catch (e) {
    console.error(e);
    rooms.mutate(code, (r) => game.setLetter(r, "My dears,\nYou lit my star, and I found my way home. Merry Christmas.\nWith all my love, Grandpa Felix"));
  }
}

function ip(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}
