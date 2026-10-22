// The game rules. Pure state transitions on a Room: no network, no AI, no vendor SDKs.
// The HTTP layer, the MCP server and the AI judge all go through these functions.
import { randomBytes, randomUUID } from "node:crypto";
import { CHAPTERS, DANCE_ROUNDS, DRAWER_CODE, ORCHESTRA_ROUNDS, PRODUCTS, chapterNumber, chapterOf, nextChapter, CHAPTER_COUNT } from "../../../shared/story";
import type {
  ChapterId, Checkout, DanceState, FinalePhase, Find, FlightState, GlobeState, IcingStroke, JingleMood, Player, ProductId,
  PublicState, QuizQuestion, QuizState, ScanKind, Turn, AlexaCard,
} from "../../../shared/types";

export class GameError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export interface StoredImage { mime: string; bytes: Buffer }

export interface Room {
  code: string;
  createdAt: number;
  updatedAt: number;
  chapter: ChapterId;
  players: Player[];
  jingle: PublicState["jingle"];
  turn: Turn | null;
  /** Players who already took their turn in the current chapter. */
  turnDone: string[];
  wind: number;
  lastShake: { playerId: string; at: number } | null;
  key: Find | null;
  doorOpen: boolean;
  drawerOpen: boolean;
  drawerTries: number;
  warmFinds: Find[];
  pieces: PublicState["pieces"];
  globe: GlobeState;
  orchestraRound: number;
  recordPlaying: boolean;
  dance: DanceState;
  /** How many times each name was caught moving during statues (for Grandpa's letter). */
  danceCaught: Record<string, number>;
  ornaments: Find[];
  quiz: QuizState;
  starlight: number;
  sparkleDrop: { playerId: string; n: number; at: number } | null;
  flight: FlightState;
  finale: FinalePhase;
  cookie: PublicState["cookie"];
  letter: string | null;
  letterPending: boolean;
  alexa: PublicState["alexa"];
  entitlements: ProductId[];
  checkout: Checkout | null;
  hintsUsed: number;
  images: Map<string, StoredImage>;
}

const PLAYER_COLORS = ["#c0392b", "#2e7d5b", "#d4a017", "#2f6f9f", "#8e4fa0", "#d9772b", "#4a8f8f", "#a8516e"];
// No vowels that could spell words, no look-alike letters.
const CODE_LETTERS = "BCDFGHJKLMNPQRSTVWXZ";

export const STARLIGHT_NEEDED = 12;
const MAX_PLAYERS = 8;
const MAX_STROKES = 400;

export function newCode() {
  const b = randomBytes(4);
  return Array.from(b, (x) => CODE_LETTERS[x % CODE_LETTERS.length]).join("");
}

const freshDance = (): DanceState => ({ phase: "intro", round: 0, rounds: DANCE_ROUNDS, until: 0, caught: null, groove: 0 });

export function createRoom(code: string): Room {
  const now = Date.now();
  return {
    code, createdAt: now, updatedAt: now,
    chapter: "lobby", players: [],
    jingle: { mood: "sleep", line: "", at: now },
    turn: null, turnDone: [],
    wind: 0, lastShake: null, key: null, doorOpen: false, drawerOpen: false, drawerTries: 0,
    warmFinds: [], pieces: { gear: false, song: false, star: false },
    globe: { successes: 0, needed: 1, tried: [], gear: null, last: null },
    orchestraRound: 0, recordPlaying: false, dance: freshDance(), danceCaught: {},
    ornaments: [], quiz: { index: 0, questions: [], last: null, done: false },
    starlight: 0, sparkleDrop: null,
    flight: { progress: 0, boost: null, done: false },
    finale: "arrival", cookie: { strokes: [], done: false, label: null },
    letter: null, letterPending: false, alexa: null,
    entitlements: [], checkout: null, hintsUsed: 0,
    images: new Map(),
  };
}

export function publicState(r: Room): PublicState {
  return {
    code: r.code, chapter: r.chapter, players: r.players, jingle: r.jingle, turn: r.turn,
    wind: Math.round(r.wind), lastShake: r.lastShake,
    key: r.key, doorOpen: r.doorOpen, drawerOpen: r.drawerOpen,
    warmFinds: r.warmFinds, warmNeeded: warmNeeded(r), pieces: r.pieces,
    globe: r.globe, orchestraRound: r.orchestraRound, recordPlaying: r.recordPlaying, dance: r.dance,
    ornaments: r.ornaments, ornamentsNeeded: ornamentsNeeded(r),
    // The right answers stay on the server.
    quiz: { ...r.quiz, questions: r.quiz.questions.map(({ question, options }) => ({ question, options })) },
    starlight: r.starlight, starlightNeeded: STARLIGHT_NEEDED, sparkleDrop: r.sparkleDrop,
    flight: r.flight, finale: r.finale, cookie: r.cookie,
    letter: r.letter, letterPending: r.letterPending, alexa: r.alexa,
    entitlements: r.entitlements, checkout: r.checkout, hintsUsed: r.hintsUsed,
  };
}

