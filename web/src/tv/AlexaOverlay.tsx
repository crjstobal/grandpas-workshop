// The Fire TV style Alexa+ response: a panel that slides up from the bottom of the TV when Alexa
// answers, with the voice ring, a caption of what she said and the rich card from the MCP tool.
// It stays up while a purchase is pending, and shows the receipt in place when it completes.
// Mount it inside the 1920x1080 stage; it keeps to the 5% TV safe area on its own.
import { useEffect, useRef, useState } from "react";
import type { AlexaCard, Checkout, PublicState } from "../../../shared/types";
import { PRODUCTS } from "../../../shared/story";
import { AlexaCardView, VoiceRing, useSpeaker } from "../alexa/AlexaCard";
import "../alexa/alexa.css";

const HIDE_AFTER_MS = 10_000;
const money = (n: number) => `$${n.toFixed(2)}`;
const isPending = (c: Checkout | null) => !!c && (c.status === "awaiting_confirmation" || c.status === "awaiting_grown_up");

/** The checkout card built from the live checkout, so its status chip never lags behind. */
function liveCheckoutCard(c: Checkout, fromAlexa?: AlexaCard): AlexaCard {
  if (fromAlexa?.type === "checkout" && fromAlexa.checkoutId === c.id) return { ...fromAlexa, status: c.status };
  const p = PRODUCTS[c.productId];
  return {
    type: "checkout", checkoutId: c.id, productId: c.productId, title: p.title, status: c.status,
    lines: [{ label: p.title, amount: money(p.price) }, { label: "Estimated tax", amount: money(p.tax) }],
    total: money(p.price + p.tax), payment: "Visa ending in 0000 (simulated)",
  };
}

/** Rough speaking time, for when the voice plays on a phone and the TV cannot hear it. */
const speechMs = (text: string) => Math.min(14_000, 1500 + text.length * 60);

export function AlexaOverlay({ state }: { state: PublicState }) {
  const who = useSpeaker();
  const [now, setNow] = useState(() => Date.now());
  const [lastVoiceEnd, setLastVoiceEnd] = useState(0);
  // A purchase outcome shown in place (receipt or declined), with its own caption.
  const [outcome, setOutcome] = useState<{ card: AlexaCard; caption: string; at: number } | null>(null);
  const prevCheckout = useRef<Checkout | null>(state.checkout);

  const alexa = state.alexa;
  const checkout = state.checkout;
  const pending = isPending(checkout);
  const approver = state.players.find((p) => p.grownUp)?.name ?? state.players[0]?.name ?? "a grown-up";

  // Tick while something time based is on screen.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // Alexa stopped talking on this device: start the hide countdown from here.
  const wasAlexa = useRef(false);
  useEffect(() => {
    if (who === "alexa") wasAlexa.current = true;
    else if (wasAlexa.current) { wasAlexa.current = false; setLastVoiceEnd(Date.now()); }
  }, [who]);

  // A pending purchase that just finished: show the receipt (or the decline) in place.
  useEffect(() => {
    const prev = prevCheckout.current;
    prevCheckout.current = checkout;
    if (!checkout || !prev || prev.id !== checkout.id || prev.status === checkout.status || !isPending(prev)) return;
    const title = PRODUCTS[checkout.productId].title;
    if (checkout.status === "completed") {
      setOutcome({
        at: Date.now(),
        caption: `${approver} approved it. ${title} is ready for your family.`,
        card: { type: "receipt", checkoutId: checkout.id, title: "Order confirmed", body: `${title} is ready for your family. A receipt was sent to ${approver}'s phone.`, receiptId: checkout.receiptId ?? checkout.id.toUpperCase() },
      });
    } else if (checkout.status === "declined") {
      setOutcome({ at: Date.now(), caption: "No problem. Nothing was bought, and nothing was charged.", card: liveCheckoutCard(checkout) });
    }
  }, [checkout, approver]);

  const alexaAt = alexa?.at ?? 0;
  const outcomeIsNewer = !!outcome && outcome.at > alexaAt;
  const estimatedTalking = !!alexa && now < alexaAt + speechMs(alexa.text);
  const talking = who === "alexa" || estimatedTalking;
  const lastActivity = Math.max(alexa ? alexaAt + speechMs(alexa.text) : 0, lastVoiceEnd, outcome?.at ?? 0);
  let card: AlexaCard | undefined;
  let caption = alexa?.text ?? "";
  if (pending && checkout) card = liveCheckoutCard(checkout, alexa?.card);
  else if (outcomeIsNewer) { card = outcome!.card; caption = outcome!.caption; }
  else card = alexa?.card;
  // Lines the TV speaks with its own card on screen (Grandpa's message, the memory lock) have no
  // caption here: an empty panel would only cover the story.
  const visible = (pending || talking || (lastActivity > 0 && now < lastActivity + HIDE_AFTER_MS)) && (pending || !!caption || !!card);

  // Keep the last content while the panel slides away, so it does not empty mid animation.
  const shown = useRef<{ card?: AlexaCard; caption: string }>({ caption: "" });
  if (visible) shown.current = { card, caption };
  const view = visible ? { card, caption } : shown.current;

  return (
    <div className={`ax-overlay ${visible ? "show" : ""}`} aria-live="polite" aria-hidden={!visible}>
      <div className={`ax ax-tv ax-panel ${view.card ? "with-card" : ""}`}>
        <span className={`ax-panel-glow ${talking ? "on" : ""}`} aria-hidden="true" />
        <div className="ax-panel-voice">
          <div className="ax-panel-brand">
            <VoiceRing active={talking} />
            <span className="ax-brand-label">Alexa+ <em>(simulated)</em></span>
          </div>
          {view.caption && <p className="ax-caption">{view.caption}</p>}
          {pending && checkout?.status === "awaiting_grown_up" && (
            <div className="ax-waiting">
              <span className="ax-waiting-phone" aria-hidden="true"><i /></span>
              <span>Waiting for {approver}'s approval on their phone</span>
              <span className="ax-dots" aria-hidden="true"><i /><i /><i /></span>
            </div>
          )}
        </div>
        {view.card && (
          <div className="ax-panel-card" key={`${view.card.type}-${"checkoutId" in view.card ? view.card.checkoutId : alexaAt}`}>
            <AlexaCardView card={view.card} size="tv" approver={approver} />
          </div>
        )}
      </div>
    </div>
  );
}
