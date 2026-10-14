// "More from Grandpa's Workshop": the Fire TV store screen after Grandpa's letter.
// A hero tile for the next adventure, a row with the Hint Book and the stories coming soon.
// D-pad moves the focus (up/down between rows, left/right along a row), OK buys.
// Purchases go through the Fire TV shell (Amazon In-App Purchasing) or, in a desktop browser,
// through the simulated Appstore dialog.
import { useEffect, useRef, useState } from "react";
import type { ProductId, PublicState } from "../../../shared/types";
import { COMING_SOON, PRODUCTS } from "../../../shared/story";
import { api } from "../api";
import { buy, hasAppstore } from "../store";
import { sfx } from "../sfx";
import { AppstoreDialogHost, usePurchaseDialogOpen } from "./AppstoreDialog";
import { pressOk, useRemote } from "./remote";
import "./store.css";

type TileId = ProductId | `soon-${number}`;
interface Toast { kind: "busy" | "ok" | "info"; text: string; at: number }

const ROW: TileId[] = ["hint_book", ...COMING_SOON.map((_, i) => `soon-${i}` as TileId)];
const price = (id: ProductId) => `$${PRODUCTS[id].price.toFixed(2)}`;

export function Store({ state }: { state: PublicState }) {
  const [row, setRow] = useState(0);
  const [col, setCol] = useState(0);
  const [busy, setBusy] = useState<ProductId | null>(null);
  const [justBought, setJustBought] = useState<ProductId[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const dialogOpen = usePurchaseDialogOpen();
  const refs = useRef(new Map<TileId, HTMLButtonElement>());

  const owned = (id: ProductId) => state.entitlements.includes(id) || justBought.includes(id);
  const focused: TileId = row === 0 ? "snowed_in_sleigh" : ROW[col];

  // Keep the real DOM focus on the focused tile (and give it back when the dialog closes).
  useEffect(() => {
    if (!dialogOpen) refs.current.get(focused)?.focus({ preventScroll: true });
  }, [focused, dialogOpen]);

  useEffect(() => {
    if (!toast || toast.kind === "busy") return;
    const t = setTimeout(() => setToast((x) => (x?.at === toast.at ? null : x)), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const say = (kind: Toast["kind"], text: string) => setToast({ kind, text, at: Date.now() });

  const purchase = async (id: ProductId) => {
    if (busy) return;
    const p = PRODUCTS[id];
    if (owned(id)) { sfx.chime(); say("info", `${p.title} is already yours.`); return; }
    setBusy(id);
    say("busy", hasAppstore() ? "Opening the Amazon Appstore..." : "Opening the Appstore preview...");
    try {
      const r = await buy(id);
      if (r.ok) {
        await api.appstorePurchase(state.code, id, r.receiptId);
        setJustBought((x) => (x.includes(id) ? x : [...x, id]));
        sfx.chime(); sfx.sparkle();
        say("ok", r.status === "ALREADY_PURCHASED" ? `${p.title} was already yours. It's unlocked again.` : `Thank you! ${p.title} is unlocked.`);
      } else {
        sfx.boing();
        say("info", r.status === "NOT_SUPPORTED" ? "Purchases aren't available on this device."
          : r.status === "INVALID_SKU" ? "That item isn't in the Appstore yet."
          : "Purchase cancelled. Nothing was charged.");
      }
    } catch {
      sfx.boing();
      say("info", "The workshop couldn't save that purchase. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const activate = (id: TileId) => {
    if (id.startsWith("soon-")) { sfx.boing(); say("info", "That story is still being built in Grandpa's workshop. Coming soon!"); return; }
    void purchase(id as ProductId);
  };

  const move = (fn: () => void) => () => { sfx.hover(); fn(); };
  useRemote({
    up: move(() => setRow(0)),
    down: move(() => setRow(1)),
    left: move(() => { if (row === 1) setCol((c) => Math.max(0, c - 1)); }),
    right: move(() => { if (row === 1) setCol((c) => Math.min(ROW.length - 1, c + 1)); }),
    ok: () => activate(focused),
  }, !dialogOpen);

  const setRef = (id: TileId) => (el: HTMLButtonElement | null) => { if (el) refs.current.set(id, el); else refs.current.delete(id); };
  const sleighOwned = owned("snowed_in_sleigh");
  const bookOwned = owned("hint_book");

  return (
    <div className="store" aria-label="More from Grandpa's Workshop">
      <header className="store-head">
        <div>
          <span className="store-eyebrow">Thank you for lighting the Star Machine</span>
          <h1>More from Grandpa's Workshop</h1>
        </div>
        {toast && (
          <div key={toast.at} className={`store-toast ${toast.kind}`} role="status">
            {toast.kind === "busy" ? <span className="store-spinner" aria-hidden /> : toast.kind === "ok" ? <CheckIcon /> : <InfoIcon />}
            <span>{toast.text}</span>
          </div>
        )}
      </header>

      <button ref={setRef("snowed_in_sleigh")} tabIndex={0}
        className={`store-hero ${focused === "snowed_in_sleigh" ? "focus" : ""} ${sleighOwned ? "owned" : ""}`}
        onClick={() => pressOk(() => { setRow(0); activate("snowed_in_sleigh"); })}>
        <SleighArt />
        <div className="hero-copy">
          <span className="store-badge">New family adventure</span>
          <h2>{PRODUCTS.snowed_in_sleigh.title}</h2>
          <p>{PRODUCTS.snowed_in_sleigh.pitch}</p>
          {sleighOwned ? (
            <span className="hero-owned"><CheckIcon /> Unlocked! Coming to your workshop this Christmas</span>
          ) : (
            <span className="hero-cta">
              {busy === "snowed_in_sleigh" ? "Opening the Appstore..." : <>Buy <b>{price("snowed_in_sleigh")}</b></>}
            </span>
          )}
        </div>
      </button>

      <div className="store-row">
        <button ref={setRef("hint_book")} tabIndex={0}
          className={`store-tile ${focused === "hint_book" ? "focus" : ""} ${bookOwned ? "owned" : ""}`}
          onClick={() => pressOk(() => { setRow(1); setCol(0); activate("hint_book"); })}>
          <HintBookArt />
          <div className="tile-copy">
            <h3>{PRODUCTS.hint_book.title}</h3>
            {bookOwned
              ? <span className="tile-meta owned"><CheckIcon /> Unlocked</span>
              : <span className="tile-meta">{busy === "hint_book" ? "Opening the Appstore..." : <>Extra · <b>{price("hint_book")}</b></>}</span>}
          </div>
        </button>
        {COMING_SOON.map((s, i) => {
          const id = `soon-${i}` as TileId;
          return (
            <button key={id} ref={setRef(id)} tabIndex={0} aria-disabled="true"
              className={`store-tile soon ${focused === id ? "focus" : ""}`}
              onClick={() => pressOk(() => { setRow(1); setCol(i + 1); activate(id); })}>
              {i % 2 === 0 ? <AuroraArt /> : <LighthouseArt />}
              <span className="soon-pill">Coming soon</span>
              <div className="tile-copy">
                <h3>{s.title}</h3>
                <span className="tile-meta">{focused === id ? s.pitch : "New story"}</span>
              </div>
            </button>
          );
        })}
      </div>

      <p className="store-alexa">
        <span className="store-alexa-ring" aria-hidden />
        Or ask Alexa: <q>Alexa, tell me about the Snowed-In Sleigh</q>
      </p>

      <AppstoreDialogHost />
    </div>
  );
}

// ---- icons ----

function CheckIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="30" height="30" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="currentColor" opacity="0.18" />
      <path d="M6.5 12.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="30" height="30" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M12 11v6M12 7.2v.1" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

// ---- tile art, drawn in SVG ----

function SleighArt() {
  return (
    <svg className="tile-art hero-art" viewBox="0 0 1000 420" preserveAspectRatio="xMaxYMid slice" aria-hidden>
      <defs>
        <linearGradient id="st-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1530" />
          <stop offset="0.6" stopColor="#24375f" />
          <stop offset="1" stopColor="#5b6f96" />
        </linearGradient>
        <radialGradient id="st-moon" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff6dd" stopOpacity="0.9" />
          <stop offset="0.25" stopColor="#ffe9b0" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffe9b0" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="st-lantern" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffd36b" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffb347" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="st-sleigh" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d4493a" />
          <stop offset="1" stopColor="#7d1f18" />
        </linearGradient>
        <linearGradient id="st-snow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4f8fc" />
          <stop offset="1" stopColor="#b7c6da" />
        </linearGradient>
      </defs>
      <rect width="1000" height="420" fill="url(#st-sky)" />
      <circle cx="800" cy="92" r="150" fill="url(#st-moon)" />
      <circle cx="800" cy="92" r="34" fill="#fff4d6" />
      {[[560, 60], [640, 130], [700, 40], [930, 170], [960, 50], [520, 150], [880, 230]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 2.6 : 1.8} fill="#fff" opacity="0.8" />
      ))}
      <path d="M380 300 Q520 230 680 270 T1000 240 V420 H380Z" fill="#8ea3c2" opacity="0.6" />
      {[[560, 262], [610, 250], [930, 238], [975, 250]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y - 70} l26 70 h-52z M${x} ${y - 46} l32 58 h-64z`} fill="#1d2c48" opacity="0.85" />
      ))}
      <path d="M380 350 Q560 300 760 330 T1000 316 V420 H380Z" fill="url(#st-snow)" />
      {/* the sleigh, tipped into a snowdrift */}
      <g transform="translate(610 222) rotate(-6)">
        <ellipse cx="128" cy="62" rx="150" ry="70" fill="url(#st-lantern)" />
        <path d="M-6 118 H232 Q270 118 270 82" fill="none" stroke="#c8963e" strokeWidth="9" strokeLinecap="round" />
        <path d="M30 96 v22 M190 96 v22" stroke="#c8963e" strokeWidth="7" />
        <path d="M10 30 Q6 96 46 98 H196 Q236 96 244 52 L262 20 Q232 26 222 52 H34 Q26 30 10 30Z" fill="url(#st-sleigh)" stroke="#5a140f" strokeWidth="3" />
        <path d="M40 64 Q80 48 120 64 T200 64" fill="none" stroke="#e5b25a" strokeWidth="5" strokeLinecap="round" />
        <path d="M22 34 Q28 18 44 22 Q120 4 222 34 Q160 30 120 34 Q60 38 22 34Z" fill="#f4f8fc" />
        {/* lantern */}
        <path d="M232 -2 v18" stroke="#3a2516" strokeWidth="4" />
        <rect x="222" y="16" width="20" height="28" rx="4" fill="#ffd36b" stroke="#8a6224" strokeWidth="3" />
        {/* Jingle the brass robin on the seat */}
        <g transform="translate(118 -2)">
          <ellipse cx="0" cy="0" rx="28" ry="22" fill="#c8963e" stroke="#8a6224" strokeWidth="3" />
          <ellipse cx="10" cy="6" rx="14" ry="12" fill="#c8402f" />
          <circle cx="16" cy="-24" r="15" fill="#d9a64c" stroke="#8a6224" strokeWidth="3" />
          <circle cx="21" cy="-27" r="3" fill="#1b130c" />
          <path d="M30 -24 l14 4 -14 4z" fill="#8a6224" />
          <path d="M-26 -4 l-22 -12 8 22z" fill="#a87a32" />
        </g>
      </g>
      <path d="M560 370 Q700 340 860 362 T1000 350 V420 H560Z" fill="#f4f8fc" />
      <g className="hero-blizzard">
        {Array.from({ length: 26 }, (_, i) => (
          <circle key={i} cx={420 + ((i * 97) % 580)} cy={(i * 53) % 400} r={1.6 + (i % 3)} fill="#fff" opacity={0.5 + (i % 4) * 0.12} />
        ))}
      </g>
    </svg>
  );
}

function HintBookArt() {
  return (
    <svg className="tile-art" viewBox="0 0 560 320" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id="st-desk" cx="0.62" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#9a5b2c" />
          <stop offset="0.55" stopColor="#4e2c15" />
          <stop offset="1" stopColor="#24140a" />
        </radialGradient>
        <linearGradient id="st-leather" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8f3a24" />
          <stop offset="1" stopColor="#4a1a10" />
        </linearGradient>
      </defs>
      <rect width="560" height="320" fill="url(#st-desk)" />
      <g transform="translate(300 40) rotate(8)">
        <rect x="8" y="12" width="190" height="236" rx="10" fill="#1a0e07" opacity="0.5" />
        <rect x="0" y="0" width="190" height="236" rx="10" fill="#efe2c4" />
        <rect x="-6" y="-4" width="190" height="236" rx="10" fill="url(#st-leather)" stroke="#c8963e" strokeWidth="3" />
        <rect x="-6" y="-4" width="26" height="236" rx="6" fill="#3a140b" />
        <path d="M100 66l14 30 33 3-25 22 8 32-30-18-30 18 8-32-25-22 33-3z" fill="#ffd36b" stroke="#a8761f" strokeWidth="3" strokeLinejoin="round" />
        <rect x="40" y="186" width="120" height="8" rx="4" fill="#c8963e" opacity="0.7" />
        <rect x="170" y="100" width="22" height="34" rx="5" fill="#c8963e" stroke="#8a6224" strokeWidth="3" />
        <path d="M150 232 v48 l10 -10 10 10 v-48" fill="#b23a2e" />
        <path d="M-6 22 V6 Q-6 -4 4 -4 H20 Z M184 22 V6 Q184 -4 174 -4 H158 Z M-6 210 V222 Q-6 232 4 232 H20 Z M184 210 V222 Q184 232 174 232 H158 Z" fill="#e5b25a" />
      </g>
      {Array.from({ length: 7 }, (_, i) => (
        <circle key={i} cx={120 + i * 24} cy={80 + ((i * 37) % 70)} r={2 + (i % 3)} fill="#ffe9a8" opacity="0.7" />
      ))}
    </svg>
  );
}

function AuroraArt() {
  return (
    <svg className="tile-art" viewBox="0 0 560 320" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="st-arctic" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#060d1f" />
          <stop offset="1" stopColor="#173352" />
        </linearGradient>
        <linearGradient id="st-aurora" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7ef0c4" stopOpacity="0" />
          <stop offset="0.5" stopColor="#4fe3a8" stopOpacity="0.75" />
          <stop offset="1" stopColor="#2bb3d9" stopOpacity="0" />
        </linearGradient>
        <filter id="st-blur"><feGaussianBlur stdDeviation="8" /></filter>
      </defs>
      <rect width="560" height="320" fill="url(#st-arctic)" />
      <g filter="url(#st-blur)">
        <path d="M-20 140 Q120 40 260 110 T580 70 L580 150 Q420 120 280 180 T-20 200Z" fill="url(#st-aurora)" />
        <path d="M60 80 Q200 10 340 70 T600 40 L600 90 Q440 70 320 120 T60 130Z" fill="#9b7bff" opacity="0.35" />
      </g>
      {[[40, 30], [120, 60], [210, 24], [400, 40], [500, 90], [460, 20], [300, 30]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.8" fill="#fff" opacity="0.85" />
      ))}
      <path d="M0 260 L90 190 L150 230 L250 160 L340 240 L430 180 L560 250 V320 H0Z" fill="#dfe9f4" />
      <path d="M0 260 L90 190 L120 210 L70 260Z M250 160 L280 186 L240 240 L200 200Z" fill="#a8bbd2" />
      <path d="M0 290 Q280 260 560 292 V320 H0Z" fill="#f4f8fc" />
    </svg>
  );
}

function LighthouseArt() {
  return (
    <svg className="tile-art" viewBox="0 0 560 320" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="st-storm" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a2333" />
          <stop offset="1" stopColor="#36485e" />
        </linearGradient>
        <linearGradient id="st-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffe9a8" stopOpacity="0.7" />
          <stop offset="1" stopColor="#ffe9a8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="560" height="320" fill="url(#st-storm)" />
      <path d="M392 92 L0 30 L0 150Z" fill="url(#st-beam)" />
      <path d="M0 230 Q70 210 140 232 T280 228 T420 236 T560 226 V320 H0Z" fill="#20364d" />
      <path d="M0 252 Q80 236 160 256 T320 250 T560 258 V320 H0Z" fill="#162636" />
      <path d="M300 250 Q360 210 470 222 Q520 230 560 250 V320 H300Z" fill="#2b2b33" />
      <path d="M372 238 L384 112 H412 L424 238Z" fill="#f2ead8" />
      <path d="M377 190 H419 L421 212 H375Z M380 150 H416 L418 170 H378Z" fill="#b23a2e" />
      <rect x="380" y="90" width="36" height="24" rx="3" fill="#ffd36b" />
      <path d="M374 90 L398 66 L422 90Z" fill="#b23a2e" />
      {/* the cat, watching the sea */}
      <g transform="translate(470 214)" fill="#0e0f14">
        <ellipse cx="0" cy="0" rx="16" ry="12" />
        <circle cx="-12" cy="-14" r="9" />
        <path d="M-19 -20 l2 -10 6 6z M-7 -21 l3 -9 3 9z" />
        <path d="M14 4 Q34 0 30 -20" fill="none" stroke="#0e0f14" strokeWidth="5" strokeLinecap="round" />
      </g>
      {Array.from({ length: 18 }, (_, i) => (
        <path key={i} d={`M${(i * 61) % 560} ${(i * 29) % 210} l-10 22`} stroke="#c9d6e6" strokeWidth="2" opacity="0.35" />
      ))}
    </svg>
  );
}