const warmNeeded = (r: Room) => Math.min(3, Math.max(1, r.players.length));
const ornamentsNeeded = (r: Room) => Math.min(4, Math.max(1, r.players.length));
const globeNeeded = (r: Room) => Math.min(2, Math.max(1, r.players.length));
const nameOf = (r: Room, id: string) => r.players.find((p) => p.id === id)?.name ?? "someone";

export function say(r: Room, line: string, mood?: JingleMood) {
  r.jingle = { mood: mood ?? r.jingle.mood, line, at: Date.now() };
}

const CHAPTER_MOOD: Partial<Record<ChapterId, JingleMood>> = {
  lobby: "sleep", message: "sleep", wind_jingle: "sleep", warm_jingle: "cold",
};

function enter(r: Room, id: ChapterId) {
  r.chapter = id;
  r.turn = null;
  r.turnDone = [];
  const ch = chapterOf(id);
  r.jingle = { mood: CHAPTER_MOOD[id] ?? "happy", line: ch.jingle ?? "", at: Date.now(), intro: true };
  if (id === "globe") r.globe = { successes: 0, needed: globeNeeded(r), tried: [], gear: null, last: null };
  if (id === "record") r.dance = freshDance();
  if (id === "memory") r.quiz = { index: 0, questions: buildQuiz(r), last: null, done: false };
  if (ch.turns) nextTurn(r);
}

// ---- players and turns ----

export function join(r: Room, name: string, deviceId: string, grownUp = false): Player {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 20);
  if (!clean) throw new GameError("Tell us your name.");
  const device = String(deviceId ?? "").slice(0, 40);
  if (!device) throw new GameError("Scan the code again.");
  const existing = r.players.find((p) => p.name.toLowerCase() === clean.toLowerCase());
  if (existing) {
    if (existing.deviceId !== device) throw new GameError(`Someone called ${existing.name} is already playing. Try a nickname!`);
    return existing;
  }
  if (r.players.length >= MAX_PLAYERS) throw new GameError("The workshop is full (8 players).");
  // The first grown-up to join holds the account; if nobody says so, the first player does.
  const isGrownUp = grownUp && !r.players.some((p) => p.grownUp);
  const p: Player = { id: randomUUID().slice(0, 8), name: clean, color: PLAYER_COLORS[r.players.length % PLAYER_COLORS.length], deviceId: device, grownUp: isGrownUp };
  r.players.push(p);
  if (!r.players.some((x) => x.grownUp)) r.players[0].grownUp = true;
  if (r.chapter === "lobby") say(r, `${p.name} is here!`, "sleep");
  return p;
}

/** A player added by mistake. Only from the lobby, so nobody disappears mid-story. */
export function leave(r: Room, playerId: string, deviceId: string) {
  const p = player(r, playerId);
  if (p.deviceId !== deviceId) throw new GameError("That player is on another phone.", 403);
  if (r.chapter !== "lobby") throw new GameError("Players can only be removed before the adventure starts.");
  r.players = r.players.filter((x) => x.id !== playerId);
  if (r.players.length && !r.players.some((x) => x.grownUp)) r.players[0].grownUp = true;
}

export function player(r: Room, id: string) {
  const p = r.players.find((x) => x.id === id);
  if (!p) throw new GameError("Unknown player. Scan the code again.", 404);
  return p;
}

/** Gives the turn to the next player who hasn't had one in this chapter (round robin). */
function nextTurn(r: Room) {
  if (!r.players.length) { r.turn = null; return; }
  const order = r.players.map((p) => p.id);
  const start = r.turn ? order.indexOf(r.turn.playerId) + 1 : 0;
  let pick: string | undefined;
  for (let i = 0; i < order.length && !pick; i++) {
    const id = order[(start + i) % order.length];
    if (!r.turnDone.includes(id)) pick = id;
  }
  // Everyone has had a go: start another round.
  if (!pick) { r.turnDone = []; pick = order[start % order.length]; }
  r.turn = { playerId: pick, n: (r.turn?.n ?? 0) + 1 };
}

function endTurn(r: Room) {
  if (r.turn && !r.turnDone.includes(r.turn.playerId)) r.turnDone.push(r.turn.playerId);
  nextTurn(r);
}

/** In turn chapters only the player whose turn it is can act. */
function requireTurn(r: Room, playerId: string) {
  if (!chapterOf(r.chapter).turns || !r.turn) return;
  if (r.turn.playerId !== playerId) throw new GameError(`It's ${nameOf(r, r.turn.playerId)}'s turn!`);
}

/** The phone skips a player who is not around (pass the phone to the next one). */
export function skipTurn(r: Room) {
  if (!chapterOf(r.chapter).turns) throw new GameError("Nobody's turn to skip.");
  nextTurn(r);
}

// ---- skipping a puzzle ----

const NOTHING_TO_SKIP: ChapterId[] = ["lobby", "message", "workshop", "finale"];

/** A grown-up skips the current puzzle (a sensor that won't cooperate, a tired family): the story
 * moves on as if it had been solved, with any Star Machine piece it gives. */
