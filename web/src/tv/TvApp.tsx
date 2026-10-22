// The TV: tells the story, shows what everyone is doing, and is played with the Fire TV remote.
// Phones bring things into the game (drawings, photos, shakes, Alexa); the TV is where the
// family uses them. Once Jingle is warm he is the pointer: the arrows fly him, OK makes him use
// whatever he is over. Every chapter is a step towards lighting Grandpa's star, so his train can
// find its way home through the blizzard.
import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ALEXA_LINES, CHAPTER_COUNT, CHAPTERS, GRANDPA, chapterNumber, chapterOf } from "../../../shared/story";
import type { Find, PublicState } from "../../../shared/types";
import { api, useRoom } from "../api";
import { onLine, speak, stop, togglePause } from "../voice";
import { backgroundMusic, musicBox } from "../music";
import { sfx } from "../sfx";
import { Jingle } from "./Jingle";
import { Scene } from "./Scene";
import { ComboLock } from "./ComboLock";
import { Hand, type Hotspot } from "./Hand";
import { Orchestra } from "./Orchestra";
import { Starlight } from "./Starlight";
import { GlobeTv } from "./GlobeTv";
import { DanceTv } from "./DanceTv";
import { Flight } from "./Flight";
import { GingerbreadTv } from "./GingerbreadTv";
import { MemoryQuiz } from "./MemoryQuiz";
import { Store } from "./Store";
import { AlexaOverlay } from "./AlexaOverlay";
import { AlexaCardView } from "../alexa/AlexaCard";
import { DOOR, HOOKS, PHONOGRAPH, SHELF, GARDEN, type FunSpot } from "./spots";
import { pressOk, useRemote, useStageScale } from "./remote";
import { flySprite, setScarf } from "./look";
import { AppstoreDialogHost, usePurchaseDialogOpen } from "./AppstoreDialog";
import { buy, hasAppstore } from "../store";
import { DRAWER_TOYS, PRODUCTS } from "../../../shared/story";

const HELP = "Arrows fly Jingle · OK picks";
/** How long the family has to decorate the gingerbread before Grandpa takes it anyway. */
const COOKIE_MS = 150_000;

