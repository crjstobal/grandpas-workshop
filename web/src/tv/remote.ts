// Fire TV remote input. In the Vega WebView the D-pad arrives as arrow keys and the select
// button as Enter; a desktop browser behaves the same with the keyboard.
import { useEffect, useState } from "react";

export interface RemoteHandlers {
  ok?: () => void;
  left?: () => void;
  right?: () => void;
  up?: () => void;
  down?: () => void;
}

// Every way a remote's OK can show up in a WebView: Enter and the D-pad center (keyCode 23,
// "Select"/"Accept"). Play/pause pauses the voices instead (see TvApp).
const OK_KEYS = new Set(["Enter", "NumpadEnter", " ", "Select", "Accept"]);
const OK_CODES = new Set([13, 23, 66]);
let lastOk = 0;

/** Runs the OK handler at most once per press, whichever events the device sends for it. */
export function pressOk(fn?: () => void) {
  const now = Date.now();
  if (!fn || now - lastOk < 500) return;
  lastOk = now;
  fn();
}

export function useRemote(h: RemoteHandlers, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (OK_KEYS.has(e.key) || OK_CODES.has(e.keyCode)) {
        e.preventDefault();
        pressOk(h.ok);
        return;
      }
      const fn = { ArrowLeft: h.left, ArrowRight: h.right, ArrowUp: h.up, ArrowDown: h.down }[e.key];
      if (fn) { e.preventDefault(); fn(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
}

/** The TV layout is a fixed 1920x1080 stage, scaled to whatever the screen is. */
export function useStageScale() {
  const get = () => Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  const [s, setS] = useState(get);
  useEffect(() => {
    const on = () => setS(get());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return s;
}