export function skipPuzzle(r: Room, playerId: string) {
  const p = player(r, playerId);
  if (r.players.some((x) => x.grownUp) && !p.grownUp) throw new GameError("Ask a grown-up to skip this one.", 403);
  const ch = r.chapter;
  if (NOTHING_TO_SKIP.includes(ch)) throw new GameError("There is no puzzle to skip right now.");
  if (ch === "door_key") r.doorOpen = true;
  if (ch === "drawer") r.drawerOpen = true;
  if (ch === "globe") r.pieces.gear = true;
  if (ch === "record") { r.pieces.song = true; r.recordPlaying = false; }
  if (ch === "memory") { r.pieces.star = true; r.quiz.done = true; }
  if (ch === "flight") r.flight.done = true;
  const next = nextChapter(ch);
  if (next) enter(r, next);
  if (next === "finale") r.finale = "arrival";
  return r.chapter;
}

// ---- the remote ----

/** The remote's OK: moves the story forward where the chapter allows it. */
export function advance(r: Room) {
  const ch = chapterOf(r.chapter);
  if (!ch.remoteAdvances) throw new GameError("This chapter moves on when the puzzle is solved.");
  if (r.chapter === "lobby" && r.players.length === 0) throw new GameError("Scan the code with a phone to join first.");
  const next = nextChapter(r.chapter);
  if (next) enter(r, next);
  return r.chapter;
}

/** Offline development only (GW_MOCK=1): jumps straight to a chapter to check its screen. */
export function devGoto(r: Room, id: ChapterId) {
  chapterOf(id);
  enter(r, id);
  return r.chapter;
}

// ---- shaking: one endpoint, what it does depends on the chapter ----

/** A burst of shake energy (0..1) from a phone. */
export function shake(r: Room, playerId: string, energy: number) {
  player(r, playerId);
  const e = Math.max(0, Math.min(1, energy));
  const now = Date.now();
  r.lastShake = { playerId, at: now };
  switch (r.chapter) {
    case "wind_jingle":
      // A single player needs ~25 good shakes; more players fill it faster.
      r.wind = Math.min(100, r.wind + e * 4);
      if (r.wind >= 100) {
        say(r, "Whoa! Who wound me up?", "cold");
        enter(r, "warm_jingle");
      }
      break;
    case "record":
      if (r.dance.phase === "music") r.dance.groove = Math.min(1, r.dance.groove * 0.7 + e * 0.6);
      // A little grace after the music stops, for the network and for slow reactions.
      if (r.dance.phase === "freeze" && e > 0.3 && now > r.dance.until - FREEZE_MS + FREEZE_GRACE_MS) caughtMoving(r, nameOf(r, playerId));
      break;
    case "starlight":
      if (r.starlight < STARLIGHT_NEEDED) r.sparkleDrop = { playerId, n: Math.max(1, Math.round(e * 3)), at: now };
      break;
    case "flight":
      if (!r.flight.done && e > 0.25) r.flight.boost = { playerId, at: now };
      break;
  }
}

// ---- scans ----

export function scanAllowed(r: Room, kind: ScanKind, playerId?: string) {
  const ok = (kind === "key" && r.chapter === "door_key" && !r.key)
    || (kind === "warm" && r.chapter === "warm_jingle")
    || (kind === "ornament" && r.chapter === "ornaments")
    || (kind === "cookie" && r.chapter === "finale" && !r.cookie.label);
  if (!ok) throw new GameError("Jingle is not looking for that right now.");
  if (playerId && kind !== "cookie") requireTurn(r, playerId);
}

export function storeImage(r: Room, bytes: Buffer, mime: string) {
  const id = randomUUID().slice(0, 12);
  r.images.set(id, { mime, bytes });
  return id;
}

export function acceptFind(r: Room, playerId: string, kind: ScanKind, label: string, imageId: string, jingleLine: string): Find {
  player(r, playerId);
  const find: Find = { id: imageId, playerId, kind, label, imageUrl: `/api/rooms/${r.code}/images/${imageId}` };
  if (kind === "key") {
    r.key = find;
    say(r, `${jingleLine} Now carry it to the lock with the remote!`, "happy");
  } else if (kind === "warm") {
    r.warmFinds.push(find);
    say(r, `${jingleLine} Pick it on the TV and give it to me!`, "cold");
    if (r.warmFinds.length < warmNeeded(r)) endTurn(r); else r.turn = null;
  } else if (kind === "ornament") {
    r.ornaments.push(find);
    say(r, `${jingleLine} It's in the tray: hang it on the tree with the remote!`, "happy");
    if (r.ornaments.length < ornamentsNeeded(r)) endTurn(r); else r.turn = null;
  } else {
    r.cookie.label = label;
  }
  return find;
}

// ---- garden: warming Jingle ----

const WARM_THANKS = [
  "Mmm, toasty! My left wing can move again!",
  "Oooh, lovely. My springs are waking up!",
  "So cosy! I can feel my tail feathers!",
];

