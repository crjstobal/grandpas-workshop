// Renders every scripted line with ElevenLabs into web/public/voice/<hash>.mp3, so the game ships
// with its voices and only dynamic lines (names, Nova's words, the letter) are synthesized live.
//
//   npm run voices -w server            # dry run: lists new lines and the characters they cost
//   npm run voices -w server -- --go    # renders the new ones
//
// Lines come from the script (shared/story.ts), the fixed lines in the game rules, and the fixed
// lines the TV speaks. Lines with ${...} in them are dynamic and skipped.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ALEXA_LINES, CHAPTERS, GRANDPA } from "../../shared/story";
import { elevenKey, elevenSpeak, voiceKey, ELEVEN_MODEL, type Speaker } from "../src/brain/voice";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const OUT = `${ROOT}web/public/voice`;
const go = process.argv.includes("--go");

const lines = new Map<string, { who: Speaker; text: string }>();
const add = (who: Speaker, text: string | undefined) => {
  const t = text?.trim();
  if (!t || t.includes("${")) return;
  lines.set(voiceKey(who, t), { who, text: t });
};

for (const c of CHAPTERS) { add("narrator", c.narration); add("jingle", c.jingle); }
for (const t of Object.values(GRANDPA)) add("grandpa", t);
for (const t of Object.values(ALEXA_LINES)) add("alexa", t);

const strings = (src: string) => [...src.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\"/g, '"'));

// Jingle's fixed reactions in the game rules: every plain string inside a say(...) call.
const engine = readFileSync(`${ROOT}server/src/game/engine.ts`, "utf8");
for (const m of engine.matchAll(/say\(r,([\s\S]*?)\);/g)) {
  for (const s of strings(m[1])) if (s.length > 12 && !["awake", "happy", "cold", "sleep"].includes(s)) add("jingle", s);
}

// Lines the TV speaks itself: fun spots, and literal speak()/jingleSays()/onSay() calls.
const tvDir = `${ROOT}web/src/tv`;
for (const f of readdirSync(tvDir).filter((x) => /\.tsx?$/.test(x))) {
  const src = readFileSync(`${tvDir}/${f}`, "utf8");
  for (const m of src.matchAll(/line: "((?:[^"\\]|\\.)*)"/g)) add("jingle", m[1]);
  for (const m of src.matchAll(/(?:jingleSays|onSay)\("((?:[^"\\]|\\.)*)"\)/g)) add("jingle", m[1]);
  for (const m of src.matchAll(/speak\("(narrator|jingle|grandpa|alexa)",\s*"((?:[^"\\]|\\.)*)"/g)) add(m[1] as Speaker, m[2]);
}

const fresh = [...lines.entries()].filter(([k]) => !existsSync(`${OUT}/${k}.mp3`));
const chars = fresh.reduce((n, [, l]) => n + l.text.length, 0);
console.log(`${lines.size} scripted lines, ${fresh.length} not rendered yet, ${chars} characters (${ELEVEN_MODEL}).`);
for (const [, l] of fresh) console.log(`  ${l.who.padEnd(8)} ${l.text.slice(0, 110)}`);
if (!go) { console.log("Dry run. Add --go to render."); process.exit(0); }

const key = await elevenKey();
if (!key) { console.error("No ElevenLabs key (SSM or ELEVENLABS_API_KEY)."); process.exit(1); }
mkdirSync(OUT, { recursive: true });
let done = 0;
for (const [k, l] of fresh) {
  try {
    writeFileSync(`${OUT}/${k}.mp3`, await elevenSpeak(key, l.who, l.text));
    console.log(`ok ${++done}/${fresh.length} ${l.who}: ${l.text.slice(0, 60)}`);
  } catch (e) {
    console.error(`failed ${l.who}: ${l.text.slice(0, 60)}: ${(e as Error).message}`);
  }
}
