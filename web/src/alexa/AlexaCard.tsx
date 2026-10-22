// Rich cards for the simulated Alexa+ layer, built on the Alexa+ add-on visual foundations:
// a 768x480 base canvas scaled per surface (phone 1x, TV 2x), the official type scale, spacing
// and radii, dark card surfaces, muted backgrounds, and one strong color reserved for "Buy".
// Patterns: Card (tap the card to navigate, the CTA completes), List (quiz options),
// Checkout (full breakdown) and Receipt. No Amazon logos: a generic voice ring stands in.
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import type { AlexaCard, Checkout, ProductId } from "../../../shared/types";
import { PRODUCTS } from "../../../shared/story";
import { onSpeaking, speaking, type Speaker } from "../voice";
import "./alexa.css";

/** The utterances the card CTAs send to Alexa (the same words a family would say out loud). */
export const ALEXA_UTTERANCES = {
  learnMore: "Yes, tell me more",
  buy: "Yes, buy it",
  decline: "No thanks",
} as const;

export type AlexaCardSize = "tv" | "phone";

interface Props {
  card: AlexaCard;
  size: AlexaCardSize;
  /** Called with the utterance to send to Alexa (see ALEXA_UTTERANCES, or a quiz option). Omit to render the card read-only. */
  onAction?: (action: string) => void;
  /** Optional: the grown-up's name, for the "waiting for approval" status. */
  approver?: string;
}

export function AlexaCardView({ card, size, onAction, approver }: Props) {
  const body = (() => {
    switch (card.type) {
      case "message": return <MessageCard card={card} size={size} />;
      case "hint": return <HintCard card={card} />;
      case "question": return <QuestionCard card={card} size={size} onAction={onAction} />;
      case "offer": return <OfferCard card={card} size={size} onAction={onAction} />;
      case "checkout": return <CheckoutCard card={card} size={size} onAction={onAction} approver={approver} />;
      case "receipt": return <ReceiptCard card={card} />;
    }
  })();
  return <div className={`ax ax-${size}`}>{body}</div>;
}

/* ---------------- shared pieces ---------------- */

/** Who is speaking right now, from the voice director. */
export function useSpeaker(): Speaker | null {
  const [who, setWho] = useState<Speaker | null>(() => speaking());
  useEffect(() => onSpeaking(setWho), []);
  return who;
}

/** The generic glowing voice ring that stands in for the assistant (no logo, no word mark). */
export function VoiceRing({ active, small }: { active?: boolean; small?: boolean }) {
  return (
    <span className={`ax-ring ${active ? "on" : ""} ${small ? "small" : ""}`} aria-hidden="true">
      <span className="ax-ring-glow" />
      <span className="ax-ring-core" />
    </span>
  );
}

function Eyebrow({ icon, children, trailing }: { icon?: ReactNode; children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="ax-eyebrow">
      {icon && <span className="ax-eyebrow-icon">{icon}</span>}
      <span className="ax-eyebrow-text">{children}</span>
      {trailing && <span className="ax-eyebrow-trailing">{trailing}</span>}
    </div>
  );
}

/** Small product artwork tile: a night sky sleigh for stories, Jingle in his scarf for the scarf. */
export function ProductArt({ productId, large }: { productId: ProductId; large?: boolean }) {
  const kind = PRODUCTS[productId]?.kind ?? "story";
  return (
    <span className={`ax-art ${kind} ${large ? "large" : ""}`} aria-hidden="true">
      {kind === "story" ? (
        <svg viewBox="0 0 64 64">
          <circle cx="48" cy="15" r="6" fill="#F6ECD9" opacity="0.9" />
          <circle cx="14" cy="12" r="1.4" fill="#fff" /><circle cx="26" cy="20" r="1" fill="#fff" />
          <circle cx="36" cy="9" r="1.2" fill="#fff" /><circle cx="56" cy="30" r="1" fill="#fff" />
          <path d="M12 38 h26 c5 0 8-4 9-9 l2-6" fill="none" stroke="#C8963E" strokeWidth="3" strokeLinecap="round" />
          <path d="M14 38 v-8 h18 c3 0 4 3 4 8" fill="#B23A2E" />
          <path d="M8 46 h38 c4 0 6-2 7-5" fill="none" stroke="#C8963E" strokeWidth="3" strokeLinecap="round" />
          <path d="M18 38 v8 M34 38 v8" stroke="#C8963E" strokeWidth="2.5" />
          <path d="M0 56 q16-6 32 0 t32 0 v8 h-64z" fill="#E8EEF5" opacity="0.85" />
        </svg>
      ) : (
        // the scarf: Jingle wearing it
        <img src="/scenes/jingle_fly_a_scarf.png" alt="" style={{ width: "120%", height: "120%", objectFit: "contain", transform: "scaleX(-1) translate(8%, -6%)" }} />
      )}
    </span>
  );
}