/** A warm thing, carried on the TV, is given to Jingle. Returns true when he is warm. */
export function giveWarm(r: Room, findId: string) {
  if (r.chapter !== "warm_jingle") throw new GameError("Jingle is not cold right now.");
  const f = r.warmFinds.find((x) => x.id === findId);
  if (!f) throw new GameError("Jingle cannot find that one.", 404);
  if (f.given) return false;
  f.given = true;
  const given = r.warmFinds.filter((x) => x.given).length;
  if (given >= warmNeeded(r)) {
    say(r, "Ahhh, that's better! I'm all warm. Now, to the workshop door!", "happy");
    return true;
  }
  say(r, `${WARM_THANKS[(given - 1) % WARM_THANKS.length]} I'm still a bit cold...`, "cold");
  return false;
}

const isWarm = (r: Room) => r.entitlements.includes("jingle_scarf") || r.warmFinds.filter((x) => x.given).length >= warmNeeded(r);

export function afterWarm(r: Room) {
  if (r.chapter === "warm_jingle" && isWarm(r)) enter(r, "door_key");
}

// ---- the door ----

export function unlockDoor(r: Room) {
  if (r.chapter !== "door_key" || !r.key) throw new GameError("There is no key to turn yet.");
  if (r.doorOpen) return false;
  r.doorOpen = true;
  say(r, "Click, clack... it turns! It really believed in itself!", "happy");
  return true;
}

export function afterDoor(r: Room) {
  if (r.chapter === "door_key" && r.doorOpen) enter(r, "workshop");
}

// ---- piece one: the drawer and the gear in the snow globe ----

export function tryDrawer(r: Room, code: string) {
  if (r.chapter !== "drawer") throw new GameError("There is no lock to open right now.");
  if (code === DRAWER_CODE) {
    r.drawerOpen = true;
    enter(r, "globe");
    return true;
  }
  r.drawerTries++;
  say(r, r.drawerTries >= 3
    ? "Not that one. Psst: the back of your key shows four toys. Read their numbers in that order!"
    : "Click, clack... nope. Try another number!", "awake");
  return false;
}

/** Live gear position from the phone whose turn it is, so the big globe on the TV follows it. */
export function globeGear(r: Room, playerId: string, x: number, y: number, hold: number) {
  if (r.chapter !== "globe" || r.turn?.playerId !== playerId) return;
  const c = (v: number) => Math.max(-1, Math.min(1, Number(v) || 0));
  r.globe.gear = { x: c(x), y: c(y), hold: Math.max(0, Math.min(1, Number(hold) || 0)), at: Date.now() };
}

/** One player's attempt is over. Returns true when the gear is out. n is the turn the attempt was
 * made in: the phone retries when the network drops, and a repeat of a counted attempt is ignored. */
export function globeResult(r: Room, playerId: string, ok: boolean, n?: number) {
  if (r.chapter !== "globe") return false; // a late retry after the story moved on
  if (n !== undefined && r.turn?.n !== n) return false;
  requireTurn(r, playerId);
  const name = nameOf(r, playerId);
  r.globe.last = { playerId, ok, at: Date.now() };
  r.globe.gear = null;
  if (!r.globe.tried.includes(playerId)) r.globe.tried.push(playerId);
  if (ok) r.globe.successes++;
  if (r.globe.successes >= r.globe.needed) {
    r.pieces.gear = true;
    r.turn = null;
    say(r, `Steady as a rock, ${name}! The heart gear is out! That's piece number one!`, "happy");
    return true;
  }
  if (ok) say(r, `Wonderful, ${name}! The gear is settling. ${r.globe.needed - r.globe.successes === 1 ? "One more steady hand!" : "Keep going!"}`, "happy");
  else say(r, r.players.length > 1 ? `Wobbly! Never mind, ${name}. Pass the phone!` : `Wobbly! Try again, ${name}, nice and slow.`, "awake");
  endTurn(r);
  return false;
}

export function afterGlobe(r: Room) {
  if (r.chapter === "globe" && r.pieces.gear) enter(r, "orchestra");
}

// ---- piece two: the toy orchestra, the record and statues ----

export function orchestraDone(r: Room, round: number) {
  if (r.chapter !== "orchestra") throw new GameError("The toys are not playing right now.");
  if (!Number.isInteger(round) || round !== r.orchestraRound + 1) return false;
  r.orchestraRound = round;
  if (round >= ORCHESTRA_ROUNDS) {
    say(r, "Bravo! And listen... the gramophone in the next room recorded every note!", "happy");
    return true;
  }
  say(r, ["Perfect! Now a longer one...", "Wonderful! The last tune is the trickiest!"][round - 1] ?? "Well done!", "happy");
  return false;
}

export function afterOrchestra(r: Room) {
  if (r.chapter === "orchestra" && r.orchestraRound >= ORCHESTRA_ROUNDS) enter(r, "record");
}

/** Jingle puts the new record on the gramophone: Grandpa's voice, then the dance. */
export function playRecord(r: Room) {
  if (r.chapter !== "record") throw new GameError("There is no record to play right now.");
  if (r.recordPlaying) return false;
  r.recordPlaying = true;
  return true;
}

