// Browser preview stand-in for the Fire TV system purchase dialog. On a real Fire TV the shell
// opens Amazon's own dialog and this never renders. Played with the D-pad: left/right (or
// up/down) picks Buy or Cancel, OK confirms, Back cancels.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { answerPurchaseDialog, getPurchaseDialog, subscribePurchaseDialog } from "../store";
import { sfx } from "../sfx";
import { pressOk, useRemote } from "./remote";
import "./store.css";

const BACK_KEYS = ["Escape", "Backspace", "GoBack", "BrowserBack"];

/** True while the simulated dialog is on screen, so the screen behind it can stop listening. */
export function usePurchaseDialogOpen() {
  return useSyncExternalStore(subscribePurchaseDialog, getPurchaseDialog) !== null;
}

export function AppstoreDialogHost() {
  const d = useSyncExternalStore(subscribePurchaseDialog, getPurchaseDialog);
  if (!d) return null;
  return <AppstoreDialog key={d.id} title={d.title} price={d.price} kind={d.kind} />;
}

function AppstoreDialog({ title, price, kind }: { title: string; price: string; kind: "story" | "extra" }) {
  const [at, setAt] = useState(0);
  const buyRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Real DOM focus, so a remote whose OK arrives as a click lands on the right button.
  useEffect(() => { (at === 0 ? buyRef : cancelRef).current?.focus({ preventScroll: true }); }, [at]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (BACK_KEYS.includes(e.key) || e.keyCode === 27) { e.preventDefault(); answerPurchaseDialog(false); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const move = () => { sfx.hover(); setAt((a) => 1 - a); };
  const confirm = () => answerPurchaseDialog(at === 0);
  useRemote({ left: move, right: move, up: move, down: move, ok: confirm });

  return (
    <div className="iap-scrim" role="dialog" aria-modal="true" aria-label={`Buy ${title}`}>
      <div className="iap-dialog">
        <p className="iap-sim">Browser preview: simulated Appstore purchase. On Fire TV this is the real Amazon purchase dialog.</p>
        <div className="iap-body">
          <div className={`iap-icon ${kind}`} aria-hidden>{kind === "story" ? <SleighGlyph /> : <BookGlyph />}</div>
          <div className="iap-info">
            <span className="iap-kind">{kind === "story" ? "In-app item · Adventure" : "In-app item · Extra"}</span>
            <h2>{title}</h2>
            <span className="iap-dev">Grandpa's Workshop</span>
          </div>
          <div className="iap-price">
            <strong>{price}</strong>
            <span>plus applicable tax</span>
          </div>
        </div>
        <div className="iap-actions">
          <button ref={buyRef} className={`iap-btn primary ${at === 0 ? "focus" : ""}`} tabIndex={0}
            onClick={() => pressOk(() => answerPurchaseDialog(true))}>Buy</button>
          <button ref={cancelRef} className={`iap-btn ${at === 1 ? "focus" : ""}`} tabIndex={0}
            onClick={() => pressOk(() => answerPurchaseDialog(false))}>Cancel</button>
        </div>
        <p className="iap-fine">Charged to the account holder. No real money moves in this preview.</p>
      </div>
    </div>
  );
}

function SleighGlyph() {
  return (
    <svg viewBox="0 0 120 120" width="120" height="120">
      <defs>
        <linearGradient id="iapNight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1d3557" /><stop offset="1" stopColor="#0d1b2a" /></linearGradient>
      </defs>
      <rect width="120" height="120" rx="22" fill="url(#iapNight)" />
      <path d="M0 92 Q30 80 60 90 T120 86 V120 H0Z" fill="#e8eef6" />
      <path d="M26 58 h50 q12 0 14 -14 l6 0 q-2 26 -22 28 h-44 q-8 0 -8 -8z" fill="#b23a2e" />
      <path d="M22 80 h64 q10 0 12 -8" fill="none" stroke="#c8963e" strokeWidth="5" strokeLinecap="round" />
      <path d="M34 72 v8 M70 72 v8" stroke="#c8963e" strokeWidth="4" />
      <circle cx="92" cy="26" r="9" fill="#f6ecd9" />
    </svg>
  );
}

function BookGlyph() {
  return (
    <svg viewBox="0 0 120 120" width="120" height="120">
      <rect width="120" height="120" rx="22" fill="#3a2516" />
      <rect x="28" y="20" width="64" height="80" rx="6" fill="#7a3b26" stroke="#c8963e" strokeWidth="3" />
      <rect x="28" y="20" width="10" height="80" rx="3" fill="#5c2a1a" />
      <path d="M60 40l5 11 12 1-9 8 3 12-11-7-11 7 3-12-9-8 12-1z" fill="#ffd36b" />
      <rect x="86" y="54" width="14" height="12" rx="3" fill="#c8963e" />
    </svg>
  );
}
