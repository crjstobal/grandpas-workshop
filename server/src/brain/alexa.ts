// The simulated Alexa+: Amazon Nova on Bedrock driving the Grandpa's Workshop MCP server.
// It connects as a real MCP client (in-memory transport), so it uses exactly the same tools
// that Alexa+ or any other assistant gets over HTTP at /mcp/:room.
import { BedrockRuntimeClient, ConverseCommand, type ContentBlock, type Message, type Tool, type ToolResultContentBlock } from "@aws-sdk/client-bedrock-runtime";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer, SKILL_INSTRUCTIONS } from "../mcp";
import { MOCK, MODEL_ID } from "./nova";
import * as rooms from "../game/rooms";
import * as game from "../game/engine";
import { PRODUCTS } from "../../../shared/story";
import type { AlexaCard } from "../../../shared/types";

const REGION = process.env.GW_BEDROCK_REGION ?? "eu-west-1";
const MAX_STEPS = 6;
const KEEP_MESSAGES = 24;
const bedrock = new BedrockRuntimeClient({ region: REGION });
const history = new Map<string, Message[]>();

export interface AlexaReply { text: string; tools: { name: string; isError: boolean }[]; card?: AlexaCard }

const SYSTEM = `You are Alexa, the Amazon voice assistant, in a family's living room on Christmas Eve.
Everything you write is spoken aloud: one to three short sentences of plain, warm speech. No lists, no markdown, no emoji.
The family can talk to you about anything, but tonight they are playing Grandpa's Workshop on their Fire TV:
${SKILL_INSTRUCTIONS}`;

const asText = (r: object) =>
  (((r as { content?: unknown }).content as { type: string; text?: string }[]) ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
const clean = (t: string) => t.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").replace(/[*_#`]/g, "").replace(/\s*\n+\s*/g, " ").trim();

function trim(messages: Message[]): Message[] {
  const out = messages.slice(-KEEP_MESSAGES);
  while (out.length && !(out[0].role === "user" && (out[0].content ?? []).some((c) => c.text))) out.shift();
  return out;
}

export async function talk(code: string, message: string): Promise<AlexaReply> {
  rooms.get(code);
  if (MOCK) return mockTalk(code, message);

  const server = buildMcpServer(code);
  const client = new Client({ name: "grandpas-workshop-alexa-sim", version: "0.1.0" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  await client.connect(clientSide);
  try {
    const { tools } = await client.listTools();
    const toolConfig = {
      tools: tools.map((t): Tool => ({ toolSpec: { name: t.name, description: t.description ?? "", inputSchema: { json: t.inputSchema as never } } })),
    };
    const messages: Message[] = [...trim(history.get(code) ?? []), { role: "user", content: [{ text: message }] }];
    const reply: AlexaReply = { text: "", tools: [] };

    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await bedrock.send(new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: SYSTEM }],
        messages,
        toolConfig,
        inferenceConfig: { maxTokens: 500, temperature: 0.5 },
      }));
      const out = res.output?.message;
      if (!out) break;
      messages.push(out);
      const uses = (out.content ?? []).filter((c) => c.toolUse).map((c) => c.toolUse!);
      if (res.stopReason !== "tool_use" || uses.length === 0) {
        reply.text = clean((out.content ?? []).map((c) => c.text ?? "").join(" "));
        break;
      }
      const results: ContentBlock[] = [];
      for (const u of uses) {
        const r = await client.callTool({ name: u.name!, arguments: (u.input ?? {}) as Record<string, unknown> });
        reply.tools.push({ name: u.name!, isError: r.isError === true });
        // The last card a tool produced is shown with Alexa's answer (Alexa+ renders tool UI the same way).
        const card = (r.structuredContent as { card?: AlexaCard } | undefined)?.card;
        if (card) reply.card = card;
        results.push({
          toolResult: {
            toolUseId: u.toolUseId!,
            content: [{ text: asText(r) || "{}" } as ToolResultContentBlock],
            status: r.isError ? "error" : "success",
          },
        });
      }
      messages.push({ role: "user", content: results });
    }
    if (!reply.text) reply.text = "Sorry, I didn't catch that. Could you say it again?";
    messages.push(...(messages.at(-1)?.role === "assistant" ? [] : [{ role: "assistant" as const, content: [{ text: reply.text }] }]));
    history.set(code, trim(messages));
    rooms.mutate(code, (r) => game.setAlexa(r, reply.text, reply.card));
    return reply;
  } finally {
    await client.close();
    await server.close();
  }
}