export default function TvApp() {
  const [room, setRoom] = useState<{ code: string; joinUrl: string } | null>(null);
  const [qr, setQr] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const { state } = useRoom(room?.code ?? null);
  const scale = useStageScale();
  // What only the TV needs to know: what Jingle carries and which overlays are open.
  const [carry, setCarry] = useState<string | null>(null);
  const [lockOpen, setLockOpen] = useState(false);
  /** Drawer toys Jingle has looked under (the numbers stay on the shelf as brass tags). */
  const [found, setFound] = useState<string[]>([]);
  useEffect(() => { if (state?.chapter !== "drawer") setFound([]); }, [state?.chapter]);
  const [localJingle, setLocalJingle] = useState<{ line: string; at: number } | null>(null);
  const [poke, setPoke] = useState<{ x: number; y: number; at: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // One room per TV session (React's development mode runs effects twice).
  const creating = useRef(false);
  useEffect(() => {
    const saved = new URLSearchParams(location.search).get("room");
    if (saved) {
      setRoom({ code: saved, joinUrl: `${location.origin}/play/${saved}` });
      return;
    }
    if (creating.current) return;
    creating.current = true;
    // A reload (or the Fire TV app reopening) picks the game up where it was, if the server still
    // has it and it isn't over. ?new starts a fresh one.
    const last = readSavedRoom();
    const fresh = () => api.createRoom().then((r) => { saveRoom(r.code); setRoom(r); });
    if (last && !new URLSearchParams(location.search).has("new")) {
      api.getRoom(last)
        .then((st) => (st.chapter === "finale" ? fresh() : setRoom({ code: last, joinUrl: `${location.origin}/play/${last}` })))
        .catch(() => fresh())
        .catch((e) => setFlash(e.message));
    } else {
      fresh().catch((e) => setFlash(e.message));
    }
  }, []);

  useEffect(() => {
    if (room) QRCode.toDataURL(room.joinUrl, { margin: 1, width: 520, color: { dark: "#1b2433", light: "#f6ecd9" } }).then(setQr);
  }, [room]);

  useEffect(() => { setCarry(null); setLockOpen(false); }, [state?.chapter]);
  // Background music everywhere except the chapters that have their own (the toys' melodies to
  // remember, Grandpa's record and the dance, the finale's music box).
  useEffect(() => {
    if (!state) return;
    if (["orchestra", "record", "finale"].includes(state.chapter)) backgroundMusic.stop();
    else void backgroundMusic.start();
  }, [state?.chapter]);
  useEffect(() => () => backgroundMusic.stop(), []);
  const story = useStory(state);
  useShakeFeedback(state);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(t);
  }, [flash]);

  const fail = (e: unknown) => { sfx.boing(); setFlash((e as Error).message); };
  const jingleSays = (line: string) => { setLocalJingle({ line, at: Date.now() }); speak("jingle", line); };
  const funPick = (h: FunSpot) => { if (h.sound) sfx[h.sound](); setPoke({ x: h.x, y: h.y, at: Date.now() }); if (h.line) jingleSays(h.line); };
  const missed = () => { sfx.boing(); };

  const advance = () => {
    if (!state || !chapterOf(state.chapter).remoteAdvances) return;
    if (state.chapter === "message" && story.busy) return; // let Grandpa finish
    api.advance(state.code).then(() => sfx.chime()).catch(fail);
  };

  // The remote's other buttons: play/pause pauses the voices, menu asks Alexa for a hint, and
  // back closes what is open, or asks before leaving (the Fire TV shell sends back as Escape;
  // not calling preventDefault lets the shell close the app).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "GoBack" || e.key === "BrowserBack") {
        if (leaving) { setLeaving(false); return; } // second back: leave
        e.preventDefault();
        if (lockOpen) { setLockOpen(false); return; }
        setLeaving(true);
        return;
      }
      if (leaving && (e.key === "Enter" || e.keyCode === 23)) { e.preventDefault(); e.stopImmediatePropagation(); setLeaving(false); return; }
      // Down, from the leave dialog: a fresh game (the TV otherwise resumes the last one)
      if (leaving && e.key === "ArrowDown") { e.preventDefault(); e.stopImmediatePropagation(); location.replace(`${location.pathname}?new`); return; }
      if (e.key === "MediaPlayPause") { e.preventDefault(); setPaused(togglePause()); }
      if ((e.key === "ContextMenu" || e.key === "m") && state && state.chapter !== "lobby") {
        e.preventDefault();
        api.alexa(state.code, "Can we have a hint, please?").then((r) => speak("alexa", r.text)).catch(fail);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [state?.code, state?.chapter, leaving, lockOpen]);

  const ch = state ? chapterOf(state.chapter) : CHAPTERS[0];
  const jingle = state && (localJingle && localJingle.at > state.jingle.at ? { ...state.jingle, line: localJingle.line, at: localJingle.at } : state.jingle);
  const bubble = jingle?.line ? { line: jingle.line, at: jingle.at } : null;
  const play = state ? chapterPlay(state) : null;
  const handActive = !!play?.hand;
  useRemote({ ok: advance }, !!state && !handActive && !play?.ownsRemote);

  // ---- what happens on the TV, chapter by chapter ----
  function chapterPlay(s: PublicState): { hand?: React.ReactNode; overlay?: React.ReactNode; ownsRemote?: boolean; hideNarration?: boolean } | null {
    const code = s.code;
    switch (s.chapter) {
      case "message":
        return {
          hideNarration: true,
          overlay: (
            <div className="message-card">
              <AlexaCardView size="tv" card={{ type: "message", from: "Grandpa Felix", title: "New message", body: story.busy ? "Playing..." : "Press OK when you're ready to help." }} />
              {!story.busy && <TvButton onOk={() => pressOk(advance)} className="focus">Press OK: wake up Jingle</TvButton>}
            </div>
          ),
        };
      case "wind_jingle":
        return { overlay: <WindMeter value={s.wind} /> };
      case "warm_jingle":
        return { overlay: <WarmTray state={s} onError={fail} />, ownsRemote: true };
      case "door_key":
        if (!s.key) return null; // the phone task at the bottom says what to do
        if (s.doorOpen) return { overlay: <div className="door-glow" /> };
        return {
          hand: <Hand bubble={bubble} mood={s.jingle.mood} help="Carry the key to the lock · OK" hotspots={[DOOR.keyhole, DOOR.envelope, ...DOOR.fun]} start={{ x: 640, y: 760 }}
            carrying={<img className="carry-key" src={s.key.imageUrl} alt="" />}
            onPick={(h) => {
              if (!h) return missed();
              if (h.id === "keyhole") { sfx.unlock(); api.unlock(code).catch(fail); return; }
              if (h.id === "envelope") return jingleSays("Grandpa's note says: back soon, with love. Not tonight, though, with all this snow!");
              funPick(h as FunSpot);
            }} />,
        };
      case "workshop":
        return { overlay: <Pieces state={s} intro onOk={() => pressOk(advance)} /> };
      case "drawer":
        if (lockOpen) return { overlay: <><ComboLock code={code} found={found} onError={fail} onClose={() => setLockOpen(false)} /></>, ownsRemote: true };
        return {
          overlay: <ToyTags found={found} />,
          hand: <Hand bubble={bubble} mood={s.jingle.mood} help={HELP} hotspots={[SHELF.lock, ...SHELF.fun]} start={{ x: 960, y: 450 }} onPick={(h) => {
            if (!h) return missed();
            if (h.id === "lock") { sfx.tick(); setLockOpen(true); return; }
            const toy = DRAWER_TOYS.find((t) => t.id === h.id);
            if (toy) {
              sfx.sparkle();
              setPoke({ x: h.x, y: h.y, at: Date.now() });
              const next = found.includes(toy.id) ? found : [...found, toy.id];
              setFound(next);
              jingleSays(next.length === DRAWER_TOYS.length
                ? `A ${toy.digit} under ${toy.name}! That's all four. Now put them in the key's order and fly me to the lock!`
                : `Look! There's a ${toy.digit} painted under ${toy.name}!`);
              return;
            }
            funPick(h as FunSpot);
          }} />,
        };
      case "globe":
        return { overlay: <GlobeTv state={s} />, hideNarration: true };
      case "orchestra":
        return { hand: <Orchestra state={s} bubble={bubble} onSay={jingleSays} /> };
      case "record":
        if (!s.recordPlaying) {
          return {
            hand: <Hand bubble={bubble} mood={s.jingle.mood} help="Put the record on the gramophone · OK" hotspots={[PHONOGRAPH.gramophone, ...PHONOGRAPH.fun]} start={{ x: 1480, y: 560 }}
              carrying={<div className="carry-record" />}
              onPick={(h) => {
                if (!h) return missed();
                if (h.id === "gramophone") { sfx.pop(); api.record(code).catch(fail); return; }
                const fun = PHONOGRAPH.fun.find((f) => f.id === h.id);
                if (fun) funPick(fun);
              }} />,
          };
        }
        // Grandpa's voice on the record first, then the toys want to dance.
        if (!s.dance.until && s.dance.phase === "intro") return { overlay: <GrandpaRecord />, hideNarration: true };
        return { overlay: <DanceTv state={s} bubble={bubble} />, ownsRemote: true, hideNarration: true };
      case "ornaments": {
        const tray = s.ornaments.filter((o) => o.hook === undefined);
        const used = new Set(s.ornaments.map((o) => o.hook));
        const spots: Hotspot[] = carry
          ? HOOKS.map(([x, y], i) => ({ id: `hook-${i}`, x, y: y + 20, r: 38, label: "Hang it here" })).filter((_, i) => !used.has(i))
          : trayOf(tray).map((t) => t.spot);
        const held = s.ornaments.find((o) => o.id === carry);
        return {
          overlay: <><Tray finds={tray} hidden={carry} state={s} title={`Ornaments ${s.ornaments.length} of ${s.ornamentsNeeded}`} round
            empty={s.ornaments.length ? "Scan another one, or wait for the others" : "Draw an ornament on paper, then scan it with a phone"} /><HungOrnaments state={s} /></>,
          hand: <Hand bubble={bubble} mood={s.jingle.mood} help={carry ? "Hang it on a hook · OK" : tray.length ? HELP : "Draw an ornament and scan it"} hotspots={spots} start={{ x: 500, y: 600 }}
            carrying={held && <img className="carry-ornament" src={held.imageUrl} alt="" />}
            onPick={(h) => {
              if (!h) return missed();
              if (h.id.startsWith("hook-") && carry) { sfx.chime(); api.hang(code, carry, Number(h.id.slice(5))).catch(fail); setCarry(null); return; }
              sfx.pop(); setCarry(h.id);
            }} />,
        };
      }
      case "memory":
        return { overlay: <MemoryQuiz state={s} />, ownsRemote: true, hideNarration: true };
      case "starlight":
        return { overlay: <HungOrnaments state={s} />, hand: <Starlight state={s} bubble={bubble} star={<Star />} /> };
      case "flight":
        return { overlay: <Flight state={s} bubble={bubble} />, ownsRemote: true, hideNarration: true };
      case "finale":
        return { ...finalePlay(s), hideNarration: s.finale !== "arrival" };
      default:
        return null;
    }
  }

  function finalePlay(s: PublicState): { overlay?: React.ReactNode; ownsRemote?: boolean } {
    switch (s.finale) {
      case "arrival": return { overlay: <Arrival /> };
      case "cookie": return { overlay: <GingerbreadTv state={s} /> };
      case "letter": return { overlay: <FinalLetter state={s} onOk={() => api.finale(s.code, "store").catch(fail)} />, ownsRemote: true };
      case "store": return { overlay: <Store state={s} />, ownsRemote: true };
    }
  }

  setScarf(!!state?.entitlements.includes("jingle_scarf"));
  const showJingle = state && jingle && !handActive && !["lobby", "message", "workshop", "finale", "memory", "flight", "record", "globe"].includes(state.chapter);
  return (
    <div className="tv-viewport">
      <div className="stage" style={{ transform: `scale(${scale})` }}>
        <Scene name={sceneFor(state)} />

        {state && !["lobby", "message"].includes(state.chapter) && (
          <div className="chapter-tag">
            <span>Chapter {chapterNumber(state.chapter)} of {CHAPTER_COUNT}</span>
            <strong>{ch.title}</strong>
          </div>
        )}

        {state && state.chapter !== "lobby" && <Players state={state} />}

        {state?.chapter === "lobby" && <Lobby state={state} qr={qr} onOk={() => pressOk(advance)} />}
        {play?.overlay}
        {poke && <div className="poke" key={poke.at} style={{ left: poke.x, top: poke.y }} />}

        {showJingle && <Jingle mood={jingle!.mood} line={jingle!.line} at={jingle!.at} chapter={state!.chapter} shake={state!.lastShake?.at} />}

        {state && !["lobby", "message"].includes(state.chapter) && !play?.hideNarration && ch.phoneTask && (
          <div className={`narration ${handActive ? "top" : ""}`}>
            <p className="task"><PhoneIcon /> {turnTask(state) ?? ch.phoneTask}</p>
          </div>
        )}
        {/* the narrator and Grandpa, subtitled while they speak (his letter has its own page) */}
        {state && !(state.chapter === "finale" && state.finale === "letter") && <Subtitles raised={!!(ch.phoneTask && !play?.hideNarration) || handActive} />}

        {play?.hand}

        {state && state.chapter !== "lobby" && <AlexaOverlay state={state} />}
        {paused && <div className="paused-badge">Paused · press play to continue</div>}
        {leaving && (
          <div className="leave-confirm">
            {qr && <div className="leave-join"><img src={qr} alt="Scan to join" /><span>Someone new? Scan to join · code <strong>{state?.code}</strong></span></div>}
            <h2>Leave Grandpa's Workshop?</h2>
            <p>Press <strong>OK</strong> to keep playing, or <strong>Back</strong> again to leave.</p>
            <p className="leave-new">Press <strong>Down</strong> to start a new game.</p>
          </div>
        )}
        {flash && <div className="flash">{flash}</div>}
        {!state && <div className="loading">Opening the workshop...</div>}
      </div>
    </div>
  );
}

