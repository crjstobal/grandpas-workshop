// Types shared by the server, the TV view and the phone view.

export type ChapterId =
  | "lobby"
  | "message"
  | "wind_jingle"
  | "warm_jingle"
  | "door_key"
  | "workshop"
  | "drawer"
  | "globe"
  | "orchestra"
  | "record"
  | "ornaments"
  | "memory"
  | "starlight"
  | "flight"
  | "finale";

export type ScanKind = "key" | "warm" | "ornament" | "cookie";

export interface Player {
  id: string;
  name: string;
  color: string;
  /** The phone this player plays on. Several players can share one phone (kids rarely have their own). */
  deviceId: string;
  /** The account holder: the grown-up who approves purchases. */
  grownUp: boolean;
}

/** Something a player scanned with their phone and the judge accepted. */
export interface Find {
  id: string;
  playerId: string;
  kind: ScanKind;
  /** What the judge saw, in a few words ("a striped wool sock"). */
  label: string;
  /** Served at /api/rooms/:code/images/:id */
  imageUrl: string;
  /** Warm things: handed to Jingle on the TV. */
  given?: boolean;
  /** Ornaments: which hook of the tree it hangs on (index into the TV's hook list). */
  hook?: number;
}

export type JingleMood = "sleep" | "awake" | "cold" | "happy";

/** Whose turn it is, in the chapters that go around the family one player at a time. */
export interface Turn {
  playerId: string;
  /** Increments on every new turn, so screens can tell two turns of the same player apart. */
  n: number;
}

/** The snow globe balance challenge: each player tilts the phone to keep the gear in the middle. */
export interface GlobeState {
  successes: number;
  needed: number;
  /** Who has had a go already (a new round starts when everyone has). */
  tried: string[];
  /** Live position of the gear from the phone that is playing, -1..1 on both axes. */
  gear: { x: number; y: number; hold: number; at: number } | null;
  /** The last finished attempt, for the TV to celebrate or console. */
  last: { playerId: string; ok: boolean; at: number } | null;
}

/** Statues: dance while the gramophone plays, freeze when it stops. */
export interface DanceState {
  phase: "intro" | "music" | "freeze" | "caught" | "done";
  round: number;
  rounds: number;
  /** When the current phase ends (server clock, ms). */
  until: number;
  /** Who moved during the freeze (a player name, or "Jingle" when the remote moved him). */
  caught: string | null;
  /** Dance energy from the phones while the music plays, for the TV to bounce the toys. */
  groove: number;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  /** Index of the right option. Not sent to the phones or the TV until answered. */
  answer?: number;
}

/** Grandpa's memory lock on the star box: Alexa asks about the night, the family answers. */
export interface QuizState {
  index: number;
  questions: QuizQuestion[];
  /** The last answer given, for feedback on the TV. */
  last: { index: number; picked: number; right: boolean; at: number } | null;
  done: boolean;
}

/** Jingle's flight over the rooftops with the star. */
export interface FlightState {
  /** 0..1 of the way to the roof peak, reported by the TV. */
  progress: number;
  /** Warm-wind boosts shaken loose by the phones. */
  boost: { playerId: string; at: number } | null;
  done: boolean;
}

/** One finger stroke of icing on the gingerbread, points normalized to 0..1. */
export interface IcingStroke {
  id: string;
  playerId: string;
  color: string;
  width: number;
  points: [number, number][];
}

export type FinalePhase = "arrival" | "cookie" | "letter" | "store";

export type ProductId = "snowed_in_sleigh" | "jingle_scarf";

export interface Product {
  id: ProductId;
  title: string;
  /** One line on what it adds. */
  pitch: string;
  /** Spoken price, ISP style: "two dollars and ninety-nine cents". */
  priceSpoken: string;
  price: number;
  /** Estimated tax for the simulated checkout breakdown. */
  tax: number;
  /** story: a new adventure; extra: something cosmetic for tonight's game. */
  kind: "story" | "extra";
}

/** A purchase in progress, Alexa+ checkout style: offer, breakdown, approval, receipt. */
export interface Checkout {
  id: string;
  productId: ProductId;
  /** Where the purchase was started: Alexa (voice, simulated) or the Fire TV Appstore (Vega IAP). */
  channel: "alexa" | "appstore";
  status: "offered" | "awaiting_confirmation" | "awaiting_grown_up" | "completed" | "declined" | "failed";
  requestedBy: string | null;
  total: number;
  receiptId: string | null;
  at: number;
}

/** What everyone in the room sees. Sent to the TV and the phones over SSE after every change. */
export interface PublicState {
  /** Last change (ms epoch): a TV reopening long after a finished game starts a new one. */
  updatedAt: number;
  code: string;
  chapter: ChapterId;
  players: Player[];
  /** Jingle's latest line. intro: his chapter opening line, which the TV reads right after the narrator. */
  jingle: { mood: JingleMood; line: string; at: number; intro?: boolean };
  turn: Turn | null;
  /** 0..100, chapter wind_jingle */
  wind: number;
  /** Who shook last, so the TV can react to each phone. */
  lastShake: { playerId: string; at: number } | null;
  key: Find | null;
  doorOpen: boolean;
  drawerOpen: boolean;
  warmFinds: Find[];
  warmNeeded: number;
  /** The three pieces of the Star Machine. */
  pieces: { gear: boolean; song: boolean; star: boolean };
  globe: GlobeState;
  orchestraRound: number;
  recordPlaying: boolean;
  dance: DanceState;
  ornaments: Find[];
  ornamentsNeeded: number;
  quiz: QuizState;
  /** Sparkles of starlight Jingle has caught for the star. */
  starlight: number;
  starlightNeeded: number;
  /** A phone shook some starlight loose: the TV drops this many sparkles. */
  sparkleDrop: { playerId: string; n: number; at: number } | null;
  flight: FlightState;
  finale: FinalePhase;
  cookie: { strokes: IcingStroke[]; done: boolean; label: string | null };
  letter: string | null;
  letterPending: boolean;
  /** Last thing Alexa said, so the TV can show it while she talks. */
  alexa: { text: string; at: number; card?: AlexaCard } | null;
  entitlements: ProductId[];
  checkout: Checkout | null;
  /** Hints Alexa gave tonight (they are always free). */
  hintsUsed: number;
}

/** A rich card Alexa shows with what she says (Alexa+ visual patterns: card, list, checkout). */
export type AlexaCard =
  | { type: "message"; from: string; title: string; body: string }
  | { type: "hint"; title: string; body: string }
  | { type: "question"; title: string; question: string; options: string[] }
  | { type: "offer"; productId: ProductId; title: string; body: string; cta: string }
  | { type: "checkout"; checkoutId: string; productId: ProductId; title: string; lines: { label: string; amount: string }[]; total: string; payment: string; status: Checkout["status"] }
  | { type: "receipt"; checkoutId: string; title: string; body: string; receiptId: string };

export interface ScanResult {
  accepted: boolean;
  label: string;
  jingleLine: string;
  find?: Find;
}

export interface AlexaTurn {
  role: "user" | "assistant";
  text: string;
}