/** Grandpa's message on the record is over: the toys want to dance. */
export function startDance(r: Room) {
  if (r.chapter !== "record" || r.dance.phase !== "intro") return;
  say(r, "The toys want to dance! Dance with your phones, and when the music stops... freeze! Me too!", "happy");
  r.dance = { ...r.dance, phase: "intro", until: Date.now() + DANCE_INTRO_MS };
}

const DANCE_INTRO_MS = 10000; // Jingle explains first, then the countdown: never music over his voice
const FREEZE_MS = 3500;
const FREEZE_GRACE_MS = 900;
const CAUGHT_MS = 3500;

function caughtMoving(r: Room, who: string) {
  r.dance = { ...r.dance, phase: "caught", caught: who, until: Date.now() + CAUGHT_MS };
  r.danceCaught[who] = (r.danceCaught[who] ?? 0) + 1;
  say(r, who === "Jingle" ? "Oops, that was me! I wobbled! Again!" : `I saw you wiggle, ${who}! Again!`, "happy");
}

/** The remote moved Jingle while everyone was frozen. */
export function danceMove(r: Room) {
  if (r.chapter === "record" && r.dance.phase === "freeze" && Date.now() > r.dance.until - FREEZE_MS + FREEZE_GRACE_MS) caughtMoving(r, "Jingle");
}

/**
 * Advances the timed phases (statues). Called a few times a second. Returns "changed" when the
 * state moved on, "song" when statues just finished (the room layer moves on after a pause).
 */
export function tick(r: Room, now = Date.now()): "changed" | "song" | null {
  if (r.chapter !== "record" || !r.dance.until || now < r.dance.until) return null;
  const d = r.dance;
  if (d.phase === "intro" || d.phase === "caught") {
    r.dance = { ...d, phase: "music", caught: null, groove: 0, until: now + 5000 + Math.random() * 4500 };
  } else if (d.phase === "music") {
    r.dance = { ...d, phase: "freeze", until: now + FREEZE_MS };
  } else if (d.phase === "freeze") {
    const round = d.round + 1;
    if (round >= d.rounds) {
      r.dance = { ...d, round, phase: "done", until: 0 };
      r.pieces.song = true;
      say(r, "What dancers! The toys are bowing. Grandpa's song is ours: that's piece number two!", "happy");
      return "song";
    } else {
      r.dance = { ...d, round, phase: "music", groove: 0, until: now + 5000 + Math.random() * 4500 };
      say(r, round === d.rounds - 1 ? "Perfect statues! One more time!" : "Perfect statues! Again!", "happy");
    }
  }
  return "changed";
}

export function afterRecord(r: Room) {
  if (r.chapter === "record" && r.pieces.song) enter(r, "ornaments");
}

// ---- the tree ----

export function hangOrnament(r: Room, findId: string, hook: number) {
  if (r.chapter !== "ornaments") throw new GameError("The tree is not ready yet.");
  const o = r.ornaments.find((x) => x.id === findId);
  if (!o) throw new GameError("That ornament is not here.", 404);
  if (!Number.isInteger(hook) || hook < 0 || hook > 40) throw new GameError("No hook there.");
  if (r.ornaments.some((x) => x.hook === hook && x.id !== findId)) throw new GameError("That hook is taken.");
  o.hook = hook;
  const hung = r.ornaments.filter((x) => x.hook !== undefined).length;
  const name = nameOf(r, o.playerId);
  if (hung >= ornamentsNeeded(r) && r.ornaments.every((x) => x.hook !== undefined)) {
    say(r, "The tree looks magnificent! Now, Grandpa's box on the workbench...", "happy");
    return true;
  }
  say(r, `${name}'s ornament looks wonderful up there!`, "happy");
  return false;
}

export function afterOrnaments(r: Room) {
  if (r.chapter === "ornaments" && r.ornaments.length >= ornamentsNeeded(r) && r.ornaments.every((x) => x.hook !== undefined)) enter(r, "memory");
}

// ---- piece three: the memory lock ----

const DECOY_WARM = ["an ice cube", "a frozen fish", "a snowball", "a bag of frozen peas"];
const DECOY_KEY = ["a key made of ice", "a golden spoon", "a candy cane"];

function shuffle<T>(xs: T[]) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = randomBytes(1)[0] % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function mc(question: string, right: string, wrong: string[]): QuizQuestion {
  const options = shuffle([right, ...shuffle(wrong.filter((w) => w.toLowerCase() !== right.toLowerCase())).slice(0, 2)]);
  return { question, options, answer: options.indexOf(right) };
}