const sceneFor = (s: PublicState | null) => {
  if (!s) return "title";
  if (s.chapter === "starlight" || (s.chapter === "ornaments" && s.ornaments.some((o) => o.hook !== undefined))) return "machine";
  return chapterOf(s.chapter).scene;
};

/** In turn chapters the TV says whose go it is. */
function turnTask(s: PublicState) {
  if (!chapterOf(s.chapter).turns || !s.turn) return null;
  const p = s.players.find((x) => x.id === s.turn!.playerId);
  if (!p) return null;
  const shared = s.players.filter((x) => x.deviceId === p.deviceId).length > 1;
  return `${p.name}'s turn${shared ? " (pass the phone!)" : ""}: ${chapterOf(s.chapter).phoneTask}`;
}

/**
 * The story's voices: the narrator opens each chapter, then Jingle's intro line, both as story
 * (never dropped); Jingle's reactions are chatter. Grandpa's messages play in his own voice at the
 * moments the story calls for them. Returns the caption to show and whether a story line is playing.
 */
function useStory(state: PublicState | null) {
  const lastChapter = useRef<string | null>(null);
  const lastJingle = useRef(0);
  const lastLetter = useRef<string | null>(null);
  const recordOn = useRef(false);
  const finale = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state) return;
    const code = state.code;
    if (state.chapter !== lastChapter.current) {
      lastChapter.current = state.chapter;
      const ch = chapterOf(state.chapter);
      if (state.chapter === "message") {
        setBusy(true);
        void speak("alexa", ALEXA_LINES.newMessage, { kind: "story" })
          .then(() => speak("grandpa", GRANDPA.stuck))
          .then(() => setBusy(false));
      } else if (ch.narration) {
        void speak("narrator", ch.narration);
      }
      if (state.jingle.intro && state.jingle.line) {
        lastJingle.current = state.jingle.at;
        void speak("jingle", state.jingle.line, { kind: "story" });
      }
      if (state.chapter === "workshop") sfx.unlock();
    }
    if (state.jingle.at !== lastJingle.current && state.jingle.line && !["lobby", "message"].includes(state.chapter)) {
      lastJingle.current = state.jingle.at;
      void speak("jingle", state.jingle.line);
    }
    // The new record: Grandpa's voice, then the server starts the dance.
    if (state.chapter === "record" && state.recordPlaying && !recordOn.current) {
      recordOn.current = true;
      sfx.sparkle();
      void speak("grandpa", GRANDPA.song).then(() => api.recordDone(code).catch(() => {}));
    }
    // The finale: Grandpa sees the light, comes home, and asks about the gingerbread.
    if (state.chapter === "finale" && finale.current !== state.finale) {
      finale.current = state.finale;
      if (state.finale === "arrival") {
        musicBox.play("finale");
        void speak("narrator", chapterOf("finale").narration)
          .then(() => speak("grandpa", GRANDPA.seeIt))
          .then(() => new Promise((r) => setTimeout(r, 2500)))
          .then(() => speak("grandpa", GRANDPA.home))
          .then(() => api.finale(code, "cookie").catch(() => {}));
      }
      if (state.finale === "cookie") {
        const t = setTimeout(() => api.cookieDone(code).catch(() => {}), COOKIE_MS);
        return () => clearTimeout(t);
      }
    }
    if (state.letter && state.letter !== lastLetter.current) {
      lastLetter.current = state.letter;
      void speak("grandpa", state.letter.replace(/\n+/g, " "));
    }
  }, [state]);
  useEffect(() => () => stop(), []);
  return { busy };
}

