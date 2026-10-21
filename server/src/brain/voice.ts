// Voices. Each character has an ElevenLabs voice; Amazon Polly (neural) is the fallback when
// ElevenLabs is not configured or tonight's live budget is spent.
//
// Every line is looked up in three places before anything is synthesized:
//   1. web/public/voice/<hash>.mp3, the scripted lines rendered ahead of time (npm run voices),
//      shipped with the app so a deployment needs no live synthesis for them;
//   2. the on-disk cache in .data/voice/, for dynamic lines already spoken once;
//   3. then ElevenLabs (or Polly), and the result goes into the cache.
// The ElevenLabs key is read at runtime from AWS SSM Parameter Store (never from a file).
import { PollyClient, SynthesizeSpeechCommand, type VoiceId } from "@aws-sdk/client-polly";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { fromIni } from "@aws-sdk/credential-providers";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MOCK } from "./nova";

export type Speaker = "narrator" | "jingle" | "grandpa" | "alexa";

/** ElevenLabs voices, chosen by ear from the voice library. */
export const ELEVEN_VOICES: Record<Speaker, string> = {
  narrator: "BNgbHR0DNeZixGQVzloa", // David, deep and engaging British storyteller
  jingle: "XjGYkUkzth8BPs29fmcV",   // Teddy Twinkle, a sweet little cartoon voice
  grandpa: "1wg2wOjdEWKA7yQD8Kca",  // Father Christmas, magical old storyteller
  alexa: "hpp4J3VqNfWAUOO0d1Us",    // Bella, bright and warm
};
const POLLY_VOICES: Record<Speaker, VoiceId> = { narrator: "Arthur", jingle: "Kevin", grandpa: "Brian", alexa: "Danielle" };
export const SPEAKERS = Object.keys(ELEVEN_VOICES) as Speaker[];

export const ELEVEN_MODEL = process.env.GW_TTS_MODEL ?? "eleven_v3";
/** Characters of live (not pre-rendered) ElevenLabs speech this process may use before falling back to Polly. */
const LIVE_BUDGET = Number(process.env.GW_TTS_LIVE_BUDGET ?? 30_000);
let liveUsed = 0;

const PUBLIC_DIR = fileURLToPath(new URL("../../../web/public/voice", import.meta.url));
const CACHE_DIR = fileURLToPath(new URL("../../../.data/voice", import.meta.url));

/** The file name of a line: same speaker and text, same file, on the server and in the render script. */
export function voiceKey(speaker: Speaker, text: string) {
  return createHash("sha1").update(`${speaker}:${text.trim()}`).digest("hex").slice(0, 20);
}

const REGION = process.env.GW_POLLY_REGION ?? process.env.GW_BEDROCK_REGION ?? "eu-west-1";
const polly = new PollyClient({ region: REGION });

let keyPromise: Promise<string | null> | null = null;
/** ELEVENLABS_API_KEY from the environment (deployments), else from SSM with the local secrets profile. */
export function elevenKey() {
  keyPromise ??= (async () => {
    if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
    if (process.env.GW_TTS === "polly") return null;
    try {
      const ssm = new SSMClient({
        region: process.env.GW_SECRETS_REGION ?? "eu-west-1",
        // On the server (EC2) the instance role reads it: GW_SECRETS_PROFILE=none uses the default chain.
        credentials: process.env.GW_SECRETS_PROFILE === "none" ? undefined : fromIni({ profile: process.env.GW_SECRETS_PROFILE ?? "servikaki-secrets" }),
      });
      const out = await ssm.send(new GetParameterCommand({ Name: process.env.GW_SECRETS_PARAM ?? "/servikaki/secrets/elevenlabs.env", WithDecryption: true }));
      const line = (out.Parameter?.Value ?? "").split("\n").find((l) => l.trim().startsWith("ELEVENLABS_API_KEY="));
      return line ? line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "") : null;
    } catch (e) {
      console.warn("ElevenLabs key not available, using Amazon Polly:", (e as Error).message);
      return null;
    }
  })();
  return keyPromise;
}

/** ElevenLabs text to speech. Exported for the pre-render script. */
export async function elevenSpeak(key: string, speaker: Speaker, text: string): Promise<Buffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICES[speaker]}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: ELEVEN_MODEL }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

async function pollySpeak(speaker: Speaker, text: string): Promise<Buffer> {
  const res = await polly.send(new SynthesizeSpeechCommand({ Engine: "neural", OutputFormat: "mp3", VoiceId: POLLY_VOICES[speaker], Text: text }));
  return Buffer.from(await res.AudioStream!.transformToByteArray());
}

const inFlight = new Map<string, Promise<Buffer | null>>();

export async function speak(speaker: Speaker, raw: string): Promise<Buffer | null> {
  const text = raw.trim();
  const key = voiceKey(speaker, text);
  for (const dir of [PUBLIC_DIR, CACHE_DIR]) {
    const f = `${dir}/${key}.mp3`;
    if (existsSync(f)) return readFileSync(f);
  }
  if (MOCK && !process.env.GW_TTS_IN_MOCK) return null;
  // Two screens asking for the same line at once share one synthesis.
  const pending = inFlight.get(key);
  if (pending) return pending;
  const job = (async () => {
    const eleven = await elevenKey();
    let bytes: Buffer;
    if (eleven && liveUsed + text.length <= LIVE_BUDGET) {
      try {
        bytes = await elevenSpeak(eleven, speaker, text);
        liveUsed += text.length;
      } catch (e) {
        console.warn((e as Error).message);
        bytes = await pollySpeak(speaker, text);
      }
    } else {
      bytes = await pollySpeak(speaker, text);
    }
    try {
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(`${CACHE_DIR}/${key}.mp3`, bytes);
    } catch { /* read-only disk: still answer */ }
    return bytes;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}
