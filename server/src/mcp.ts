// The Grandpa's Workshop MCP server: how Alexa+ (or any MCP client) plays along with the
// family's game on the Fire TV. She knows where they are in the story, keeps the memory lock's
// questions, gives hints, and sells the next adventure with an Alexa+ style checkout.
// One stateless server per request, scoped to one room. Tool results carry structuredContent
// plus a card, in the shape of the Alexa+ visual patterns (card, checkout, receipt).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PRODUCTS } from "../../shared/story";
import type { AlexaCard, ProductId } from "../../shared/types";
import * as game from "./game/engine";
import * as rooms from "./game/rooms";

const PRODUCT_IDS = Object.keys(PRODUCTS) as [ProductId, ...ProductId[]];

function ok(data: Record<string, unknown>, card?: AlexaCard) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: card ? { ...data, card } : data,
    ...(card ? { _meta: { ui: { resourceUri: `ui://grandpas-workshop/${card.type}` } } } : {}),
  };
}
const fail = (e: unknown) => ({ isError: true, content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }] });

export const SKILL_INSTRUCTIONS = [
  "Grandpa's Workshop is a Christmas adventure the family is playing on their Fire TV right now.",
  "Grandpa Felix's train is stuck in a blizzard. His Star Machine in the workshop is a lighthouse: the family is lighting it so he can find his way home. Jingle, his clockwork robin, guides them on the TV.",
  "You, Alexa, delivered Grandpa's message, and he asked you to keep an eye on the family tonight. You remember what they did.",
  "1. When the user mentions the game, or asks where they left off, call get_story_status and answer from it (chapter, pieces found, who did what).",
  "2. If they ask for help, call get_hint and give it in your own words in one or two sentences. If it says the free hints are used up, offer Grandpa's Hint Book with offer_product.",
  "3. In the chapter 'Piece three: the star', call get_memory_question and read the question with its three options. When they answer, call answer_memory_question with their words. Say whether it was right, then read the next question.",
  "4. Purchases follow the Alexa shopping pattern. To suggest something, call offer_product and end with 'Want to learn more?'. Never say a price in the offer. If they want it, call start_checkout and say the price plus tax, then ask 'Would you like to buy it?'. Only after a clear yes, call confirm_checkout with confirmed true; if they say no, call it with confirmed false and say 'No problem.'",
  "5. confirm_checkout sends the purchase to the grown-up's phone for approval. Tell them: 'I'm asking a grown-up for permission.' Never complete a purchase without that approval.",
  "6. After the story ends, you may offer The Snowed-In Sleigh once. Never interrupt a puzzle to sell something, and never block the story behind a purchase.",
  "7. Keep the magic: you are Alexa playing along. Never mention tools, servers or the game's internals.",
].join("\n");

