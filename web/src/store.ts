// The purchase bridge between the web game and the Fire TV (Vega) shell.
//
// On a Fire TV the game runs inside a React Native WebView, and the shell owns Amazon In-App
// Purchasing. The contract:
//
//   web to shell:  window.ReactNativeWebView.postMessage(JSON.stringify(
//                    { type: "iap", action: "purchase", sku, requestId }))
//                  where sku is `gw.${productId}` ("gw.snowed_in_sleigh", "gw.hint_book").
//
//   shell to web:  window.dispatchEvent(new CustomEvent("gw-iap",
//                    { detail: { requestId, ok, status, receiptId, error } }))
//                  status: SUCCESSFUL | ALREADY_PURCHASED | FAILED | INVALID_SKU | NOT_SUPPORTED
//
// With no shell (a desktop browser preview), a simulated Appstore dialog stands in for the real
// system purchase dialog. It is rendered by <AppstoreDialogHost /> (tv/AppstoreDialog.tsx), which
// listens to the small dialog manager at the bottom of this file.
import type { ProductId } from "../../shared/types";
import { PRODUCTS } from "../../shared/story";

export type IapStatus = "SUCCESSFUL" | "ALREADY_PURCHASED" | "FAILED" | "INVALID_SKU" | "NOT_SUPPORTED";

export interface BuyResult {
  /** True when the family owns the product now (a new purchase, or one they already had). */
  ok: boolean;
  receiptId?: string;
  status: string;
}

interface IapReply {
  requestId?: string;
  ok?: boolean;
  status?: string;
  receiptId?: string;
  error?: string;
}

const TIMEOUT_MS = 60_000;

type Bridge = { postMessage: (message: string) => void };
const bridge = (): Bridge | undefined => (window as unknown as { ReactNativeWebView?: Bridge }).ReactNativeWebView;

/** True inside the Fire TV shell, where purchases go through the real Amazon Appstore. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const hasAppstore = () => !!(window as any).ReactNativeWebView;

export const skuOf = (productId: ProductId) => `gw.${productId}`;

const randomId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const OWNED: ReadonlySet<string> = new Set(["SUCCESSFUL", "ALREADY_PURCHASED"]);

/** Buys a product: through the Fire TV shell when there is one, or the simulated dialog otherwise. */
export function buy(productId: ProductId): Promise<BuyResult> {
  return hasAppstore() ? buyInShell(productId) : buyInBrowser(productId);
}

function buyInShell(productId: ProductId): Promise<BuyResult> {
  const requestId = randomId("iap");
  return new Promise<BuyResult>((resolve) => {
    let settled = false;
    const finish = (r: BuyResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener("gw-iap", onReply as EventListener);
      resolve(r);
    };
    const onReply = (e: Event) => {
      let detail = (e as CustomEvent<IapReply | string>).detail;
      if (typeof detail === "string") {
        try { detail = JSON.parse(detail) as IapReply; } catch { return; }
      }
      if (!detail || detail.requestId !== requestId) return;
      const status = String(detail.status ?? (detail.ok ? "SUCCESSFUL" : "FAILED")).toUpperCase();
      finish({ ok: detail.ok === true || OWNED.has(status), receiptId: detail.receiptId || undefined, status });
    };
    const timer = setTimeout(() => finish({ ok: false, status: "FAILED" }), TIMEOUT_MS);
    window.addEventListener("gw-iap", onReply as EventListener);
    try {
      bridge()!.postMessage(JSON.stringify({ type: "iap", action: "purchase", sku: skuOf(productId), requestId }));
    } catch {
      finish({ ok: false, status: "FAILED" });
    }
  });
}

async function buyInBrowser(productId: ProductId): Promise<BuyResult> {
  const yes = await openPurchaseDialog(productId);
  if (!yes) return { ok: false, status: "FAILED" };
  const receiptId = `SIM-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
  return { ok: true, status: "SUCCESSFUL", receiptId };
}

// ---- the simulated purchase dialog (browser preview only) ----

export interface PurchaseDialogRequest {
  id: string;
  productId: ProductId;
  title: string;
  price: string;
  kind: "story" | "extra";
}

let dialog: (PurchaseDialogRequest & { resolve: (yes: boolean) => void; timer: ReturnType<typeof setTimeout> }) | null = null;
const listeners = new Set<() => void>();
const notify = () => { for (const l of listeners) l(); };

/** For useSyncExternalStore in the dialog host. */
export function subscribePurchaseDialog(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** The dialog that should be on screen right now, if any. */
export const getPurchaseDialog = (): PurchaseDialogRequest | null => dialog;

/** The family pressed Buy (true) or Cancel / Back (false). */
export function answerPurchaseDialog(yes: boolean) {
  if (!dialog) return;
  const d = dialog;
  dialog = null;
  clearTimeout(d.timer);
  notify();
  d.resolve(yes);
}

function openPurchaseDialog(productId: ProductId): Promise<boolean> {
  // A second request replaces the first one, which counts as cancelled.
  answerPurchaseDialog(false);
  const p = PRODUCTS[productId];
  return new Promise<boolean>((resolve) => {
    dialog = {
      id: randomId("sim"),
      productId,
      title: p?.title ?? productId,
      price: `$${(p?.price ?? 0).toFixed(2)}`,
      kind: p?.kind ?? "extra",
      resolve,
      timer: setTimeout(() => answerPurchaseDialog(false), TIMEOUT_MS),
    };
    notify();
  });
}
