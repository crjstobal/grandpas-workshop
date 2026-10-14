// Amazon In-App Purchasing for the TV shell.
//
// The game itself is a web page inside the WebView, so it cannot call the Vega IAP API. It sends
// a request with window.ReactNativeWebView.postMessage, this module talks to PurchasingService,
// and App.tsx sends the result back as a `gw-iap` CustomEvent. Every call is wrapped so that a
// device or build without IAP answers NOT_SUPPORTED instead of crashing the app.

import type {
  Product,
  PurchasingService as PurchasingServiceType,
  Receipt,
} from '@amazon-devices/keplerscript-appstore-iap-lib';

// Numeric values of the library enums (dist/types/IAPTypes.d.ts, 2.13.0), copied here so this
// module can be evaluated without loading the library at all.
const ProductType = {CONSUMABLE: 1, ENTITLED: 2, SUBSCRIPTION: 3} as const;
const PurchaseResponseCode = {SUCCESSFUL: 0, ALREADY_PURCHASED: 1, INVALID_SKU: 2, NOT_SUPPORTED: 3, FAILED: 4} as const;
const ListResponseCode = {SUCCESSFUL: 1, NOT_SUPPORTED: 2, FAILED: 3} as const; // ProductData and PurchaseUpdates
const FULFILLED = 1; // FulfillmentResult.FULFILLED

// The library is required lazily, inside the try blocks below: if the IAP system module is
// missing on a device, evaluating it must turn into NOT_SUPPORTED, not a crash at app start.
// (Metro evaluates a module the first time it is required.)
let service: typeof PurchasingServiceType | null = null;
const iap = (): typeof PurchasingServiceType => {
  if (!service) {
    service = require('@amazon-devices/keplerscript-appstore-iap-lib').PurchasingService;
  }
  if (!service) throw new Error('PurchasingService is not available');
  return service;
};

/** The only SKUs the game sells. Both are ENTITLED (buy once, owned on every device). */
export const SKUS = ['gw.snowed_in_sleigh', 'gw.hint_book'] as const;

export type IapStatus =
  | 'SUCCESSFUL'
  | 'ALREADY_PURCHASED'
  | 'FAILED'
  | 'INVALID_SKU'
  | 'NOT_SUPPORTED';

export type IapAction = 'purchase' | 'products' | 'restore';

/** A product as the web page sees it: plain JSON, no BigInt, no Map. */
export interface WebProduct {
  sku: string;
  title: string;
  description: string;
  price: string; // localized, for example "$2.99"
  currency: string;
  priceMicros: string; // string because the native value is a BigInt
  type: 'CONSUMABLE' | 'ENTITLED' | 'SUBSCRIPTION' | 'UNKNOWN';
}

/** Payload of the `gw-iap` event (window.dispatchEvent(new CustomEvent('gw-iap', {detail}))). */
export interface IapDetail {
  requestId: string;
  action: IapAction;
  ok: boolean;
  status: IapStatus;
  receiptId?: string;
  products?: WebProduct[];
  entitlements: string[]; // SKUs the current user owns, as far as the shell knows
  error?: string;
}

/** Message the page posts to the shell. */
export interface IapRequest {
  type: 'iap';
  action: IapAction;
  requestId?: string;
  sku?: string;
}

// SKUs owned by the current user, kept across requests so every answer carries the full list.
const owned = new Set<string>();

const entitlements = (): string[] => Array.from(owned);

const errorText = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'IAP call threw';

const typeName = (t: number | undefined): WebProduct['type'] => {
  switch (t) {
    case ProductType.CONSUMABLE:
      return 'CONSUMABLE';
    case ProductType.ENTITLED:
      return 'ENTITLED';
    case ProductType.SUBSCRIPTION:
      return 'SUBSCRIPTION';
    default:
      return 'UNKNOWN';
  }
};

const purchaseStatus = (code: number | undefined): IapStatus => {
  switch (code) {
    case PurchaseResponseCode.SUCCESSFUL:
      return 'SUCCESSFUL';
    case PurchaseResponseCode.ALREADY_PURCHASED:
      return 'ALREADY_PURCHASED';
    case PurchaseResponseCode.INVALID_SKU:
      return 'INVALID_SKU';
    case PurchaseResponseCode.NOT_SUPPORTED:
      return 'NOT_SUPPORTED';
    default:
      return 'FAILED';
  }
};

// getProductData and getPurchaseUpdates share the same numbering (1 ok, 2 not supported, 3 failed).
const listStatus = (code: number | undefined): IapStatus => {
  if (code === ListResponseCode.SUCCESSFUL) return 'SUCCESSFUL';
  if (code === ListResponseCode.NOT_SUPPORTED) return 'NOT_SUPPORTED';
  return 'FAILED';
};

const toWebProduct = (p: Product): WebProduct => ({
  sku: String(p.sku),
  title: String(p.title ?? ''),
  description: String(p.description ?? ''),
  price: String(p.price?.priceStr ?? ''),
  currency: String(p.price?.priceCurrencyCode ?? ''),
  priceMicros: p.price?.valueInMicros != null ? String(p.price.valueInMicros) : '',
  type: typeName(p.productType),
});

