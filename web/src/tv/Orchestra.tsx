// The toy orchestra: Grandpa's toys play a tune, then the family flies Jingle to each toy in the
// same order. Three tunes, each one note longer. A slip just means listening again.
import { useEffect, useMemo, useRef, useState } from "react";
import { ORCHESTRA_ROUNDS } from "../../../shared/story";
import type { PublicState } from "../../../shared/types";
import { api } from "../api";
import { sfx, playNote } from "../sfx";
import { Hand, type Hotspot } from "./Hand";
import { speak } from "../voice";

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

  // The toys play the tune, one glowing toy at a time.
  useEffect(() => {
    if (done) return;
    setPhase("listen");
    setStep(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const start = replay === 0 && round === 1 ? 5200 : 1600;
    notes.forEach((t, i) => {
      timers.push(setTimeout(() => { setGlow(t.id); playToy(t); }, start + i * 850));
      timers.push(setTimeout(() => setGlow(null), start + i * 850 + 600));
    });
    timers.push(setTimeout(() => { setPhase("play"); speak("jingle", "Your turn!"); }, start + notes.length * 850 + 200));
    return () => timers.forEach(clearTimeout);
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
        <em>{done ? "Bravo!" : phase === "listen" ? "Listen..." : `Your turn: ${step} of ${notes.length}`}</em>
      </div>
      <Hand hotspots={TOYS} glow={glow} onPick={pick} bubble={bubble} start={{ x: 960, y: 420 }}
        help={phase === "listen" ? "Watch which toys play" : "Fly to each toy in order · OK"} />
    </>
  );
}

function playToy(t: Toy) {
  playNote(t.note);
  sfx[t.sound]();
}