/** Three questions about this family's night, built from what actually happened. */
function buildQuiz(r: Room): QuizQuestion[] {
  const qs: QuizQuestion[] = [];
  const names = r.players.map((p) => p.name);
  const warm = r.warmFinds[0];
  if (warm) qs.push(mc(`What did ${nameOf(r, warm.playerId)} bring to warm Jingle up?`, warm.label, DECOY_WARM));
  qs.push(mc("Which toy was hiding the number 4?", "The drum", ["The train", "The elephant"]));
  if (names.length >= 2 && r.key) {
    qs.push(mc("Who drew the key that opened Grandpa's door?", nameOf(r, r.key.playerId), names.filter((n) => n !== nameOf(r, r.key!.playerId)).concat(["Jingle"])));
  } else if (r.key) {
    qs.push(mc("What did your key look like?", r.key.label, DECOY_KEY));
  }
  const firstGlobe = r.players.find((p) => p.id === r.globe.last?.playerId);
  if (qs.length < 3 && firstGlobe) qs.push(mc("Who got the heart gear out of the snow globe?", firstGlobe.name, ["Jingle", "Grandpa", ...names.filter((n) => n !== firstGlobe.name)]));
  if (qs.length < 3) qs.push(mc("How many tunes did the toy orchestra play?", "three", ["one", "seven"]));
  return qs.slice(0, 3);
}

/** The current question, for Alexa to read. */
export function currentQuestion(r: Room) {
  if (r.chapter !== "memory" || r.quiz.done) return null;
  const q = r.quiz.questions[r.quiz.index];
  return q ? { number: r.quiz.index + 1, of: r.quiz.questions.length, question: q.question, options: q.options } : null;
}

/** An answer, by option index (the remote) or by words (Alexa). Returns whether it was right. */
export function answerQuiz(r: Room, pick: number | string) {
  if (r.chapter !== "memory" || r.quiz.done) throw new GameError("There is no question right now.");
  const q = r.quiz.questions[r.quiz.index];
  let picked = typeof pick === "number" ? pick : -1;
  if (typeof pick === "string") {
    const said = pick.toLowerCase().replace(/[^a-z0-9 ]/g, " ");
    const digits = said.replace(/\D/g, "");
    // "A", "option b", "the third one"...
    const letter = said.trim().match(/^(?:option |answer |letter )?([abc])$/)?.[1];
    const ordinal = ["first", "second", "third"].findIndex((w) => said.includes(w));
    if (letter) picked = "abc".indexOf(letter);
    else if (ordinal >= 0 && !q.options.some((o) => o.toLowerCase().includes(["first", "second", "third"][ordinal]))) picked = ordinal;
    else picked = q.options.findIndex((o) => {
      const opt = o.toLowerCase();
      return said.includes(opt) || (digits.length >= 4 && opt.replace(/\D/g, "") === digits)
        || opt.split(" ").filter((w) => w.length > 3).some((w) => said.includes(w));
    });
  }
  if (picked < 0 || picked >= q.options.length) throw new GameError("That's not one of the answers.");
  const right = picked === q.answer;
  r.quiz.last = { index: r.quiz.index, picked, right, at: Date.now() };
  if (!right) {
    say(r, "Hmm, not quite. Think back... what really happened?", "awake");
    return { right, done: false };
  }
  r.quiz.index++;
  if (r.quiz.index >= r.quiz.questions.length) {
    r.quiz.done = true;
    r.pieces.star = true;
    say(r, "Click! The box is open! There's Grandpa's star!", "happy");
    return { right, done: true };
  }
  say(r, "That's right!", "happy");
  return { right, done: false };
}

export function afterMemory(r: Room) {
  if (r.chapter === "memory" && r.quiz.done) enter(r, "starlight");
}

// ---- starlight and the flight ----

/** Jingle caught a sparkle on the TV. Returns true when the star is full. */
export function catchSparkle(r: Room) {
  if (r.chapter !== "starlight" || r.starlight >= STARLIGHT_NEEDED) return false;
  r.starlight++;
  if (r.starlight === Math.round(STARLIGHT_NEEDED / 2)) say(r, "Halfway! The star is starting to glow!", "happy");
  if (r.starlight >= STARLIGHT_NEEDED) { say(r, "The star is shining! Now, up to the roof!", "happy"); return true; }
  return false;
}

export function afterStarlight(r: Room) {
  if (r.chapter === "starlight" && r.starlight >= STARLIGHT_NEEDED) enter(r, "flight");
}

/** The TV reports how far Jingle has flown. 1 means he reached the roof peak. */
export function flightProgress(r: Room, progress: number) {
  if (r.chapter !== "flight" || r.flight.done) return false;
  r.flight.progress = Math.max(r.flight.progress, Math.max(0, Math.min(1, Number(progress) || 0)));
  if (r.flight.progress >= 1) {
    r.flight.done = true;
    say(r, "We made it! The star is on the roof!", "happy");
    return true;
  }
  return false;
}

export function afterFlight(r: Room) {
  if (r.chapter === "flight" && r.flight.done) { enter(r, "finale"); r.finale = "arrival"; }
}

// ---- the finale: Grandpa comes home, the gingerbread, the letter ----

export function setFinale(r: Room, phase: FinalePhase) {
  if (r.chapter !== "finale") throw new GameError("The story is not over yet.");
  r.finale = phase;
  if (phase === "cookie") say(r, "Grandpa is almost here! Let's decorate a gingerbread for him!", "happy");
}

