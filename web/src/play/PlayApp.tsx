// The phone: joins the family's game by QR code and becomes whatever tool the chapter needs.
// One phone can hold several players (kids rarely have their own), so the phone keeps a device
// id and every player on it; in turn chapters it tells you whose go it is and who to pass it to.
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { chapterOf } from "../../../shared/story";
import type { Player, PublicState } from "../../../shared/types";
import { api, useRoom } from "../api";
import { unlockAudio } from "../sfx";
import { Scanner } from "./Scanner";
import { Shaker } from "./Shaker";
import { Viewer3D } from "./Viewer3D";
import { AlexaPanel } from "./AlexaPanel";
import { ChristmasCard } from "./ChristmasCard";
import { BalanceGlobe } from "./BalanceGlobe";
import { DancePhone } from "./DancePhone";
import { Gingerbread } from "./Gingerbread";
import { ApprovePurchase } from "./ApprovePurchase";

function deviceId() {
  try {
    let id = localStorage.getItem("gw-device");
    if (!id) { id = crypto.randomUUID?.() ?? `d${Math.random().toString(36).slice(2)}${Date.now()}`; localStorage.setItem("gw-device", id); }
    return id;
  } catch {
    // Private mode: one id per page load is still fine for one game.
    return (window as unknown as { __gwDevice?: string }).__gwDevice ??= `d${Math.random().toString(36).slice(2)}`;
  }
}

