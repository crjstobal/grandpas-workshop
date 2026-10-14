// The grown-up's purchase approval, on their phone: a bottom sheet in the style of a household
// purchase approval notification. A voice purchase made by anyone in the family lands here, and
// nothing is bought until the account holder taps Approve. Simulated: no money moves.
import { useEffect, useRef, useState } from "react";
import type { Checkout, Player, PublicState } from "../../../shared/types";
import { PRODUCTS } from "../../../shared/story";
import { api } from "../api";
import { ProductArt, VoiceRing } from "../alexa/AlexaCard";
import "../alexa/alexa.css";

const money = (n: number) => `$${n.toFixed(2)}`;
const RECEIPT_MS = 6000;
const DECLINED_MS = 3500;

type View =
  | { kind: "request"; checkout: Checkout }
  | { kind: "receipt"; checkout: Checkout }
  | { kind: "declined"; checkout: Checkout };

export function ApprovePurchase({ state, code, grownUp }: { state: PublicState; code: string; grownUp: Player }) {
  const checkout = state.checkout;
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [after, setAfter] = useState<View | null>(null);
  const seen = useRef<string | null>(null);

  // Remember the request we showed, so its outcome can be shown on this phone afterwards.
  useEffect(() => {
    if (!checkout) return;
    if (checkout.status === "awaiting_grown_up") { seen.current = checkout.id; setAfter(null); return; }
    if (seen.current !== checkout.id) return;
    seen.current = null;
    setBusy(null);
    if (checkout.status === "completed") setAfter({ kind: "receipt", checkout });
    else if (checkout.status === "declined" || checkout.status === "failed") setAfter({ kind: "declined", checkout });
  }, [checkout]);

  useEffect(() => {
    if (!after) return;
    const t = setTimeout(() => setAfter(null), after.kind === "receipt" ? RECEIPT_MS : DECLINED_MS);
    return () => clearTimeout(t);
  }, [after]);

  const view: View | null = checkout?.status === "awaiting_grown_up" ? { kind: "request", checkout } : after;
  if (!view || !grownUp.grownUp) return null;

  const p = PRODUCTS[view.checkout.productId];
  const answer = async (yes: boolean) => {
    setBusy(yes ? "approve" : "decline");
    setError(null);
    try {
      const r = await api.approve(code, view.checkout.id, grownUp.id, yes);
      // The room state update brings the outcome; this covers a slow stream.
      if (r.status === "completed") setAfter({ kind: "receipt", checkout: { ...view.checkout, status: "completed" } });
      else if (r.status === "declined") setAfter({ kind: "declined", checkout: { ...view.checkout, status: "declined" } });
      seen.current = null;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="ax-sheet-backdrop" role="presentation">
      <section className="ax ax-phone ax-light ax-sheet" role="dialog" aria-modal="true" aria-labelledby="ax-sheet-title">
        <span className="ax-sheet-grip" aria-hidden="true" />
        <header className="ax-sheet-top">
          <VoiceRing small active={view.kind === "request"} />
          <span className="ax-brand-label">Alexa+ <em>(simulated)</em></span>
          <span className="ax-sheet-time">now</span>
        </header>

        {view.kind === "request" && (
          <>
            <h2 id="ax-sheet-title" className="ax-display sm">Approve purchase?</h2>
            <p className="ax-body sm ax-sheet-sub">Requested through Alexa in Grandpa's Workshop, on the living room Fire TV.</p>
            <div className="ax-sheet-item">
              <ProductArt productId={p.id} />
              <div className="ax-stack grow">
                <span className="ax-headline sm">{p.title}</span>
                <span className="ax-meta">{p.kind === "extra" ? "Add-on" : "New family adventure"}, digital</span>
              </div>
            </div>
            <dl className="ax-lines">
              <div><dt>Item price</dt><dd>{money(p.price)}</dd></div>
              <div><dt>Estimated tax</dt><dd>{money(p.tax)}</dd></div>
              <div className="total"><dt>Total</dt><dd>{money(p.price + p.tax)}</dd></div>
            </dl>
            <div className="ax-pay">
              <span className="ax-cardglyph" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6 15h4" /></svg>
              </span>
              <span className="ax-stack grow">
                <span className="ax-meta">Pay with</span>
                <span className="ax-body sm">Visa ending in 0000 (simulated)</span>
              </span>
            </div>
            {error && <p className="ax-error" role="alert">{error}</p>}
            <div className="ax-actions stacked">
              <button type="button" className="ax-btn strong" disabled={!!busy} onClick={() => void answer(true)}>
                {busy === "approve" ? "Approving..." : `Approve, ${money(p.price + p.tax)}`}
              </button>
              <button type="button" className="ax-btn secondary" disabled={!!busy} onClick={() => void answer(false)}>
                {busy === "decline" ? "Declining..." : "Decline"}
              </button>
            </div>
            <p className="ax-fine center">Simulated purchase, no money is charged.</p>
          </>
        )}

        {view.kind === "receipt" && (
          <div className="ax-sheet-result">
            <span className="ax-check big" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </span>
            <h2 id="ax-sheet-title" className="ax-display sm">Order confirmed</h2>
            <p className="ax-body">{p.title} is ready for your family on the TV.</p>
            <dl className="ax-lines">
              <div><dt>Order number</dt><dd className="ax-mono">{state.checkout?.receiptId ?? view.checkout.receiptId ?? view.checkout.id.toUpperCase()}</dd></div>
              <div className="total"><dt>Total</dt><dd>{money(p.price + p.tax)}</dd></div>
            </dl>
            <p className="ax-fine center">Simulated purchase, no money was charged.</p>
          </div>
        )}

        {view.kind === "declined" && (
          <div className="ax-sheet-result">
            <span className="ax-check big declined" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M7 7l10 10M17 7L7 17" /></svg>
            </span>
            <h2 id="ax-sheet-title" className="ax-display sm">Purchase declined</h2>
            <p className="ax-body">Nothing was bought. Alexa will let the family know.</p>
          </div>
        )}
      </section>
    </div>
  );
}