export function addStroke(r: Room, playerId: string, stroke: Omit<IcingStroke, "playerId">) {
  player(r, playerId);
  if (r.chapter !== "finale" || r.finale !== "cookie" || r.cookie.done) return;
  const points = (Array.isArray(stroke.points) ? stroke.points : []).slice(0, 240)
    .map(([x, y]) => [Math.max(0, Math.min(1, Number(x) || 0)), Math.max(0, Math.min(1, Number(y) || 0))] as [number, number]);
  if (!points.length) return;
  const id = String(stroke.id ?? "").slice(0, 24) || randomUUID().slice(0, 8);
  const color = /^#[0-9a-f]{6}$/i.test(String(stroke.color)) ? stroke.color : "#ffffff";
  const width = Math.max(0.004, Math.min(0.05, Number(stroke.width) || 0.015));
  // A stroke arrives in pieces while the finger moves: same id extends it.
  const existing = r.cookie.strokes.find((s) => s.id === id && s.playerId === playerId);
  if (existing) existing.points = existing.points.concat(points).slice(0, 600);
  else r.cookie.strokes.push({ id, playerId, color, width, points });
  if (r.cookie.strokes.length > MAX_STROKES) r.cookie.strokes.splice(0, r.cookie.strokes.length - MAX_STROKES);
}

export function clearStrokes(r: Room, playerId: string) {
  player(r, playerId);
  if (r.cookie.done) return;
  r.cookie.strokes = r.cookie.strokes.filter((s) => s.playerId !== playerId);
}

/** The gingerbread is given to Grandpa: the letter can be written. Returns false if already done. */
export function finishCookie(r: Room) {
  if (r.chapter !== "finale" || r.finale !== "cookie") throw new GameError("The gingerbread is not out yet.");
  if (r.cookie.done) return false;
  r.cookie.done = true;
  r.finale = "letter";
  r.letterPending = true;
  say(r, "Grandpa is reading something... I think he's writing you a letter!", "happy");
  return true;
}

export function setLetter(r: Room, text: string) {
  r.letter = text;
  r.letterPending = false;
}

// ---- Alexa ----

export function setAlexa(r: Room, text: string, card?: AlexaCard) {
  r.alexa = { text, at: Date.now(), card };
}

/** A hint for the current chapter. Hints are always free: nobody pays to get unstuck. */
export function hint(r: Room) {
  const ch = chapterOf(r.chapter);
  r.hintsUsed++;
  return { chapter: ch.title, hint: ch.hint };
}

// ---- purchases (simulated: no money moves) ----

const money = (n: number) => `$${n.toFixed(2)}`;

function offerOf(id: ProductId) {
  const p = PRODUCTS[id];
  return { productId: p.id, title: p.title, pitch: p.pitch, priceSpoken: `${p.priceSpoken} plus tax`, owned: false };
}

export function products(r: Room) {
  return Object.values(PRODUCTS).map((p) => ({ ...offerOf(p.id), owned: r.entitlements.includes(p.id), price: money(p.price) }));
}

export function checkoutCard(r: Room): AlexaCard | undefined {
  const c = r.checkout;
  if (!c) return undefined;
  const p = PRODUCTS[c.productId];
  if (c.status === "completed") {
    return { type: "receipt", checkoutId: c.id, title: "Order confirmed", body: `${p.title} is ready for your family. A receipt was sent to ${grownUp(r)?.name ?? "the account holder"}'s phone.`, receiptId: c.receiptId! };
  }
  return {
    type: "checkout", checkoutId: c.id, productId: p.id, title: p.title, status: c.status,
    lines: [{ label: p.title, amount: money(p.price) }, { label: "Estimated tax", amount: money(p.tax) }],
    total: money(p.price + p.tax), payment: "Visa ending in 0000 (simulated)",
  };
}

const grownUp = (r: Room) => r.players.find((p) => p.grownUp) ?? r.players[0];

/** Alexa offers a product (the offer card). Nothing is charged. */
export function offer(r: Room, productId: ProductId) {
  if (!PRODUCTS[productId]) throw new GameError("Unknown product.");
  if (r.entitlements.includes(productId)) return { alreadyOwned: true, ...offerOf(productId) };
  r.checkout = { id: randomUUID().slice(0, 8), productId, channel: "alexa", status: "offered", requestedBy: null, total: PRODUCTS[productId].price + PRODUCTS[productId].tax, receiptId: null, at: Date.now() };
  return { alreadyOwned: false, ...offerOf(productId) };
}

/** Starts the checkout: shows the full price breakdown and asks for confirmation. */
export function startCheckout(r: Room, productId: ProductId, channel: Checkout["channel"] = "alexa") {
  const p = PRODUCTS[productId];
  if (!p) throw new GameError("Unknown product.");
  if (r.entitlements.includes(productId)) return { status: "already_owned" as const, title: p.title };
  const sameOffer = r.checkout && r.checkout.productId === productId && !["completed", "declined", "failed"].includes(r.checkout.status);
  r.checkout = {
    id: sameOffer ? r.checkout!.id : randomUUID().slice(0, 8), productId, channel, status: "awaiting_confirmation",
    requestedBy: null, total: p.price + p.tax, receiptId: null, at: Date.now(),
  };
  return { status: "awaiting_confirmation" as const, checkoutId: r.checkout.id, title: p.title, price: money(p.price), tax: money(p.tax), total: money(p.price + p.tax), priceSpoken: `${p.priceSpoken} plus tax` };
}

