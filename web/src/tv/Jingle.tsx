// Jingle, Grandpa's clockwork robin, with his speech bubble. Uses the rendered sprites when they
// exist and a drawn stand-in otherwise.
import { useEffect, useState } from "react";
import type { ChapterId, JingleMood } from "../../../shared/types";
import { GARDEN } from "./spots";

// Where Jingle stands in each scene (stage pixels, bottom center of the sprite) and his size.
// On the workbench he sits on his brass perch: the sprites are rendered with that scene's camera,
// so the 1024px PNG drawn at 328x328 from (1008, 450) lines up exactly.
// (The workbench perch, for scenes rendered with the workbench camera: 328x328 from (1008, 450).)
// In the garden he sits on the workshop's snowy window ledge, with sprites rendered from that camera.
const LEDGE = { x: GARDEN.sprite.x + GARDEN.sprite.size / 2, y: GARDEN.sprite.y + GARDEN.sprite.size, size: GARDEN.sprite.size };
const GARDEN_CHAPTERS: ChapterId[] = ["wind_jingle", "warm_jingle"];
const SPOTS: Partial<Record<ChapterId, { x: number; y: number; size: number }>> = {
  wind_jingle: LEDGE,
  warm_jingle: LEDGE,
};
const DEFAULT_SPOT = { x: 1640, y: 780, size: 300 };

export function Jingle({ mood, line, at, chapter, shake }: { mood: JingleMood; line: string; at: number; chapter: ChapterId; shake?: number }) {
  const spot = SPOTS[chapter] ?? DEFAULT_SPOT;
  const pose = mood === "sleep" ? "sleep" : mood === "cold" ? "cold" : "awake";
  const sprite = GARDEN_CHAPTERS.includes(chapter) ? `/scenes/garden_jingle_${pose}.png` : `/scenes/jingle_${pose}.png`;
  const [hasSprite, setHasSprite] = useState(true);
  const [bounce, setBounce] = useState(false);
  const [jiggle, setJiggle] = useState(false);
  useEffect(() => {
    setBounce(true);
    const t = setTimeout(() => setBounce(false), 700);
    return () => clearTimeout(t);
  }, [at]);
  // Every shake from a phone turns his key a notch: he jiggles and throws off a spark.
  useEffect(() => {
    if (!shake) return;
    setJiggle(true);
    const t = setTimeout(() => setJiggle(false), 260);
    return () => clearTimeout(t);
  }, [shake]);

  return (
    <div className={`jingle ${mood} ${bounce ? "bounce" : ""} ${jiggle ? "jiggle" : ""}`} style={{ left: spot.x - spot.size / 2, top: spot.y - spot.size, width: spot.size, height: spot.size }}>
      {hasSprite
        ? <img src={sprite} alt="Jingle" onError={() => setHasSprite(false)} />
        : <JingleDrawing mood={mood} />}
      {line && mood !== "sleep" && <div className={`bubble ${spot.x > 1300 ? "left" : "right"}`} key={at}>{line}</div>}
      {mood === "sleep" && <div className="zzz">z z z</div>}
      {jiggle && <div className="sparks" key={`s${shake}`}><i /><i /><i /><i /><i /></div>}
    </div>
  );
}

function JingleDrawing({ mood }: { mood: JingleMood }) {
  const eyes = mood === "sleep" ? "M70 78 q8 6 16 0 M112 78 q8 6 16 0" : "";
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden>
      <ellipse cx="100" cy="182" rx="60" ry="8" fill="#0005" />
      <path d="M40 120 q-30 -10 -28 -40 q25 10 40 25z" fill="#9a6b2f" />
      <ellipse cx="100" cy="115" rx="62" ry="58" fill="#c8963e" />
      <ellipse cx="100" cy="128" rx="40" ry="38" fill={mood === "cold" ? "#8fb3d9" : "#d9603b"} />
      <circle cx="100" cy="70" r="40" fill="#c8963e" />
      {eyes ? <path d={eyes} stroke="#2b1d14" strokeWidth="5" fill="none" strokeLinecap="round" />
        : <><circle cx="80" cy="70" r="11" fill="#f6ecd9" /><circle cx="120" cy="70" r="11" fill="#f6ecd9" />
          <circle cx="82" cy="72" r="5" fill="#2b1d14" /><circle cx="122" cy="72" r="5" fill="#2b1d14" /></>}
      <path d="M93 86 l7 10 l7 -10z" fill="#e8b04a" />
      <rect x="155" y="95" width="8" height="30" fill="#7a5a2a" />
      <circle cx="168" cy="92" r="10" fill="none" stroke="#7a5a2a" strokeWidth="6" />
      <circle cx="168" cy="128" r="10" fill="none" stroke="#7a5a2a" strokeWidth="6" />
      <path d="M80 170 v12 M120 170 v12" stroke="#7a5a2a" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}
