# In-App Purchasing on Fire TV (Vega)

Grandpa's Workshop sells two optional, buy-once items through the Amazon Appstore:

| SKU | Title | Type | Price |
|-----|-------|------|-------|
| `gw.snowed_in_sleigh` | The Snowed-In Sleigh | ENTITLED | $2.99 |
| `gw.hint_book` | Grandpa's Hint Book | ENTITLED | $0.99 |

The game is a web page inside the Vega WebView, and a web page cannot call the Vega IAP API.
So the React Native shell (`src/App.tsx`, `src/iap.ts`) does the purchasing and talks to the
page through a small message bridge.

## The bridge

**Page to shell** (`window.ReactNativeWebView.postMessage(JSON.stringify(msg))`):

```js
{ type: "iap", action: "purchase", sku: "gw.hint_book", requestId: "abc" }
{ type: "iap", action: "products", requestId: "abc" }
{ type: "iap", action: "restore",  requestId: "abc" }
```

**Shell to page**: a `gw-iap` CustomEvent on `window`:

```js
window.addEventListener("gw-iap", (e) => {
  const { requestId, action, ok, status, receiptId, products, entitlements, error } = e.detail;
});
```

- `status`: `SUCCESSFUL`, `ALREADY_PURCHASED`, `FAILED`, `INVALID_SKU` or `NOT_SUPPORTED`.
- `ok`: true for `SUCCESSFUL`, and for `ALREADY_PURCHASED` on a purchase (the user owns it).
- `entitlements`: array of SKUs the user owns, always present.
- `products` (only for `products`): `{ sku, title, description, price, currency, priceMicros, type }`,
  where `price` is the localized string (`"$0.99"`) and `priceMicros` a string.
- `receiptId`: on a successful purchase. The shell has already called
  `notifyFulfillment(FULFILLED)` for it.
- Any SKU other than the two above is answered with `INVALID_SKU` without calling the Appstore.
- Any exception (for example a device without the IAP system module) is answered with
  `NOT_SUPPORTED`, so the game keeps working without purchases.

On app start the shell calls `getPurchaseUpdates({reset: true})` and, after the page loads,
sends a `gw-iap` event with `requestId: "startup"` and `action: "restore"`. The last event is
also stored in `window.__gwIapLast`, for a page whose listener mounts late. The shell sets
`window.__gwFireTV = true`, so the page can hide purchase buttons in a normal browser.

## Remote keys and Back

| Remote button | What the page receives |
|---------------|------------------------|
| D-pad arrows, Enter | native `keydown` (untouched) |
| Select (center OK) | `keydown` Enter (13), sent by the shell |
| Play/Pause | `keydown` MediaPlayPause (179) |
| Rewind / Fast forward | `keydown` MediaRewind (227) / MediaFastForward (228) |
| Menu | `keydown` ContextMenu (93), sent by the shell |
| Back | `keydown` Escape (27), sent by the shell, see below |

Play/Pause, Rewind and Fast forward already reach a Vega WebView page natively. The shell
forwards them too, in case a device does not, and a helper in the page drops the second copy
(same key within 250 ms). The page sees each press once.

**Back contract.** With `allowSystemKeyEvents`, the WebView consumes every Back press, so by
default the app could never be left with Back. The shell takes Back first and sends the page a
cancelable Escape `keydown`:

- If the page **handled** it (called `event.preventDefault()`), or has set
  `window.__gwCanGoBack = true`, nothing else happens.
- Otherwise the shell does the normal system Back and the app closes, which is what a Fire TV
  user expects on the top screen.
- The page can also leave on purpose with `window.close()` or by posting
  `{ type: "app", action: "exit" }`.

So: close a modal or go up one screen on Escape and call `preventDefault()`; do nothing on the
title screen.

## Testing purchases on the Vega Virtual Device (no Appstore account needed)

App Tester answers the IAP calls in sandbox mode from a local JSON file
(`amazon.sdktester.json`). It only works with **debug** builds.

1. **Build and boot.**
   ```sh
   cd tv-app && npm run build:debug
   ```
   Start the Vega Virtual Device. On this Mac `vega virtual-device start` fails, so use the
   direct binary from `FRICTION.md` (2026-10-11 entry) and wait for `Virtual device ready.`