const kindLabel = (productId: ProductId) => (PRODUCTS[productId]?.kind === "extra" ? "Add-on" : "New family adventure");

/** Makes a div behave as a button (the whole card is tappable, with real buttons nested inside). */
function tappable(onTap?: () => void) {
  if (!onTap) return {};
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: onTap,
    onKeyDown: (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(); } },
  };
}

/* ---------------- message: an audio message from Grandpa ---------------- */

function hashBars(text: string, n: number) {
  let h = 2166136261;
  const bars: number[] = [];
  for (let i = 0; i < n; i++) {
    h ^= text.charCodeAt(i % Math.max(1, text.length)) + i;
    h = Math.imul(h, 16777619);
    const t = i / (n - 1);
    const envelope = 0.45 + 0.55 * Math.sin(Math.PI * t);
    bars.push(0.18 + 0.82 * envelope * (((h >>> 0) % 1000) / 1000));
  }
  return bars;
}

function MessageCard({ card, size }: { card: Extract<AlexaCard, { type: "message" }>; size: AlexaCardSize }) {
  const who = useSpeaker();
  const playing = who === "grandpa";
  const bars = useMemo(() => hashBars(card.body || card.title, size === "tv" ? 36 : 30), [card.body, card.title, size]);
  const initial = (card.from.trim()[0] ?? "G").toUpperCase();
  return (
    <article className="ax-card ax-message">
      <Eyebrow icon={<MicIcon />}>Voice message</Eyebrow>
      <div className="ax-message-head">
        <span className="ax-avatar" aria-hidden="true">{initial}</span>
        <div className="ax-stack">
          <h3 className="ax-headline">{card.title}</h3>
          <span className="ax-meta">From {card.from}</span>
        </div>
      </div>
      <div className={`ax-wave ${playing ? "playing" : ""}`} aria-label={playing ? "Playing" : "Audio message"}>
        <span className="ax-wave-play" aria-hidden="true">{playing ? <PauseIcon /> : <PlayIcon />}</span>
        <span className="ax-wave-bars">
          {bars.map((b, i) => <i key={i} style={{ height: `${Math.round(b * 100)}%`, animationDelay: `${(i % 7) * 90}ms` }} />)}
        </span>
      </div>
      {card.body && <p className="ax-body ax-quote">{card.body}</p>}
    </article>
  );
}

/* ---------------- hint ---------------- */

function HintCard({ card }: { card: Extract<AlexaCard, { type: "hint" }> }) {
  return (
    <article className="ax-card ax-hint">
      <Eyebrow icon={<BulbIcon />}>Hint</Eyebrow>
      <h3 className="ax-headline">{card.title}</h3>
      <div className="ax-surface ax-hint-body">
        <p className="ax-body">{card.body}</p>
      </div>
    </article>
  );
}

/* ---------------- question: a List of three options ---------------- */

function QuestionCard({ card, size, onAction }: { card: Extract<AlexaCard, { type: "question" }>; size: AlexaCardSize; onAction?: (a: string) => void }) {
  return (
    <article className="ax-card ax-question">
      <Eyebrow icon={<LockIcon />}>{card.title}</Eyebrow>
      <h3 className="ax-display">{card.question}</h3>
      <ol className="ax-list">
        {card.options.map((o, i) => {
          const letter = String.fromCharCode(65 + i);
          const content = (<><span className="ax-badge">{letter}</span><span className="ax-list-text">{o}</span></>);
          return (
            <li key={i}>
              {onAction
                ? <button type="button" className="ax-list-item" onClick={() => onAction(o)}>{content}</button>
                : <div className="ax-list-item">{content}</div>}
            </li>
          );
        })}
      </ol>
      {size === "tv" && <p className="ax-say">Say your answer out loud to Alexa</p>}
    </article>
  );
}

/* ---------------- offer: Card pattern, no price ---------------- */

function OfferCard({ card, size, onAction }: { card: Extract<AlexaCard, { type: "offer" }>; size: AlexaCardSize; onAction?: (a: string) => void }) {
  const more = onAction ? () => onAction(ALEXA_UTTERANCES.learnMore) : undefined;
  return (
    <article className={`ax-card ax-offer ${more ? "tappable" : ""}`} {...tappable(more)}>
      <div className="ax-offer-hero">
        <ProductArt productId={card.productId} large />
        <div className="ax-stack">
          <span className="ax-label-strong">{kindLabel(card.productId)}</span>
          <h3 className="ax-headline">{card.title}</h3>
          <span className="ax-meta">Grandpa's Workshop</span>
        </div>
      </div>
      <p className="ax-body">{card.body}</p>
      {onAction ? (
        <div className="ax-actions">
          <button type="button" className="ax-btn primary" onClick={(e) => { e.stopPropagation(); onAction(ALEXA_UTTERANCES.learnMore); }}>{card.cta || "Learn more"}</button>
          <button type="button" className="ax-btn secondary" onClick={(e) => { e.stopPropagation(); onAction(ALEXA_UTTERANCES.decline); }}>No thanks</button>
        </div>
      ) : size === "tv" ? (
        <p className="ax-say">Say "{ALEXA_UTTERANCES.learnMore}"</p>
      ) : null}
    </article>
  );
}

