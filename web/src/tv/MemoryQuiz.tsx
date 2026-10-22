// Piece three: Grandpa's star is locked in a little wooden box whose brass lock is made of
// memories. Alexa watched the family all night and asks three questions about it. Each right
// answer clicks one dial open; the third opens the box. The family answers with the remote
// (D-pad + OK) or by telling Alexa on a phone, which updates the same room state.
import { useEffect, useRef, useState } from "react";
import type { PublicState } from "../../../shared/types";
import { ALEXA_LINES } from "../../../shared/story";
import { api } from "../api";
import { sfx } from "../sfx";
import { onSpeaking, speak, speaking, whenQuiet } from "../voice";
import { pressOk, useRemote } from "./remote";
import "./memory-quiz.css";

/** How long a right answer stays on screen (green) before the next question takes its place. */
const CELEBRATE_MS = 1700;
/** When, inside that, the dial clicks open. */
const DIAL_MS = 450;
const LETTERS = ["A", "B", "C", "D"];

const spokenOptions = (o: string[]) =>
  o.length <= 1 ? o.join("") : o.length === 2 ? `${o[0]} or ${o[1]}` : `${o.slice(0, -1).join(", ")}, or ${o[o.length - 1]}`;

export function MemoryQuiz({ state }: { state: PublicState }) {
  const quiz = state.quiz;
  const total = Math.max(1, quiz.questions.length);
  const latest = useRef(state);
  latest.current = state;

  // What is on screen can lag a beat behind the room state, so a right answer gets its moment.
  const [shown, setShown] = useState(quiz.done ? total - 1 : quiz.index);
  const [opened, setOpened] = useState(quiz.done ? total : quiz.index);
  const [boxOpen, setBoxOpen] = useState(quiz.done);
  const [right, setRight] = useState<{ index: number; picked: number } | null>(null);
  const [clicked, setClicked] = useState<number | null>(null);
  const [dimmed, setDimmed] = useState<number[]>([]);
  const [wrong, setWrong] = useState<{ picked: number; at: number } | null>(null);
  const [focus, setFocus] = useState(0);
  const [sending, setSending] = useState(false);
  const talking = useAlexaTalking();
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const seenAnswer = useRef(quiz.last?.at ?? 0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const celebrating = useRef(false);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };

  // React to every answer, whether it came from the remote or from Alexa on a phone.
  useEffect(() => {
    const last = quiz.last;
    if (!last || last.at === seenAnswer.current) return;
    seenAnswer.current = last.at;
    if (last.right) {
      celebrating.current = true;
      sfx.chime();
      setShown(last.index);
      setRight({ index: last.index, picked: last.picked });
      setWrong(null);
      later(DIAL_MS, () => {
        sfx.knock(); sfx.tick();
        setOpened((n) => Math.max(n, last.index + 1));
        setClicked(last.index);
      });
      later(CELEBRATE_MS, () => {
        const q = latest.current.quiz;
        celebrating.current = false;
        setRight(null);
        setClicked(null);
        if (q.done) {
          setBoxOpen(true);
          sfx.unlock(); sfx.sparkle();
        } else {
          setShown(q.index);
        }
      });
    } else {
      sfx.boing();
      setWrong({ picked: last.picked, at: last.at });
      if (last.index === shown) {
        const d = dimmed.includes(last.picked) ? dimmed : [...dimmed, last.picked];
        setDimmed(d);
        // Move on to the next option still standing.
        if (d.includes(focus)) {
          const n = options.length;
          for (let i = 1; i <= n; i++) { const k = (last.picked + i) % n; if (!d.includes(k)) { setFocus(k); break; } }
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz.last?.at]);

  // Catch up if the room moved on without us seeing the answer (a reload, a missed update).
  useEffect(() => {
    if (right || celebrating.current) return;
    if (quiz.done) { setOpened(total); if (!boxOpen) setBoxOpen(true); return; }
    if (quiz.index !== shown) { setShown(quiz.index); setOpened(quiz.index); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz.index, quiz.done, right]);

  // A new question: fresh options, focus on the first one.
  useEffect(() => { setDimmed([]); setWrong(null); setFocus(0); }, [shown]);

  // Alexa reads each question aloud (with her introduction before the first one).
  const spoken = useRef<number | null>(null);
  const doneSpoken = useRef(false);
  useEffect(() => {
    if (right || celebrating.current) return;
    if (quiz.done) {
      if (!doneSpoken.current) { doneSpoken.current = true; speak("alexa", ALEXA_LINES.memoryDone); }
      return;
    }
    if (spoken.current === shown) return;
    const q = quiz.questions[shown];
    if (!q) return;
    const first = spoken.current === null && shown === 0;
    spoken.current = shown;
    const ask = () => {
      if (first) speak("alexa", ALEXA_LINES.memoryIntro);
      speak("alexa", `${q.question} Is it ${spokenOptions(q.options)}?`);
    };
    // The first time, Alexa waits for the narrator and Jingle to finish introducing the chapter.
    if (first) void whenQuiet(600).then(ask); else ask();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, right, quiz.done]);

  const question = quiz.questions[shown];
  const options = question?.options ?? [];
  const locked = quiz.done || !!right || sending;

  // Keep the browser focus on the focused option, so an OK that arrives as a click works too.
  useEffect(() => {
    if (!locked) optionRefs.current[focus]?.focus({ preventScroll: true });
  }, [focus, locked, shown]);

  const step = (d: number) => {
    if (locked || !options.length) return;
    setFocus((f) => {
      for (let i = 1; i <= options.length; i++) {
        const n = (f + d * i + options.length * 4) % options.length;
        if (!dimmed.includes(n)) { if (n !== f) sfx.hover(); return n; }
      }
      return f;
    });
  };

  const answer = (pick: number) => {
    if (locked || dimmed.includes(pick) || !question) return;
    setFocus(pick);
    setSending(true);
    api.quiz(state.code, pick)
      .catch(() => sfx.boing())
      .finally(() => setSending(false));
  };

  useRemote({
    up: () => step(-1),
    left: () => step(-1),
    down: () => step(1),
    right: () => step(1),
    ok: () => answer(focus),
  });

  const status = quiz.done && !right ? "done" : right ? "right" : "asking";

  return (
    <div className="memory">
      <MemoryBox opened={opened} total={total} clicked={clicked} open={boxOpen} />

      <section className={`mq-card ${status}`} aria-live="polite">
        <header className="mq-head">
          <span className={`mq-ring ${talking ? "on" : ""} ${status === "right" || status === "done" ? "happy" : ""}`} aria-hidden><i /></span>
          <span className="mq-label">Alexa+ <em>(simulated)</em></span>
          <span className="mq-progress" aria-label={`Question ${Math.min(shown + 1, total)} of ${total}`}>
            <span className="mq-count">{status === "done" ? "All done" : `Question ${Math.min(shown + 1, total)} of ${total}`}</span>
            <span className="mq-pips">
              {Array.from({ length: total }, (_, i) => <i key={i} className={i < opened ? "on" : i === shown ? "now" : ""} />)}
            </span>
          </span>
        </header>

        {status === "done" ? (
          <div className="mq-done">
            <span className="mq-done-icon" aria-hidden>
              <svg viewBox="0 0 48 48" width="96" height="96"><circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="3" /><path d="M14 25l7 7 14-15" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <p>{ALEXA_LINES.memoryDone}</p>
          </div>
        ) : (
          <>
            <h2 className="mq-question" key={`q-${shown}`}>{question?.question ?? "Getting the first question ready..."}</h2>
            <div className="mq-options" role="listbox" key={`o-${shown}`}>
              {options.map((o, i) => {
                const isRight = right?.index === shown && right.picked === i;
                const isWrong = wrong?.picked === i;
                const isDim = dimmed.includes(i);
                const cls = ["mq-option", i === focus && !locked ? "focus" : "", isRight ? "right" : "", isDim ? "dim" : "", isWrong ? "wrong" : "", right && !isRight ? "fade" : ""].join(" ");
                return (
                  <button key={isWrong ? `${i}-${wrong!.at}` : i} ref={(el) => { optionRefs.current[i] = el; }}
                    className={cls} role="option" aria-selected={i === focus} aria-disabled={isDim} tabIndex={0}
                    style={{ animationDelay: `${i * 70}ms` }}
                    onClick={() => pressOk(() => answer(i))}>
                    <span className="mq-letter">{isRight ? <Check /> : LETTERS[i]}</span>
                    <span className="mq-text">{o}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {status !== "done" && (
          <p className="mq-hint">
            <PhoneIcon />
            Pick with the remote, or just tell Alexa on the phone
          </p>
        )}
      </section>
    </div>
  );
}

function useAlexaTalking() {
  const [on, setOn] = useState(speaking() === "alexa");
  useEffect(() => onSpeaking((who) => setOn(who === "alexa")), []);
  return on;
}

function Check() {
  return <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden className="mq-phone">
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10.5 18.5h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M20 8.5q1.6 3.5 0 7M22 6.5q2.6 5.5 0 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

// ---- Grandpa's box, drawn in SVG ----

const DIALS = [
  { cx: 230, locked: -128 },
  { cx: 350, locked: 112 },
  { cx: 470, locked: -64 },
];

function MemoryBox({ opened, total, clicked, open }: { opened: number; total: number; clicked: number | null; open: boolean }) {
  const dials = DIALS.slice(0, Math.max(1, Math.min(3, total)));
  return (
    <div className={`mq-box ${open ? "open" : ""}`} aria-label={open ? "Grandpa's box is open" : `Memory lock: ${opened} of ${total} dials open`}>
      <svg viewBox="0 0 700 600" width="700" height="600">
        <defs>
          <linearGradient id="mq-wood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8a5530" />
            <stop offset="0.5" stopColor="#6a3d1f" />
            <stop offset="1" stopColor="#3f2210" />
          </linearGradient>
          <linearGradient id="mq-wood-top" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5a321a" />
            <stop offset="1" stopColor="#9a6236" />
          </linearGradient>
          <linearGradient id="mq-lid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9c6135" />
            <stop offset="1" stopColor="#5e3519" />
          </linearGradient>
          <linearGradient id="mq-brass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f3d27c" />
            <stop offset="0.45" stopColor="#c8963e" />
            <stop offset="1" stopColor="#7d5520" />
          </linearGradient>
          <linearGradient id="mq-brass-plate" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e9c46e" />
            <stop offset="0.5" stopColor="#c08a36" />
            <stop offset="1" stopColor="#8a6224" />
          </linearGradient>
          <radialGradient id="mq-dial-face" cx="0.38" cy="0.32" r="0.8">
            <stop offset="0" stopColor="#fff1c2" />
            <stop offset="0.35" stopColor="#d9aa52" />
            <stop offset="1" stopColor="#7a5220" />
          </radialGradient>
          <radialGradient id="mq-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff2c4" stopOpacity="0.95" />
            <stop offset="0.4" stopColor="#ffcf6b" stopOpacity="0.45" />
            <stop offset="1" stopColor="#ffb347" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="mq-ray" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#ffe6a3" stopOpacity="0.6" />
            <stop offset="1" stopColor="#ffe6a3" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="mq-star-dark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4a5670" />
            <stop offset="0.55" stopColor="#262e3e" />
            <stop offset="1" stopColor="#151a24" />
          </linearGradient>
          <radialGradient id="mq-velvet" cx="0.5" cy="0" r="1">
            <stop offset="0" stopColor="#5a1622" />
            <stop offset="1" stopColor="#1e060b" />
          </radialGradient>
          <filter id="mq-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
        </defs>

        {/* warm lamp light on the bench and the box's shadow */}
        <ellipse cx="350" cy="574" rx="340" ry="26" fill="#140a04" opacity="0.55" filter="url(#mq-soft)" />

        {/* light from inside, when the box opens */}
        <g className="mq-inner-light">
          <ellipse cx="350" cy="300" rx="330" ry="120" fill="url(#mq-glow)" />
          {[-60, -32, -10, 12, 34, 62].map((a, i) => (
            <path key={i} d="M-26 0 L26 0 L80 -300 L-80 -300Z" fill="url(#mq-ray)" transform={`translate(350 304) rotate(${a})`} opacity={i % 2 ? 0.7 : 1} />
          ))}
        </g>

        {/* body */}
        <rect x="50" y="296" width="600" height="268" rx="12" fill="url(#mq-wood)" stroke="#2c170a" strokeWidth="3" />
        <g stroke="#2b160a" strokeWidth="2" fill="none" opacity="0.28">
          <path d="M60 330 Q200 318 330 334 T640 326" />
          <path d="M60 372 Q170 386 300 370 T640 380" />
          <path d="M60 470 Q220 456 360 474 T640 466" />
          <path d="M60 520 Q180 532 320 518 T640 528" />
          <path d="M80 418 Q110 410 130 420" />
          <path d="M560 430 Q600 420 630 434" />
        </g>
        <rect x="50" y="296" width="600" height="10" fill="#b07a45" opacity="0.5" />
        {/* the opening (velvet), only seen when the lid lifts */}
        <path className="mq-velvet" d="M66 296 L634 296 L612 316 L88 316Z" fill="url(#mq-velvet)" />
        {/* brass corners and feet */}
        {[[50, 296, 1, 1], [650, 296, -1, 1], [50, 564, 1, -1], [650, 564, -1, -1]].map(([x, y, sx, sy], i) => (
          <path key={i} d={`M${x} ${y + sy * 52} V${y} H${x + sx * 52} V${y + sy * 14} H${x + sx * 14} V${y + sy * 52}Z`} fill="url(#mq-brass)" stroke="#5c3d12" strokeWidth="1.5" />
        ))}
        <rect x="64" y="562" width="48" height="14" rx="4" fill="url(#mq-brass)" />
        <rect x="588" y="562" width="48" height="14" rx="4" fill="url(#mq-brass)" />

        {/* the memory lock plate */}
        <g>
          <rect x="146" y="334" width="408" height="206" rx="22" fill="#2a1608" opacity="0.6" transform="translate(4 6)" />
          <rect x="146" y="334" width="408" height="206" rx="22" fill="url(#mq-brass-plate)" stroke="#5c3d12" strokeWidth="3" />
          <rect x="158" y="346" width="384" height="182" rx="16" fill="none" stroke="#fff1c2" strokeOpacity="0.45" strokeWidth="2" />
          {[[166, 354], [534, 354], [166, 520], [534, 520]].map(([x, y], i) => (
            <g key={i}><circle cx={x} cy={y} r="6" fill="#8a6224" /><circle cx={x - 1.5} cy={y - 1.5} r="2.5" fill="#ffe9b0" /></g>
          ))}
          <text x="351" y="525" textAnchor="middle" className="mq-engrave light">REMEMBER THE NIGHT</text>
          <text x="350" y="524" textAnchor="middle" className="mq-engrave">REMEMBER THE NIGHT</text>
        </g>

        {dials.map((d, i) => {
          const isOpen = i < opened;
          return (
            <g key={i} transform={`translate(${d.cx} 440)`} className={`mq-dial ${isOpen ? "open" : ""} ${clicked === i ? "click" : ""}`}>
              {/* the lamp above each dial lights up when it opens */}
              <circle cx="0" cy="-76" r="11" className="mq-lamp-glow" fill="#7dffb0" filter="url(#mq-soft)" />
              <circle cx="0" cy="-76" r="8" className="mq-lamp" stroke="#5c3d12" strokeWidth="2" />
              <path d="M-7 -60 L7 -60 L0 -50Z" fill="#5c3d12" />
              <g className="mq-dial-body">
                <circle r="62" fill="none" />
                <circle r="56" className="mq-dial-ring" fill="none" strokeWidth="5" />
                <circle r="50" fill="#5c3d12" />
                <circle r="49" fill="none" stroke="#a87a32" strokeWidth="7" strokeDasharray="2.6 3.2" />
                <circle r="41" fill="url(#mq-dial-face)" stroke="#6e4a18" strokeWidth="2" />
                {Array.from({ length: 12 }, (_, k) => (
                  <line key={k} x1="0" y1="-38" x2="0" y2={k % 3 === 0 ? -30 : -34} stroke="#5c3d12" strokeWidth={k % 3 === 0 ? 3 : 1.6} transform={`rotate(${k * 30})`} />
                ))}
                <g className="mq-pointer" style={{ ["--locked" as string]: `${d.locked}deg` }}>
                  <circle r="40" fill="none" />
                  <path d="M-6 6 L0 -32 L6 6Z" fill="#3a2410" />
                  <path d="M-3 4 L0 -28 L1 4Z" fill="#e8c46e" opacity="0.6" />
                  <circle r="11" fill="url(#mq-brass)" stroke="#5c3d12" strokeWidth="2" />
                  <circle cx="-3" cy="-3" r="3.5" fill="#fff4cc" opacity="0.8" />
                </g>
              </g>
            </g>
          );
        })}

        {/* the star rises out of the box once it opens: still cold and dark */}
        <g className="mq-star">
          <g transform="translate(350 175)">
            <circle r="90" fill="#9fb4d8" opacity="0.12" filter="url(#mq-soft)" />
            <path d="M0 -78 L20 -26 L76 -24 L32 10 L48 64 L0 32 L-48 64 L-32 10 L-76 -24 L-20 -26Z" fill="url(#mq-star-dark)" stroke="#7d8cab" strokeWidth="4" strokeLinejoin="round" />
            <path d="M0 -60 L13 -24 L0 -6Z" fill="#8a9ab8" opacity="0.35" />
            <circle className="mq-glint" cx="-14" cy="-34" r="4" fill="#dfe8ff" />
          </g>
        </g>

        {/* lid (with the hasp hanging over the lock) */}
        <g className="mq-lid">
          <path d="M80 196 L620 196 L660 240 L40 240Z" fill="url(#mq-wood-top)" stroke="#2c170a" strokeWidth="3" strokeLinejoin="round" />
          <path d="M120 210 Q350 202 580 212" stroke="#2b160a" strokeOpacity="0.3" strokeWidth="2" fill="none" />
          <rect x="40" y="238" width="620" height="64" rx="8" fill="url(#mq-lid)" stroke="#2c170a" strokeWidth="3" />
          <rect x="40" y="290" width="620" height="10" fill="url(#mq-brass)" />
          <ellipse cx="350" cy="266" rx="60" ry="20" fill="url(#mq-brass-plate)" stroke="#5c3d12" strokeWidth="2" />
          <path d="M350 252 l4 9 10 1 -7.5 6.5 2.3 10 -8.8 -5.3 -8.8 5.3 2.3 -10 -7.5 -6.5 10 -1z" fill="#6e4a18" />
          <rect x="324" y="292" width="52" height="52" rx="10" fill="url(#mq-brass)" stroke="#5c3d12" strokeWidth="2" />
          <rect x="342" y="316" width="16" height="20" rx="6" fill="#3a2410" />
        </g>

        <g className="mq-sparkles">
          {[[180, 120], [520, 90], [610, 200], [110, 220], [450, 40], [260, 40]].map(([x, y], i) => (
            <path key={i} d={`M${x} ${y - 10} L${x + 2.5} ${y - 2.5} L${x + 10} ${y} L${x + 2.5} ${y + 2.5} L${x} ${y + 10} L${x - 2.5} ${y + 2.5} L${x - 10} ${y} L${x - 2.5} ${y - 2.5}Z`}
              fill="#fff2c4" style={{ animationDelay: `${0.9 + i * 0.25}s` }} />
          ))}
        </g>
      </svg>
    </div>
  );
}