2. **Install App Tester** (React Native 0.83 build; take `aarch64` on Apple Silicon, `x86_64`
   on Intel):
   ```sh
   curl -LO https://amzndevresources.com/vega/app-tester/rn83_amazoniaptester_aarch64_v24.vpkg
   vega run-app rn83_amazoniaptester_aarch64_v24.vpkg com.amazonappstore.iap.tester.ui -d VirtualDevice
   ```

3. **Give App Tester the items.** Installing App Tester already creates its folder, and the
   documented `mkdir` step fails on it (`File exists`; the developer shell cannot even list
   it). `copy-to` can still write there:
   ```sh
   vega device copy-to -s amazon.sdktester.json --destination /tmp/scratch/com.amazonappstore.iap.tester
   ```

4. **Put the game in sandbox mode.** `amazon.config.json` in this folder contains
   `{"debug.amazon.sandboxmode": "debug"}`:
   ```sh
   vega device run-cmd -c 'mkdir -p /tmp/scratch/com.grandpasworkshop.tv'
   vega device copy-to -s amazon.config.json --destination /tmp/scratch/com.grandpasworkshop.tv
   ```

5. **(Re)start App Tester, then the game.** The IAP tester service must be running *before*
   the game asks for anything; otherwise every call returns `FAILED` and the tester log says
   `performOperation called after shutdown`.
   ```sh
   vega device run-cmd -c 'vlcm terminate-app -f -p com.amazonappstore.iap.tester; vlcm terminate-app -f -p com.grandpasworkshop.tv'
   vega device run-cmd -c 'vmsgr send pkg://com.amazonappstore.iap.tester.ui'
   vega run-app build/aarch64-debug/grandpasworkshop_aarch64.vpkg com.grandpasworkshop.tv.main -d VirtualDevice
   ```

6. **Buy.** Trigger a purchase in the game. App Tester shows "Grandpa's Hint Book, $0.99,
   Cancel / Get Item". Press OK on "Get Item", then OK on "Close" in "Thank You! Your order is
   complete". The page gets `status: "SUCCESSFUL"` only after "Close". From a script:
   ```sh
   vega device run-cmd -c 'inputd-cli button_press KEY_ENTER'
   ```

7. **Check restore.** Relaunch the game: the `startup` event now lists
   `entitlements: ["gw.hint_book"]`. Buying it again shows "You already own this item." and
   returns `ALREADY_PURCHASED`.

8. **Reset.** In App Tester, "Manage Transactions" deletes test purchases. Every change to
   `amazon.sdktester.json` needs App Tester terminated and relaunched. Delete
   `/tmp/scratch/com.grandpasworkshop.tv/amazon.config.json` (or set it to `prod`) to leave
   sandbox mode.

**Logs.** `vega device run-cmd -c 'loggingctl log -v com.grandpasworkshop.tv'` shows the
`[AmazonIAPSDK]` and `iap.purchase.core` lines (look for `Sandbox parameter ... is debug`);
`-v com.amazonappstore.iap.tester` shows the tester side.

## Release builds

The two App Tester entries in `manifest.toml` (`com.amazon.iap.tester.service` and
`/com.amazonappstore.iap.tester@IIAPTesterUI`) are for development and are marked as such. The
production entries are `com.amazon.iap.core.service`, `/com.amazon.iap.core@IIAPCoreUI` and
`/com.amazon.kepler.appstore.iap.purchase.core@IAppstoreIAPPurchaseCoreService`. For a real
Appstore listing, the two SKUs must also be created in the Developer Console with the same IDs.

## Verified

2026-10-14, Vega SDK 0.24.12112, Vega Virtual Device (aarch64), App Tester
`rn83_amazoniaptester_aarch64_v24`, `@amazon-devices/keplerscript-appstore-iap-lib` 2.13.0:
products, restore, invalid SKU, purchase (SUCCESSFUL with receipt and fulfillment), restore
after relaunch, repeat purchase (ALREADY_PURCHASED), and every remote key in the table above,
including Back kept by the page and Back closing the app when the page does not keep it.