/** Offline stand-in that follows the same flows, so the game can be played end to end without Bedrock. */
function mockTalk(code: string, message: string): AlexaReply {
  const said = message.toLowerCase();
  const out = rooms.mutate(code, (r): { text: string; card?: AlexaCard } => {
    const q = game.currentQuestion(r);
    const c = r.checkout;
    if (q && !/hint|help|buy/.test(said)) {
      try {
        const res = game.answerQuiz(r, message);
        const next = game.currentQuestion(r);
        if (res.done) return { text: "That's right! That was the last one. Grandpa's box is open!" };
        if (!res.right) return { text: `Hmm, not quite. Here it is again: ${q.question} ${q.options.join(", or ")}?`, card: { type: "question", title: `Question ${q.number} of ${q.of}`, question: q.question, options: q.options } };
        return { text: `That's right! Next one. ${next!.question} ${next!.options.join(", or ")}?`, card: { type: "question", title: `Question ${next!.number} of ${next!.of}`, question: next!.question, options: next!.options } };
      } catch {
        return { text: `Grandpa's question is: ${q.question} Is it ${q.options.join(", or ")}?`, card: { type: "question", title: `Question ${q.number} of ${q.of}`, question: q.question, options: q.options } };
      }
    }
    if (c?.status === "offered" && /yes|sure|learn|more|tell/.test(said)) {
      const s = game.startCheckout(r, c.productId);
      return { text: `${PRODUCTS[c.productId].pitch} It costs ${"priceSpoken" in s ? s.priceSpoken : ""}. Would you like to buy it?`, card: game.checkoutCard(r) };
    }
    if (c?.status === "awaiting_confirmation" && /\b(yes|yeah|sure|buy|ok)\b/.test(said)) {
      game.confirmCheckout(r, c.id, true);
      const approver = r.players.find((p) => p.grownUp)?.name ?? "your grown-up";
      return { text: `Sure. I'm asking a grown-up for permission. ${approver}, check your phone.`, card: game.checkoutCard(r) };
    }
    if (c && ["offered", "awaiting_confirmation"].includes(c.status) && /\b(no|nope|not now)\b/.test(said)) {
      if (c.status === "awaiting_confirmation") game.confirmCheckout(r, c.id, false); else c.status = "declined";
      return { text: "No problem. You can ask me about it anytime." };
    }
    if (r.chapter === "warm_jingle" && /scarf|cold|warm|freez/.test(said)) {
      game.offer(r, "jingle_scarf");
      const p = PRODUCTS.jingle_scarf;
      return { text: `Jingle is freezing! Show him something cosy from your house, or I can get him ${p.title}. Want to learn more?`, card: { type: "offer", productId: p.id, title: p.title, body: p.pitch, cta: "Learn more" } };
    }
    if (/buy|sleigh|story|adventure/.test(said)) {
      game.offer(r, "snowed_in_sleigh");
      const p = PRODUCTS.snowed_in_sleigh;
      return { text: `Grandpa wrote one more adventure, ${p.title}. Want to learn more?`, card: { type: "offer", productId: p.id, title: p.title, body: p.pitch, cta: "Learn more" } };
    }
    if (/where|left off|last time|progress/.test(said)) {
      const st = game.storyStatus(r);
      return { text: `You're on chapter ${st.chapter.number}, ${st.chapter.title}. ${st.whatToDoNow}` };
    }
    const h = game.hint(r);
    return { text: `Here's a hint. ${h.hint}`, card: { type: "hint", title: h.chapter, body: h.hint } };
  });
  rooms.mutate(code, (x) => game.setAlexa(x, out.text, out.card));
  return { text: out.text, tools: [], card: out.card };
}