export default function PlayApp() {
  const code = (useParams().code ?? "").toUpperCase();
  const device = useMemo(deviceId, []);
  const { state, error } = useRoom(code);
  const [alexaOpen, setAlexaOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const mine = state?.players.filter((p) => p.deviceId === device) ?? [];
  const turnPlayer = state?.turn ? state.players.find((p) => p.id === state.turn!.playerId) ?? null : null;
  const myTurn = !!turnPlayer && turnPlayer.deviceId === device;
  // Who is holding the phone: the turn player when it's their go, else the one picked in the header.
  const active = (myTurn ? turnPlayer : mine.find((p) => p.id === activeId)) ?? mine[0] ?? null;
  const grownUp = mine.find((p) => p.grownUp) ?? null;

  useEffect(() => { if (myTurn && turnPlayer) setActiveId(turnPlayer.id); }, [myTurn, turnPlayer?.id]);
  // The grown-up can skip a puzzle; with no grown-up in the game, anyone can.
  const skipper = grownUp ?? (state && !state.players.some((p) => p.grownUp) ? active : null);

  if (!state) return <div className="phone center"><p>{error ?? "Finding the workshop..."}</p></div>;
  if (!mine.length || adding) {
    return <Join code={code} device={device} first={!mine.length} anyGrownUp={state.players.some((p) => p.grownUp)}
      onDone={() => setAdding(false)} onCancel={mine.length ? () => setAdding(false) : undefined} />;
  }

  const ch = chapterOf(state.chapter);
  return (
    <div className="phone" onPointerDown={unlockAudio}>
      <header className="phone-head">
        <div className="who-chips">
          {mine.map((p) => (
            <button key={p.id} className={`chip ${active?.id === p.id ? "on" : ""}`} onClick={() => setActiveId(p.id)} disabled={myTurn && p.id !== turnPlayer?.id}>
              <span className="dot" style={{ background: p.color }} />{p.name}
            </button>
          ))}
          {mine.length < 4 && <button className="chip add" onClick={() => setAdding(true)} aria-label="Add a player on this phone">+</button>}
        </div>
        <button className="alexa-mini" onClick={() => setAlexaOpen(true)} aria-label="Talk to Alexa"><span /></button>
      </header>
      <div className="phone-chapter">{ch.title}</div>
      <main className="phone-body">
        {ch.turns && state.turn && !myTurn
          ? <OtherTurn state={state} player={turnPlayer} />
          : <Task state={state} me={active!} mine={mine} myTurn={myTurn} />}
      </main>
      {skipper && !["lobby", "message", "workshop", "finale"].includes(state.chapter) && (
        <SkipPuzzle key={state.chapter} code={code} playerId={skipper.id} />
      )}
      {alexaOpen && (
        <div className="sheet" onClick={(e) => e.target === e.currentTarget && setAlexaOpen(false)}>
          <div className="sheet-card">
            <button className="close" onClick={() => setAlexaOpen(false)} aria-label="Close">×</button>
            <AlexaPanel code={code} prompt={state.chapter === "memory" ? "Tell Alexa your answer." : "Stuck? Ask Alexa for a hint."} />
          </div>
        </div>
      )}
      {grownUp && state.checkout?.status === "awaiting_grown_up" && <ApprovePurchase state={state} code={code} grownUp={grownUp} />}
    </div>
  );
}

function Join({ code, device, first, anyGrownUp, onDone, onCancel }: {
  code: string; device: string; first: boolean; anyGrownUp: boolean; onDone: () => void; onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [grownUp, setGrownUp] = useState(!anyGrownUp && first);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try { await api.join(code, name, device, grownUp); setName(""); onDone(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="phone center join">
      <span className="eyebrow">Workshop {code}</span>
      <h1>{first ? "Grandpa's Workshop" : "Who else is playing?"}</h1>
      <p>{first ? "What should Jingle call you?" : "Kids can share this phone. Add them one by one."}</p>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" maxLength={20} autoFocus
        onKeyDown={(e) => e.key === "Enter" && name.trim() && go()} />
      {!anyGrownUp && (
        <label className="check">
          <input type="checkbox" checked={grownUp} onChange={(e) => setGrownUp(e.target.checked)} />
          <span>I'm a grown-up (I approve purchases)</span>
        </label>
      )}
      <button className="big" disabled={!name.trim() || busy} onClick={go}>{first ? "Join the family" : "Add to this phone"}</button>
      {onCancel && <button className="ghost-btn" onClick={onCancel}>Done adding players</button>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}

function OtherTurn({ state, player }: { state: PublicState; player: Player | null }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="wait turn-wait">
      <span className="turn-dot" style={{ background: player?.color }} />
      <h2>It's {player?.name ?? "someone"}'s turn</h2>
      <p>{player?.name} is playing on another phone. Cheer them on!</p>
      <button className="ghost-btn" disabled={busy} onClick={() => { setBusy(true); api.skipTurn(state.code).finally(() => setBusy(false)); }}>
        {player?.name} is not here? Skip
      </button>
    </div>
  );
}

function TurnBanner({ me, n }: { me: Player; n: number }) {
  return <div className="turn-banner" key={n}><span className="dot" style={{ background: me.color }} />{me.name}'s turn!</div>;
}

function Task({ state, me, mine, myTurn }: { state: PublicState; me: Player; mine: Player[]; myTurn: boolean }) {
  const code = state.code;
  const banner = myTurn && mine.length > 1 && state.turn ? <TurnBanner me={me} n={state.turn.n} /> : null;
  switch (state.chapter) {
    case "lobby":
      return <PhoneLobby state={state} mine={mine} />;
    case "message":
      return <Wait title="A message from Grandpa" text="Listen to the TV. Then press OK on the remote." />;
    case "wind_jingle":
      return <Shaker code={code} playerId={me.id} meter={state.wind} mode="wind" />;
    case "warm_jingle":
      return <>{banner}<Scanner key={state.turn?.n} code={code} playerId={me.id} kind="warm" title={`Something warm, ${me.name}`}
        text="Find something warm or cosy at home and take a photo of it. Then carry it to Jingle on the TV with the remote."
        found={state.warmFinds.filter((f) => f.playerId === me.id).map((f) => f.label)} /></>;
    case "door_key":
      return state.key
        ? <Viewer3D model="key" drawing={state.key.imageUrl} caption={state.doorOpen ? "It worked! The door is open." : "Your family's key! Now carry it to the lock on the TV with the remote."} />
        : <Scanner code={code} playerId={me.id} kind="key" title="Draw a key" text="Draw any key you like on a piece of paper. Big and bold works best. Then scan it." />;
    case "workshop":
      return <Wait title="The Star Machine" text="Three pieces are missing. Look at the TV, then press OK on the remote." />;
    case "drawer":
      return <Viewer3D model="key" drawing={state.key?.imageUrl ?? null} caption="Spin the key! Grandpa engraved four toys on the back. Find their numbers on the TV, in this order." />;
    case "globe":
      return state.turn && myTurn
        ? <>{banner}<BalanceGlobe key={state.turn.n} state={state} code={code} player={me} /></>
        : <Wait title="The heart gear" text={state.pieces.gear ? "The heart gear is out! Look at the TV." : "Look at the TV."} />;
    case "orchestra":
      return <Wait title="The toy orchestra" text="Watch and listen: the toys on the TV play Grandpa's song. Help the pilot remember the order!" />;
    case "record":
      return state.recordPlaying
        ? <DancePhone state={state} code={code} playerId={me.id} />
        : <Wait title="A new record" text="Jingle is carrying the record to the gramophone. Get ready to dance!" />;
    case "ornaments": {
      const mineOrn = [...state.ornaments].reverse().find((o) => o.playerId === me.id);
      const left = state.ornamentsNeeded - state.ornaments.length;
      if (left <= 0) return <Wait title="Grandpa's tree" text="Hang the ornaments on the tree with the remote!" />;
      return mineOrn && !myTurn
        ? <Viewer3D model="ornament" drawing={mineOrn.imageUrl} caption="Your ornament is waiting on the TV: hang it on the tree with the remote!" />
        : <>{banner}<Scanner key={state.turn?.n} code={code} playerId={me.id} kind="ornament" title={`An ornament, ${me.name}`} text="Draw a bauble, a star, a bell, anything you would hang on a Christmas tree. Then scan it." /></>;
    }
    case "memory": {
      const q = state.quiz.questions[state.quiz.index];
      return (
        <div className="memory-phone">
          {q && !state.quiz.done && <div className="memory-q"><span>Question {state.quiz.index + 1} of {state.quiz.questions.length}</span><p>{q.question}</p></div>}
          <AlexaPanel code={code} prompt={state.quiz.done ? "The box is open!" : "Say the answer to Alexa, or pick it on the TV with the remote."} />
        </div>
      );
    }
    case "starlight":
      return <Shaker code={code} playerId={me.id} meter={Math.round((state.starlight / state.starlightNeeded) * 100)} mode="starlight" />;
    case "flight":
      return <Shaker code={code} playerId={me.id} meter={Math.round(state.flight.progress * 100)} mode="flight" />;
    case "finale":
      if (state.finale === "cookie") return <Gingerbread state={state} code={code} playerId={me.id} />;
      if (state.finale === "arrival") return <Wait title="Look at the TV!" text="The star is shining. Something is coming through the snow..." />;
      if (state.finale === "store") return (
        <div className="memory-phone">
          <ChristmasCard state={state} />
          <AlexaPanel code={code} prompt='Want another adventure? Try: "Alexa, tell me about the Snowed-In Sleigh."' />
        </div>
      );
      return <ChristmasCard state={state} />;
  }
}

function PhoneLobby({ state, mine }: { state: PublicState; mine: Player[] }) {
  const [busy, setBusy] = useState(false);
  const device = mine[0]?.deviceId ?? "";
  return (
    <div className="wait">
      <h2>You're in!</h2>
      <p>Playing on this phone:</p>
      <ul className="phone-players">
        {mine.map((p) => (
          <li key={p.id}>
            <span className="dot" style={{ background: p.color }} />{p.name}{p.grownUp && <em> (grown-up)</em>}
            <button className="x" disabled={busy} aria-label={`Remove ${p.name}`}
              onClick={() => { setBusy(true); api.leave(state.code, p.id, device).finally(() => setBusy(false)); }}>×</button>
          </li>
        ))}
      </ul>
      <p className="muted">Tap + at the top to add someone who shares this phone. When everyone is in, press OK on the TV remote.</p>
    </div>
  );
}

function Wait({ title, text }: { title: string; text: string }) {
  return (
    <div className="wait">
      <h2>{title}</h2>
      <p>{text}</p>
      <div className="tv-hint" aria-hidden><svg viewBox="0 0 48 36" width="72" height="54"><rect x="2" y="2" width="44" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="3" /><path d="M16 34h16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></div>
    </div>
  );
}

/** For the grown-up: skip a puzzle that won't work out (two taps, so a kid can't do it by accident). */
function SkipPuzzle({ code, playerId }: { code: string; playerId: string }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  const tap = () => {
    if (busy) return;
    if (!armed) { setArmed(true); return; }
    setBusy(true);
    api.skip(code, playerId).catch(() => setBusy(false));
  };
  return (
    <button className={`skip-puzzle ${armed ? "armed" : ""}`} onClick={tap} disabled={busy}>
      {busy ? "Skipping..." : armed ? "Tap again to skip this puzzle" : "Grown-ups: skip this puzzle"}
    </button>
  );
}
