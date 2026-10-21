// Composes the game's background music once with Eleven Music (cleared for commercial use) into
// web/public/music/workshop.mp3. The TV loops it under the story, so it is generated a single time,
// however long a family plays.
//
//   npm run music -w server -- --go
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { elevenKey } from "../src/brain/voice";

const OUT = fileURLToPath(new URL("../../web/public/music/workshop.mp3", import.meta.url));
const PROMPT = [
  "Cozy instrumental Christmas background music for a family adventure game set in a toymaker's workshop on a snowy night.",
  "Celesta and music box carry a gentle, playful melody over soft pizzicato strings, warm clarinet and bassoon, light sleigh bells and a little glockenspiel.",
  "Around 92 BPM, calm, magical and curious, never dramatic. No vocals.",
  "Even dynamics with no big intro and no ending, so it loops seamlessly under narration.",
].join(" ");

if (!process.argv.includes("--go")) {
  console.log(`Would compose ${OUT}\n${PROMPT}`);
  process.exit(0);
}
if (existsSync(OUT) && !process.argv.includes("--force")) {
  console.log(`${OUT} exists (pass --force to compose it again)`);
  process.exit(0);
}
const key = await elevenKey();
if (!key) throw new Error("No ElevenLabs key");
const res = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
  method: "POST",
  headers: { "xi-api-key": key, "content-type": "application/json" },
  body: JSON.stringify({ prompt: PROMPT, music_length_ms: 150_000, force_instrumental: true, model_id: "music_v1" }),
});
if (!res.ok) throw new Error(`Eleven Music ${res.status}: ${(await res.text()).slice(0, 300)}`);
mkdirSync(fileURLToPath(new URL("../../web/public/music", import.meta.url)), { recursive: true });
writeFileSync(OUT, Buffer.from(await res.arrayBuffer()));
console.log("MUSIC", OUT);
