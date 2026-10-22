// Grandpa's four-wheel combination lock, played with the D-pad: left/right picks a wheel,
// up/down turns it, OK tries the number.
import { useEffect, useState } from "react";
import { api } from "../api";
import { sfx } from "../sfx";
import { useRemote } from "./remote";

export function ComboLock({ code, onError, onClose }: { code: string; onError: (e: unknown) => void; onClose: () => void }) {
  const [digits, setDigits] = useState([0, 0, 0, 0]);
  const [at, setAt] = useState(0);
  const [shake, setShake] = useState(false);

  const turnWheel = (w: number, d: number) => { sfx.tick(); setDigits((x) => x.map((v, i) => (i === w ? (v + d + 10) % 10 : v))); };
  const turn = (d: number) => turnWheel(at, d);
  const tryOpen = () => api.drawer(code, digits.join("")).then(({ done: open }) => {
    if (open) { sfx.unlock(); return; }
    sfx.boing();
    setShake(true); setTimeout(() => setShake(false), 600);
  }).catch(onError);
  // The remote's Back button (Escape in the WebView) steps back out to the shelf.
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (["Escape", "Backspace", "GoBack", "BrowserBack"].includes(e.key) || e.keyCode === 27) { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onClose]);
  useRemote({
    left: () => setAt((a) => Math.max(0, a - 1)),
    right: () => setAt((a) => Math.min(3, a + 1)),
    up: () => turn(1),
    down: () => turn(-1),
    ok: () => void tryOpen(),
  });

  return (
    <div className={`combo ${shake ? "nope" : ""}`}>
      <div className="wheels">
        {digits.map((d, i) => (
          <div key={i} className={`wheel ${i === at ? "focus" : ""}`} onClick={() => setAt(i)}>
            {/* pointer remotes: click the number above or below to turn the wheel */}
            <span className="ghost" onClick={() => { setAt(i); turnWheel(i, -1); }}>{(d + 9) % 10}</span>
            <span className="digit">{d}</span>
            <span className="ghost" onClick={() => { setAt(i); turnWheel(i, 1); }}>{(d + 1) % 10}</span>
          </div>
        ))}
      </div>
      <button className="combo-open" onClick={() => void tryOpen()}>Open</button>
      <p className="combo-help">Arrows turn the wheels · OK opens · Back to look around</p>
    </div>
  );
}
