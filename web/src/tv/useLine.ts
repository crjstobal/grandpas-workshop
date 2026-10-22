// How long one of Jingle's lines stays on screen: at least a few seconds, all the while his voice
// is saying it (a line can wait in the voice queue behind the narrator), and a moment after.
import { useEffect, useState } from "react";
import { onSpeaking, speaking } from "../voice";

const MIN_MS = 6000;
const AFTER_MS = 3000;

export function useLineVisible(at: number | undefined) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (at === undefined) return;
    setVisible(true);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let minDone = false;
    let talking = speaking() === "jingle";
    let spoke = talking;
    const hideLater = (ms: number) => { if (timer) clearTimeout(timer); timer = setTimeout(() => setVisible(false), ms); };
    const settle = () => { if (minDone && !talking) hideLater(spoke ? AFTER_MS : 2500); };
    const min = setTimeout(() => { minDone = true; settle(); }, MIN_MS);
    const off = onSpeaking((who) => {
      if (who === "jingle") { talking = true; spoke = true; if (timer) clearTimeout(timer); setVisible(true); return; }
      if (talking) { talking = false; settle(); }
    });
    return () => { off(); clearTimeout(min); if (timer) clearTimeout(timer); };
  }, [at]);
  return visible;
}