/** Every shake from a phone clicks Jingle's key on the TV. */
function useShakeFeedback(state: PublicState | null) {
  const last = useRef(0);
  const at = state?.lastShake?.at ?? 0;
  useEffect(() => {
    if (!at || at === last.current || state?.chapter !== "wind_jingle") return;
    last.current = at;
    sfx.wind();
  }, [at]);
}

function Lobby({ state, qr, onOk }: { state: PublicState; qr: string; onOk: () => void }) {
  // Players grouped by phone, so a shared phone reads as one family member's phone.
  const phones = [...new Set(state.players.map((p) => p.deviceId))].map((d) => state.players.filter((p) => p.deviceId === d));
  return (
    <div className="lobby">
      <div className="lobby-title">
        <span className="eyebrow">A Christmas adventure for the whole family</span>
        <h1>Grandpa's Workshop</h1>
        <p>Grab a phone or two, a pencil and some paper. Kids can share a phone.</p>
      </div>
      <div className="lobby-join">
        {qr && <img src={qr} alt="Scan to join" className="qr" />}
        <div>
          <p className="join-step">Scan with a phone camera</p>
          <p className="join-code">Workshop code <strong>{state.code}</strong></p>
          <ul className="join-list">
            {state.players.length === 0 && <li className="muted">Nobody here yet...</li>}
            {phones.map((ps) => (
              <li key={ps[0].deviceId} className="phone-group">
                <PhoneIcon />
                {ps.map((p) => <span key={p.id}><span className="dot" style={{ background: p.color }} />{p.name}</span>)}
              </li>
            ))}
          </ul>
          <TvButton onOk={onOk} className={state.players.length ? "focus" : "disabled"}>
            {state.players.length ? "Press OK to start the adventure" : "Scan the code with a phone first"}
          </TvButton>
        </div>
      </div>
    </div>
  );
}