export function buildMcpServer(code: string) {
  const server = new McpServer({ name: "grandpas-workshop", version: "0.2.0" }, { instructions: SKILL_INSTRUCTIONS });
  const room = () => rooms.get(code);

  server.registerTool("get_story_status", {
    title: "Where the family is in the story",
    description: "Current chapter, what is happening on the TV, whose turn it is, which pieces of the Star Machine they found, when they last played, and everything they did so far. Use it to pick up where they left off.",
    annotations: { readOnlyHint: true },
  }, async () => {
    try { return ok(game.storyStatus(room())); } catch (e) { return fail(e); }
  });

  server.registerTool("get_hint", {
    title: "Hint for the current puzzle",
    description: "A hint for what the family is doing right now. A few hints are free each night; after that it returns an offer for Grandpa's Hint Book instead.",
  }, async () => {
    try {
      return rooms.mutate(code, (r) => {
        const h = game.hint(r);
        const card: AlexaCard = h.available
          ? { type: "hint", title: h.chapter, body: h.hint! }
          : { type: "offer", productId: "hint_book", title: PRODUCTS.hint_book.title, body: PRODUCTS.hint_book.pitch, cta: "Learn more" };
        return ok(h as Record<string, unknown>, card);
      });
    } catch (e) { return fail(e); }
  });

  server.registerTool("get_memory_question", {
    title: "The memory lock's current question",
    description: "Grandpa's star box opens only for a family that remembers the night. Returns the current question and its three options. Only in the chapter 'Piece three: the star'.",
    annotations: { readOnlyHint: true },
  }, async () => {
    try {
      return rooms.mutate(code, (r) => {
        const q = game.currentQuestion(r);
        if (!q) return ok({ available: false, note: "The memory lock is not out right now." });
        return ok({ available: true, ...q }, { type: "question", title: `Question ${q.number} of ${q.of}`, question: q.question, options: q.options });
      });
    } catch (e) { return fail(e); }
  });

  server.registerTool("answer_memory_question", {
    title: "Answer the memory lock",
    description: "The family's answer to the current memory question, in their own words or as the option they chose.",
    inputSchema: { answer: z.string().min(1).max(200).describe("What the family answered") },
  }, async ({ answer }) => {
    try {
      return rooms.mutate(code, (r) => {
        const res = game.answerQuiz(r, answer);
        const next = game.currentQuestion(r);
        return ok({ ...res, next }, next ? { type: "question", title: `Question ${next.number} of ${next.of}`, question: next.question, options: next.options } : undefined);
      });
    } catch (e) { return fail(e); }
  });

  server.registerTool("list_products", {
    title: "What the family can buy",
    description: "Extra adventures and extras for Grandpa's Workshop, and whether the family already owns them.",
    annotations: { readOnlyHint: true },
  }, async () => {
    try { return ok({ products: game.products(room()) }); } catch (e) { return fail(e); }
  });

  server.registerTool("offer_product", {
    title: "Offer a product",
    description: "Shows the offer card for a product (no price, nothing is charged). Follow it with 'Want to learn more?'.",
    inputSchema: { productId: z.enum(PRODUCT_IDS) },
  }, async ({ productId }) => {
    try {
      return rooms.mutate(code, (r) => {
        const o = game.offer(r, productId);
        const p = PRODUCTS[productId];
        return ok(o, o.alreadyOwned ? undefined : { type: "offer", productId, title: p.title, body: p.pitch, cta: "Learn more" });
      });
    } catch (e) { return fail(e); }
  });

  server.registerTool("start_checkout", {
    title: "Start a checkout",
    description: "Shows the checkout card with the full breakdown (price, tax, total, payment method) and waits for the customer's explicit confirmation. Nothing is charged yet.",
    inputSchema: { productId: z.enum(PRODUCT_IDS) },
  }, async ({ productId }) => {
    try {
      return rooms.mutate(code, (r) => ok(game.startCheckout(r, productId) as Record<string, unknown>, game.checkoutCard(r)));
    } catch (e) { return fail(e); }
  });

  server.registerTool("confirm_checkout", {
    title: "Confirm or cancel a checkout",
    description: "After the customer clearly said yes (confirmed true) or no (false). A yes sends the purchase to the grown-up's phone for approval; it completes only when they approve.",
    inputSchema: { checkoutId: z.string().min(1).max(40), confirmed: z.boolean() },
  }, async ({ checkoutId, confirmed }) => {
    try {
      return rooms.mutate(code, (r) => ok(game.confirmCheckout(r, checkoutId, confirmed) as Record<string, unknown>, game.checkoutCard(r)));
    } catch (e) { return fail(e); }
  });

  server.registerTool("get_purchase_status", {
    title: "Purchase status",
    description: "What the family owns, and the status of the latest purchase (for example, still waiting for a grown-up's approval).",
    annotations: { readOnlyHint: true },
  }, async () => {
    try { return ok(game.purchaseStatus(room()) as Record<string, unknown>); } catch (e) { return fail(e); }
  });

  server.registerPrompt("open_grandpas_workshop", {
    title: "Open Grandpa's Workshop",
    description: "How to play along with the family's Grandpa's Workshop game.",
  }, () => ({ messages: [{ role: "user", content: { type: "text", text: SKILL_INSTRUCTIONS } }] }));

  return server;
}