// The typings say Map<string, Product>; accept a plain object too in case the bridge flattens it.
const productList = (data: unknown): Product[] => {
  if (!data) return [];
  if (data instanceof Map) return Array.from(data.values()) as Product[];
  if (typeof data === 'object') return Object.values(data as Record<string, Product>);
  return [];
};

/** Tell the Appstore the item was granted. App Tester blocks new purchases until this is done. */
const fulfill = async (receiptId: string): Promise<void> => {
  try {
    await iap().notifyFulfillment({
      receiptId,
      fulfillmentResult: FULFILLED,
    });
  } catch (e) {
    console.warn(`[iap] notifyFulfillment(${receiptId}) failed: ${errorText(e)}`);
  }
};

const isKnownSku = (sku: unknown): sku is string =>
  typeof sku === 'string' && (SKUS as readonly string[]).includes(sku);

export async function purchase(requestId: string, sku: unknown): Promise<IapDetail> {
  const base = {requestId, action: 'purchase' as const};
  if (!isKnownSku(sku)) {
    return {...base, ok: false, status: 'INVALID_SKU', entitlements: entitlements(), error: `unknown sku ${String(sku)}`};
  }
  try {
    const res = await iap().purchase({sku});
    const status = purchaseStatus(res?.responseCode);
    const receiptId = res?.receipt?.receiptId;
    if (status === 'SUCCESSFUL' && receiptId) {
      await fulfill(receiptId);
    }
    if (status === 'SUCCESSFUL' || status === 'ALREADY_PURCHASED') {
      owned.add(sku);
    }
    return {
      ...base,
      ok: status === 'SUCCESSFUL' || status === 'ALREADY_PURCHASED',
      status,
      receiptId,
      entitlements: entitlements(),
    };
  } catch (e) {
    return {...base, ok: false, status: 'NOT_SUPPORTED', entitlements: entitlements(), error: errorText(e)};
  }
}

export async function products(requestId: string): Promise<IapDetail> {
  const base = {requestId, action: 'products' as const};
  try {
    const res = await iap().getProductData({skus: [...SKUS]});
    const status = listStatus(res?.responseCode);
    return {
      ...base,
      ok: status === 'SUCCESSFUL',
      status,
      products: productList(res?.productData).map(toWebProduct),
      entitlements: entitlements(),
    };
  } catch (e) {
    return {...base, ok: false, status: 'NOT_SUPPORTED', products: [], entitlements: entitlements(), error: errorText(e)};
  }
}

/**
 * Restore entitlements with getPurchaseUpdates. The first page uses reset: true (every purchase
 * of this user), the following pages reset: false while hasMore is set. Unfulfilled receipts are
 * fulfilled here too, so a purchase interrupted by a crash is not lost.
 */
export async function restore(requestId: string): Promise<IapDetail> {
  const base = {requestId, action: 'restore' as const};
  try {
    const receipts: Receipt[] = [];
    let reset = true;
    for (let page = 0; page < 10; page++) {
      const res = await iap().getPurchaseUpdates({reset});
      const status = listStatus(res?.responseCode);
      if (status !== 'SUCCESSFUL') {
        return {...base, ok: false, status, entitlements: entitlements()};
      }
      receipts.push(...(res.receiptList ?? []));
      if (!res.hasMore) break;
      reset = false;
    }
    owned.clear();
    for (const r of receipts) {
      if (!r || r.isCancelled || r.cancelDate) continue;
      if (isKnownSku(r.sku)) owned.add(r.sku);
      if (r.receiptId) await fulfill(r.receiptId);
    }
    return {...base, ok: true, status: 'SUCCESSFUL', entitlements: entitlements()};
  } catch (e) {
    return {...base, ok: false, status: 'NOT_SUPPORTED', entitlements: entitlements(), error: errorText(e)};
  }
}

/** Route one message from the page. Returns null when the message is not an IAP request. */
export async function handleIapMessage(msg: IapRequest): Promise<IapDetail | null> {
  const requestId = typeof msg.requestId === 'string' ? msg.requestId : '';
  switch (msg.action) {
    case 'purchase':
      return purchase(requestId, msg.sku);
    case 'products':
      return products(requestId);
    case 'restore':
      return restore(requestId);
    default:
      return null;
  }
}

/**
 * Build the JavaScript that delivers a result to the page. The detail is JSON encoded twice and
 * decoded with JSON.parse inside the page, so no value can break out of the string literal.
 * The last result is also kept in window.__gwIapLast for a page that mounts its listener late.
 */
export function iapEventScript(detail: IapDetail): string {
  const json = JSON.stringify(detail, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  const literal = JSON.stringify(json).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return (
    '(function(){try{var d=JSON.parse(' +
    literal +
    ');window.__gwIapLast=d;window.dispatchEvent(new CustomEvent("gw-iap",{detail:d}));}' +
    'catch(e){console.error("gw-iap dispatch failed",e);}})(); true;'
  );
}