/**
 * The customer said yes (or no). Purchases made by voice always go to the account holder's phone
 * for approval, like Amazon's purchase approvals for households with kids.
 */
export function confirmCheckout(r: Room, checkoutId: string, yes: boolean) {
  const c = r.checkout;
  if (!c || c.id !== checkoutId) throw new GameError("That purchase has expired. Ask again to start over.", 404);
  if (c.status !== "awaiting_confirmation") return { status: c.status };
  if (!yes) { c.status = "declined"; return { status: c.status }; }
  c.status = "awaiting_grown_up";
  c.requestedBy = null;
  c.at = Date.now();
  return { status: c.status, approver: grownUp(r)?.name ?? "the account holder" };
}

/** The account holder approves or declines on their phone. */
export function approveCheckout(r: Room, checkoutId: string, playerId: string, yes: boolean) {
  const c = r.checkout;
  if (!c || c.id !== checkoutId) throw new GameError("That purchase has expired.", 404);
  const p = player(r, playerId);
  if (!p.grownUp) throw new GameError("Only the grown-up who holds the account can approve purchases.", 403);
  if (c.status !== "awaiting_grown_up") return { status: c.status };
  if (!yes) { c.status = "declined"; return { status: c.status }; }
  return completePurchase(r, c.productId, "alexa");
}

/** A completed purchase: from the Alexa flow, or from the Fire TV Appstore (Vega In-App Purchasing). */
export function completePurchase(r: Room, productId: ProductId, channel: Checkout["channel"], receiptId?: string) {
  const p = PRODUCTS[productId];
  if (!p) throw new GameError("Unknown product.");
  const isNew = !r.entitlements.includes(productId);
  if (isNew) r.entitlements.push(productId);
  // The scarf is the other way through the cold chapter: Jingle is warm at once.
  const warmed = isNew && productId === "jingle_scarf" && r.chapter === "warm_jingle";
  if (warmed) say(r, "A scarf! And it's green, my favourite. Ahhh, I'm toasty from beak to tail! Now, to the workshop door!", "happy");
  const id = r.checkout?.productId === productId ? r.checkout.id : randomUUID().slice(0, 8);
  r.checkout = {
    id, productId, channel, status: "completed", requestedBy: null, total: p.price + p.tax,
    receiptId: (receiptId ?? `GW-${randomBytes(3).toString("hex").toUpperCase()}`).slice(0, 64), at: Date.now(),
  };
  return { status: "completed" as const, receiptId: r.checkout.receiptId, title: p.title, warmed };
}

export function purchaseStatus(r: Room) {
  return {
    owned: r.entitlements.map((id) => PRODUCTS[id].title),
    checkout: r.checkout && { id: r.checkout.id, product: PRODUCTS[r.checkout.productId].title, status: r.checkout.status, channel: r.checkout.channel, receiptId: r.checkout.receiptId },
  };
}

// ---- memories ----

/** Everything the family did, for Grandpa's final letter and for Alexa. */
export function memories(r: Room) {
  const name = (id: string) => nameOf(r, id);
  return {
    players: r.players.map((p) => p.name),
    warmThings: r.warmFinds.map((f) => ({ by: name(f.playerId), thing: f.label })),
    key: r.key ? { by: name(r.key.playerId), looked: r.key.label } : null,
    snowGlobeSteadyHands: r.players.filter((p) => r.globe.tried.includes(p.id)).map((p) => p.name),
    caughtWigglingInStatues: r.danceCaught,
    ornaments: r.ornaments.map((o) => ({ by: name(o.playerId), looked: o.label })),
    starlightCaught: r.starlight,
    gingerbread: r.cookie.label,
  };
}

/** For the MCP server: where the family is in the story. */
export function storyStatus(r: Room) {
  const ch = chapterOf(r.chapter);
  return {
    room: r.code,
    chapter: { id: ch.id, number: chapterNumber(r.chapter), of: CHAPTER_COUNT, title: ch.title },
    whatIsHappening: ch.narration || (r.chapter === "lobby" ? "The family is joining on their phones." : "Grandpa's message is playing on the TV."),
    whatToDoNow: ch.phoneTask || "Follow the TV.",
    whoseTurn: r.turn ? nameOf(r, r.turn.playerId) : null,
    players: r.players.map((p) => ({ name: p.name, grownUp: p.grownUp })),
    starMachinePieces: { heartGear: r.pieces.gear, grandpasSong: r.pieces.song, star: r.pieces.star },
    lastSaved: new Date(r.updatedAt).toISOString(),
    memoriesSoFar: memories(r),
    chapters: CHAPTERS.slice(2).map((c) => c.title),
  };
}
