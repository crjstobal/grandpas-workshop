// The toy orchestra: Grandpa's toys play a tune, then the family flies Jingle to each toy in the
// same order. Three tunes, each one note longer. A slip just means listening again.
import { useEffect, useMemo, useRef, useState } from "react";
import { ORCHESTRA_ROUNDS } from "../../../shared/story";
import type { PublicState } from "../../../shared/types";
import { api } from "../api";
import { sfx, playNote } from "../sfx";
import { Hand, type Hotspot } from "./Hand";
import { speak, whenQuiet } from "../voice";

interface Toy extends Hotspot { note: number; sound: "drum" | "toot" | "whirr" | "chime" | "knock" }

// Each toy has its own sound and its own note of the scale, so the tune can be heard and seen.
const TOYS: Toy[] = [
  { id: "nutcracker", x: 483, y: 170, r: 80, label: "Nutcracker", note: 0, sound: "knock" },
  { id: "house", x: 1152, y: 235, r: 80, label: "Toy house", note: 4, sound: "chime" },
  { id: "train", x: 610, y: 555, r: 110, label: "Toy train", note: 7, sound: "toot" },
  { id: "top", x: 1172, y: 570, r: 70, label: "Spinning top", note: 9, sound: "whirr" },
  { id: "drum", x: 1305, y: 578, r: 80, label: "Drum", note: 12, sound: "drum" },
];

function tune(round: number, seed: number) {
  let x = seed + round * 7919;
  const rnd = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const out: Toy[] = [];
  while (out.length < round + 2) {
    const t = TOYS[Math.floor(rnd() * TOYS.length)];
    if (out.at(-1)?.id !== t.id) out.push(t);
  }
  return out;
}

export function Orchestra({ state, bubble, onSay }: { state: PublicState; bubble: { line: string; at: number } | null; onSay: (line: string) => void }) {
  const round = state.orchestraRound + 1;
  const done = state.orchestraRound >= ORCHESTRA_ROUNDS;
  const seed = useRef(Math.floor(Math.random() * 100000)).current;
  const notes = useMemo(() => tune(round, seed), [round, seed]);
  const [phase, setPhase] = useState<"listen" | "play">("listen");
  const [glow, setGlow] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [replay, setReplay] = useState(0);
  const [count, setCount] = useState(0);

  // First everyone stops talking, then "Listen carefully... 3, 2, 1", then the toys play the tune,
  // one glowing toy at a time. Nothing else makes a sound while they play.
  useEffect(() => {
    if (done) return;
    setPhase("listen");
    setStep(0);
    setGlow(null);
    setCount(0);
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) => new Promise<void>((r) => timers.push(setTimeout(r, ms)));
    (async () => {
      await whenQuiet(700);
      for (const c of [3, 2, 1]) {
        if (cancelled) return;
        setCount(c);
        sfx.tick();
        await wait(800);
      }
      if (cancelled) return;
      setCount(0);
      await wait(400);
      for (const t of notes) {
        if (cancelled) return;
        setGlow(t.id); playToy(t);
        await wait(600);
        setGlow(null);
        await wait(300);
      }
      if (cancelled) return;
      await wait(300);
      setPhase("play");
      speak("jingle", "Your turn!");
    })();
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [notes, replay, done, round]);

  const pick = (h: Hotspot | null) => {
    if (!h || done) return;
    const toy = TOYS.find((t) => t.id === h.id)!;
    if (phase === "listen") { onSay("Shh! Listen to the toys first."); return; }
    playToy(toy);
    setGlow(toy.id);
    setTimeout(() => setGlow(null), 300);
    if (toy.id !== notes[step].id) {
      sfx.boing();
      onSay("Oops! That's not it. Listen again...");
      setReplay((r) => r + 1);
      return;
    }
    if (step + 1 < notes.length) { setStep(step + 1); return; }
    sfx.chime();
    setPhase("listen");
    api.orchestra(state.code, round).catch(() => {});
  };

  return (
    <>
      <div className="orchestra-meter">
        {Array.from({ length: ORCHESTRA_ROUNDS }, (_, i) => <span key={i} className={i < state.orchestraRound ? "on" : ""}>♪</span>)}
        <em>{done ? "Bravo!" : phase === "listen" ? "Listen carefully..." : `Your turn: ${step} of ${notes.length}`}</em>
      </div>
      {count > 0 && (
        <div className="orch-count" key={count}>
          <span>Listen carefully</span>
          <strong>{count}</strong>
        </div>
      )}
      {/* while the toys play, nothing else on screen: no bubble, no help line */}
      <Hand hotspots={TOYS} glow={glow} onPick={pick} bubble={phase === "play" ? bubble : null} start={{ x: 960, y: 420 }} hoverGlow={phase === "play"}
        help={phase === "play" ? "Fly to each toy in order · OK" : undefined} />
    </>
  );
}

function playToy(t: Toy) {
  playNote(t.note);
  sfx[t.sound]();
}
