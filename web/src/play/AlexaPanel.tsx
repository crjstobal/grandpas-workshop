// The phone as an Echo: tap, speak, and the simulated Alexa+ answers out loud. She reads the
// game through its MCP server, so she knows the chapter, gives hints and keeps Grandpa's secret.
import { useRef, useState } from "react";
import type { AlexaCard } from "../../../shared/types";
import { api } from "../api";
import { AlexaCardView } from "../alexa/AlexaCard";
import { speak, stop } from "../voice";

type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start: () => void; stop: () => void;
};

const SpeechRecognition = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition })
  .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

interface Line { who: "you" | "alexa"; text: string; card?: AlexaCard }

export function AlexaPanel({ code, prompt }: { code: string; prompt: string }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [heard, setHeard] = useState("");
  const [mode, setMode] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [typed, setTyped] = useState("");
  const rec = useRef<Recognition | null>(null);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setLines((l) => [...l, { who: "you", text }]);
    setMode("thinking");
    try {
      const r = await api.alexa(code, text);
      setLines((l) => [...l, { who: "alexa", text: r.text, card: r.card }]);
      setMode("speaking");
      speak("alexa", r.text, { interrupt: true });
      setTimeout(() => setMode((m) => (m === "speaking" ? "idle" : m)), Math.min(12000, 1500 + r.text.length * 60));
    } catch (e) {
      setLines((l) => [...l, { who: "alexa", text: (e as Error).message }]);
      setMode("idle");
    }
  };

  const listen = () => {
    stop();
    if (!SpeechRecognition) return;
    const r = new SpeechRecognition();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = false;
    let final = "";
    r.onresult = (e) => {
      const all = Array.from(e.results).map((x) => x[0].transcript).join(" ");
      setHeard(all);
      if (Array.from(e.results).every((x) => x.isFinal)) final = all;
    };
    r.onend = () => { setHeard(""); if (final) void send(final); else setMode("idle"); };
    r.onerror = () => setMode("idle");
    rec.current = r;
    setMode("listening");
    r.start();
  };

  const shown = lines.slice(-5);

  return (
    <div className="alexa-panel">
      <p className="alexa-prompt">{prompt}</p>
      <button className={`echo ${mode}`} onClick={() => (mode === "listening" ? rec.current?.stop() : listen())}
        disabled={!SpeechRecognition || mode === "thinking"} aria-label="Talk to Alexa">
        <span className="echo-ring" />
        <span className="echo-label">{mode === "listening" ? "Listening..." : mode === "thinking" ? "..." : "Tap to talk"}</span>
      </button>
      {heard && <p className="heard">{heard}</p>}
      <div className="alexa-log">
        {shown.map((l, i) => (
          <div key={lines.length - shown.length + i} className="alexa-turn">
            <p className={l.who}>{l.text}</p>
            {l.card && (
              <div className="alexa-turn-card">
                {/* Only the card on the latest reply takes taps: an older offer or checkout has moved on. */}
                <AlexaCardView card={l.card} size="phone" onAction={i === shown.length - 1 && mode !== "thinking" ? (u) => void send(u) : undefined} />
              </div>
            )}
          </div>
        ))}
      </div>
      <form className="alexa-type" onSubmit={(e) => { e.preventDefault(); void send(typed); setTyped(""); }}>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={SpeechRecognition ? "...or type to Alexa" : "Type to Alexa"} />
        <button disabled={!typed.trim() || mode === "thinking"}>Send</button>
      </form>
    </div>
  );
}