/* ---------------- checkout: full breakdown ---------------- */

const STATUS: Record<Checkout["status"], { label: string; tone: string }> = {
  offered: { label: "Review your order", tone: "neutral" },
  awaiting_confirmation: { label: "Awaiting confirmation", tone: "info" },
  awaiting_grown_up: { label: "Waiting for a grown-up's approval", tone: "wait" },
  completed: { label: "Order confirmed", tone: "ok" },
  declined: { label: "Declined", tone: "bad" },
  failed: { label: "Payment failed", tone: "bad" },
};

export function StatusChip({ status, approver }: { status: Checkout["status"]; approver?: string }) {
  const s = STATUS[status];
  const label = status === "awaiting_grown_up" && approver ? `Waiting for ${approver}'s approval` : s.label;
  return <span className={`ax-chip ${s.tone}`}><i />{label}</span>;
}

function CheckoutCard({ card, size, onAction, approver }: { card: Extract<AlexaCard, { type: "checkout" }>; size: AlexaCardSize; onAction?: (a: string) => void; approver?: string }) {
  const [item, ...rest] = card.lines;
  const canConfirm = card.status === "awaiting_confirmation" || card.status === "offered";
  return (
    <article className={`ax-card ax-checkout status-${card.status}`}>
      <Eyebrow icon={<BagIcon />} trailing={<StatusChip status={card.status} approver={approver} />}>Checkout</Eyebrow>
      <div className="ax-item">
        <ProductArt productId={card.productId} />
        <div className="ax-stack grow">
          <span className="ax-headline sm">{item?.label ?? card.title}</span>
          <span className="ax-meta">{kindLabel(card.productId)}, digital</span>
        </div>
      </div>
      <dl className="ax-lines">
        {item && <div><dt>Item price</dt><dd>{item.amount}</dd></div>}
        {rest.map((l) => <div key={l.label}><dt>{l.label}</dt><dd>{l.amount}</dd></div>)}
        <div className="total"><dt>Total</dt><dd>{card.total}</dd></div>
      </dl>
      <div className="ax-pay">
        <CardIcon />
        <span className="ax-stack grow">
          <span className="ax-meta">Pay with</span>
          <span className="ax-body sm">{card.payment}</span>
        </span>
      </div>
      {canConfirm && onAction && (
        <div className="ax-actions">
          <button type="button" className="ax-btn strong" onClick={() => onAction(ALEXA_UTTERANCES.buy)}>Buy now, {card.total}</button>
          <button type="button" className="ax-btn secondary" onClick={() => onAction(ALEXA_UTTERANCES.decline)}>No thanks</button>
        </div>
      )}
      {canConfirm && !onAction && size === "tv" && <p className="ax-say">Say "{ALEXA_UTTERANCES.buy}" to place your order</p>}
      {card.status === "awaiting_grown_up" && (
        <p className="ax-note"><PhoneIcon />A grown-up approves every purchase on their phone. Nothing is charged until then.</p>
      )}
      <p className="ax-fine">Simulated purchase, no money is charged.</p>
    </article>
  );
}

/* ---------------- receipt ---------------- */

function ReceiptCard({ card }: { card: Extract<AlexaCard, { type: "receipt" }> }) {
  return (
    <article className="ax-card ax-receipt">
      <div className="ax-receipt-head">
        <span className="ax-check" aria-hidden="true"><CheckIcon /></span>
        <div className="ax-stack">
          <h3 className="ax-display sm">{card.title || "Order confirmed"}</h3>
          <span className="ax-meta">Order {card.receiptId}</span>
        </div>
      </div>
      <p className="ax-body">{card.body}</p>
      <div className="ax-surface ax-receipt-row">
        <span className="ax-meta">Order number</span>
        <span className="ax-mono">{card.receiptId}</span>
      </div>
      <p className="ax-fine">Simulated purchase, no money was charged.</p>
    </article>
  );
}

/* ---------------- icons (simple strokes, currentColor) ---------------- */

const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const MicIcon = () => <Svg><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Svg>;
const BulbIcon = () => <Svg><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.6 1 2.5h6c0-.9.2-1.7 1-2.5A6 6 0 0 0 12 3z" /></Svg>;
const LockIcon = () => <Svg><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Svg>;
const BagIcon = () => <Svg><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></Svg>;
const CardIcon = () => <span className="ax-cardglyph" aria-hidden="true"><Svg><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6 15h4" /></Svg></span>;
const PhoneIcon = () => <span className="ax-inline-icon"><Svg><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></Svg></span>;
const CheckIcon = () => <Svg><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
const PlayIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>;
const PauseIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" /></svg>;