function Subtitles({ raised }: { raised: boolean }) {
  const [line, setLine] = useState<{ who: string; text: string } | null>(null);
  useEffect(() => onLine((l) => setLine(l && (l.who === "narrator" || l.who === "grandpa") ? l : null)), []);
  if (!line) return null;
  return (
    <div className={`subtitles ${raised ? "raised" : ""} ${line.who}`} key={line.text}>
      {line.who === "grandpa" && <span className="who">Grandpa</span>}
      <p>{line.text}</p>
    </div>
  );
}

/** Who is playing, in the corner. The QR and the code stay in the lobby (and the Back menu, for late joiners). */
function Players({ state }: { state: PublicState }) {
  return (
    <div className="players">
      <div>
        <ul>{state.players.map((p) => <li key={p.id} className={state.turn?.playerId === p.id ? "turn" : ""}><span className="dot" style={{ background: p.color }} />{p.name}</li>)}</ul>
      </div>
    </div>
  );
}

/** The Star Machine's three missing pieces, ticked off as they are found. */
function Pieces({ state, intro, onOk }: { state: PublicState; intro?: boolean; onOk?: () => void }) {
  const items = [
    { id: "gear", label: "The heart gear", done: state.pieces.gear },
    { id: "song", label: "Grandpa's song", done: state.pieces.song },
    { id: "star", label: "The star", done: state.pieces.star },
  ];
  return (
    <div className={`pieces ${intro ? "intro" : ""}`}>
      {intro && <h2>Missing from the Star Machine</h2>}
      <ul>
        {items.map((i) => (
          <li key={i.id} className={i.done ? "done" : ""}>
            <PieceIcon id={i.id} /><span>{i.label}</span>
          </li>
        ))}
      </ul>
      {intro && onOk && <TvButton onOk={onOk} className="focus">Press OK: let's find them!</TvButton>}
    </div>
  );
}

function PieceIcon({ id }: { id: string }) {
  if (id === "gear") return <svg viewBox="0 0 40 40" className="piece-icon"><path d="M20 4l3 5 6-1 1 6 5 3-3 5 3 5-5 3-1 6-6-1-3 5-3-5-6 1-1-6-5-3 3-5-3-5 5-3 1-6 6 1z" fill="currentColor" /><circle cx="20" cy="20" r="6" fill="#0d1b2a" /></svg>;
  if (id === "song") return <svg viewBox="0 0 40 40" className="piece-icon"><circle cx="20" cy="20" r="16" fill="currentColor" /><circle cx="20" cy="20" r="9" fill="none" stroke="#0d1b2a" strokeWidth="1.5" opacity=".5" /><circle cx="20" cy="20" r="4" fill="#b23a2e" /></svg>;
  return <svg viewBox="0 0 40 40" className="piece-icon"><path d="M20 3l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" fill="currentColor" /></svg>;
}

/** The numbers found under Grandpa's toys, hanging on little brass tags where each toy sits. */
function ToyTags({ found }: { found: string[] }) {
  return (
    <>
      {DRAWER_TOYS.filter((t) => found.includes(t.id)).map((t) => {
        const spot = SHELF.fun.find((f) => f.id === t.id)!;
        return <div key={t.id} className="toy-tag" style={{ left: spot.x, top: spot.y + spot.r * 0.55 }}>{t.digit}</div>;
      })}
      <div className="toy-count">{found.length ? `Numbers found: ${found.length} of ${DRAWER_TOYS.length}` : "Four toys hide a number"}</div>
    </>
  );
}

/** Jingle is frozen on the window ledge: pick a warm thing with the arrows and OK sends it to him.
 * The other way to warm him is the last item: buying him a knitted scarf in the Appstore. */
function WarmTray({ state, onError }: { state: PublicState; onError: (e: unknown) => void }) {
  const tray = state.warmFinds.filter((f) => !f.given);
  const scarfOwned = state.entitlements.includes("jingle_scarf");
  const scarfAt = tray.length; // the scarf comes after the warm things
  const [focus, setFocus] = useState(0);
  const [flying, setFlying] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const dialogOpen = usePurchaseDialogOpen();
  useEffect(() => { setFocus((f) => Math.min(f, scarfAt)); }, [scarfAt]);
  const buyScarf = async () => {
    if (buying || scarfOwned) return;
    setBuying(hasAppstore() ? "Opening the Amazon Appstore..." : "Opening the Appstore preview...");
    try {
      const r = await buy("jingle_scarf");
      if (r.ok) { sfx.chime(); sfx.sparkle(); await api.appstorePurchase(state.code, "jingle_scarf", r.receiptId); setBuying(null); }
      else { sfx.boing(); setBuying("No scarf this time. Nothing was charged."); setTimeout(() => setBuying(null), 3000); }
    } catch (e) { setBuying(null); onError(e); }
  };
  useRemote({
    left: () => { setFocus((f) => Math.max(0, f - 1)); sfx.hover(); },
    right: () => { setFocus((f) => Math.min(scarfAt, f + 1)); sfx.hover(); },
    down: () => { setFocus(scarfAt); sfx.hover(); },
    up: () => { if (tray.length) { setFocus(0); sfx.hover(); } },
    ok: () => give(focus),
  }, !dialogOpen);
  function give(i: number) {
    {
      if (i === scarfAt) { void buyScarf(); return; }
      const f = tray[i];
      if (!f || flying) return;
      sfx.pop();
      setFlying(f.id);
      setTimeout(() => { setFlying(null); sfx.chime(); api.give(state.code, f.id).catch(onError); }, 900);
    }
  }
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? "";
  const given = state.warmFinds.filter((f) => f.given);
  return (
    <>
      <div className="warm-tray">
        <span className="tray-title">{tray.length ? "Arrows pick · OK gives it to Jingle" : `Warm things for Jingle: ${given.length} of ${state.warmNeeded}`}</span>
        <div className="warm-items">
          {tray.map((f, i) => (
            <figure key={f.id} className={`warm-item ${i === focus ? "focus" : ""} ${flying === f.id ? "fly" : ""}`}
              onClick={() => { setFocus(i); give(i); }}>
              <img src={f.imageUrl} alt={f.label} />
              <figcaption>{name(f.playerId)}: {f.label}</figcaption>
            </figure>
          ))}
          {!tray.length && <p className="warm-empty"><PhoneIcon /> Take a photo of something warm with a phone</p>}
        </div>
        {!scarfOwned && (
          <div className={`warm-scarf ${focus === scarfAt ? "focus" : ""}`} onClick={() => { setFocus(scarfAt); void buyScarf(); }}>
            <img src="/scenes/jingle_fly_a_scarf.png" alt="" />
            <div>
              <span className="warm-or">or</span>
              <strong>Buy Jingle a knitted scarf</strong>
              <span className="warm-price">{buying ?? <>Amazon Appstore · {`$${PRODUCTS.jingle_scarf.price.toFixed(2)}`}</>}</span>
            </div>
          </div>
        )}
      </div>
      <AppstoreDialogHost />
      <div className="warm-given" style={{ left: GARDEN.jingle.x - 160, top: GARDEN.jingle.y + 40 }}>
        {given.map((f, i) => <img key={f.id} src={f.imageUrl} alt={f.label} style={{ transform: `rotate(${(i % 2 ? 1 : -1) * (6 + i * 4)}deg) translateX(${i * 70}px)` }} />)}
      </div>
      <div className="frost" style={{ opacity: scarfOwned ? 0 : Math.max(0, 1 - given.length / state.warmNeeded) * 0.8 }} />
    </>
  );
}

/** Grandpa's voice coming out of the gramophone. */
function GrandpaRecord() {
  return (
    <div className="grandpa-record">
      <div className="record spinning" aria-hidden />
      <p>Grandpa's voice is on the record...</p>
    </div>
  );
}

/** The star shines on the roof; far away, the little train starts moving towards the house. */
function Arrival() {
  return (
    <div className="arrival" aria-hidden>
      <div className="beacon-rays" />
    </div>
  );
}

function WindMeter({ value }: { value: number }) {
  return (
    <div className="wind">
      <div className="wind-key" style={{ transform: `rotate(${value * 7.2}deg)` }}>
        <svg viewBox="0 0 100 100" width="150" height="150" aria-hidden>
          <circle cx="50" cy="28" r="18" fill="none" stroke="#c8963e" strokeWidth="9" />
          <circle cx="50" cy="72" r="18" fill="none" stroke="#c8963e" strokeWidth="9" />
          <rect x="44" y="40" width="12" height="20" fill="#c8963e" />
        </svg>
      </div>
      <div className="wind-bar"><div style={{ width: `${value}%` }} /></div>
      <p>{value < 100 ? "Shake, shake, shake!" : "Jingle is waking up!"}</p>
    </div>
  );
}

/** Things scanned on the phones wait here until Jingle picks them up. */
function trayOf(finds: Find[]) {
  return finds.slice(0, 6).map((f, i) => {
    const x = 170 + (i % 3) * 190, y = 560 + Math.floor(i / 3) * 210;
    return { find: f, spot: { id: f.id, x, y, r: 85, label: f.label } as Hotspot };
  });
}

function Tray({ finds, hidden, state, title, round, empty }: { finds: Find[]; hidden: string | null; state: PublicState; title: string; round?: boolean; empty?: string }) {
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? "";
  const items = trayOf(finds);
  return (
    <>
      <div className={`tray ${items.length ? "" : "empty"}`}>
        <span className="tray-title">{title}</span>
        {!items.length && empty && <p className="tray-empty"><PhoneIcon /> {empty}</p>}
      </div>
      {items.map(({ find, spot }) => find.id === hidden ? null : (
        <figure key={find.id} className={`tray-item ${round ? "round" : ""}`} style={{ left: spot.x, top: spot.y }}>
          <img src={find.imageUrl} alt={find.label} />
          <figcaption>{name(find.playerId)}</figcaption>
        </figure>
      ))}
    </>
  );
}

function HungOrnaments({ state, lit }: { state: PublicState; lit?: boolean }) {
  return (
    <>
      {state.ornaments.filter((o) => o.hook !== undefined).map((o) => {
        const [x, y] = HOOKS[o.hook! % HOOKS.length];
        return (
          <figure key={o.id} className={`ornament ${lit ? "lit" : ""}`} style={{ left: x, top: y }}>
            <span className="string" />
            <img src={o.imageUrl} alt={o.label} />
          </figure>
        );
      })}
    </>
  );
}

function FinalLetter({ state, onOk }: { state: PublicState; onOk: () => void }) {
  useRemote({ ok: () => state.letter && onOk() });
  if (!state.letter) return <div className="paper letter side"><p className="handwriting">Grandpa is writing you something...</p></div>;
  const lines = state.letter.split(/\n+/).filter(Boolean);
  return (
    <div className="paper letter side">
      {lines.map((l, i) => <p key={i} className={i === 0 || i === lines.length - 1 ? "handwriting" : ""}>{l}</p>)}
      <TvButton onOk={onOk} className="focus">Press OK: Merry Christmas!</TvButton>
    </div>
  );
}

/** A real focused button, so a remote whose OK arrives as a click on the focused element works too. */
function TvButton({ onOk, className, children }: { onOk?: () => void; className: string; children: React.ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  return <button ref={ref} className={`tv-button ${className}`} onClick={onOk} tabIndex={0}>{children}</button>;
}

function Star() {
  return (
    <svg viewBox="0 0 100 100" width="120" height="120" className="star-svg" aria-hidden>
      <path d="M50 4l13 30 32 3-24 21 7 32-28-17-28 17 7-32L5 37l32-3z" fill="#ffd36b" stroke="#a8761f" strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden className="phone-icon">
      <rect x="6" y="2" width="12" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="18" r="1.3" fill="currentColor" />
    </svg>
  );
}

const ROOM_KEY = "gw-tv-room";
function readSavedRoom() {
  try { return localStorage.getItem(ROOM_KEY); } catch { return null; }
}
function saveRoom(code: string) {
  try { localStorage.setItem(ROOM_KEY, code); } catch { /* private mode: no resume, still playable */ }
}
