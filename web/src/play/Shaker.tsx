// Shaking the phone: the motion sensor turns shakes into energy, and every phone in the room adds
// up. It winds Jingle's key, shakes starlight loose, and sends Jingle a warm wind while he flies.
// A tap button covers devices without a motion sensor.
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { sfx, unlockAudio } from "../sfx";

type MotionPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

type Mode = "wind" | "starlight" | "flight";

const COPY: Record<Mode, { title: string; text: string; tap: string }> = {
  wind: { title: "Wake up Jingle!", text: "Shake your phone to wind Jingle's key. Everyone at the same time!", tap: "Tap here to wind the key" },
  starlight: { title: "Shake down the starlight!", text: "Every shake makes sparkles fall on the TV. Jingle catches them!", tap: "Tap here for sparkles" },
  flight: { title: "Send a warm wind!", text: "Jingle is flying to the roof. Shake your phone to give him a warm gust!", tap: "Tap here for a warm wind" },
};

/** meter: 0..100 shown under the key (wind, starlight caught, distance flown). */
export function Shaker({ code, playerId, meter, mode = "wind" }: { code: string; playerId: string; meter: number; mode?: Mode }) {
  const send = (e: number) => api.shake(code, playerId, e);
  const [listening, setListening] = useState(false);
  const [denied, setDenied] = useState(false);
  const energy = useRef(0);
  const [pulse, setPulse] = useState(0);

  const start = async () => {
    unlockAudio();
    const DME = (window as unknown as { DeviceMotionEvent?: MotionPermission }).DeviceMotionEvent;
    try {
      if (DME?.requestPermission && (await DME.requestPermission()) !== "granted") { setDenied(true); return; }
      setListening(true);
    } catch { setDenied(true); }
  };

  useEffect(() => {
    if (!listening) return;
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.acceleration?.x != null ? e.acceleration : null;
      const g = e.accelerationIncludingGravity;
      const m = a ? Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0) : Math.abs(Math.hypot(g?.x ?? 0, g?.y ?? 0, g?.z ?? 0) - 9.81);
      if (m > 12) energy.current += Math.min(1, (m - 12) / 18);
    };
    window.addEventListener("devicemotion", onMotion);
    // Send what was shaken a few times a second, not on every sensor event.
    const t = setInterval(() => {
      if (energy.current < 0.15) return;
      const e = Math.min(1, energy.current);
      energy.current = 0;
      setPulse((p) => p + 1);
      navigator.vibrate?.([20, 30, 20]);
      if (mode !== "wind") sfx.tinkle(); else if (e > 0.6) sfx.wind(); else sfx.ratchet();
      void send(e).catch(() => {});
    }, 280);
    return () => { window.removeEventListener("devicemotion", onMotion); clearInterval(t); };
  }, [listening, code, playerId]);

  const tap = () => {
    unlockAudio();
    if (mode !== "wind") sfx.tinkle(); else sfx.ratchet();
    navigator.vibrate?.(20);
    setPulse((p) => p + 1);
    void send(0.5).catch(() => {});
  };

  return (
    <div className="shaker">
      <h2>{COPY[mode].title}</h2>
      <p>{COPY[mode].text}</p>
      <div className={`wind-key-phone ${pulse % 2 ? "pulse-a" : "pulse-b"}`} style={{ transform: `rotate(${pulse * 36}deg)` }} aria-hidden>
        <svg viewBox="0 0 100 100" width="140" height="140">
          <circle cx="50" cy="28" r="18" fill="none" stroke="#c8963e" strokeWidth="9" />
          <circle cx="50" cy="72" r="18" fill="none" stroke="#c8963e" strokeWidth="9" />
          <rect x="44" y="40" width="12" height="20" fill="#c8963e" />
        </svg>
      </div>
      <div className="wind-bar"><div style={{ width: `${meter}%` }} /></div>
      {!listening && !denied && <button className="big" onClick={start}>I'm ready to shake</button>}
      {(listening || denied) && <button className="ghost-btn" onClick={tap}>{denied ? COPY[mode].tap : "No luck shaking? Tap here"}</button>}
    </div>
  );
}
