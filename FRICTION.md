# Friction log

Notes taken while building Grandpa's Workshop (Vega OS, Vega WebView, Vega In-App Purchasing,
App Tester), for the Amazon Developer teams. Each entry: task attempted, steps taken, expected vs.
actual result, severity, workaround used, and an actionable suggestion.

**Severity scale:** Critical (blocks the feature), High (costs hours, no obvious fix), Medium
(confusing, workaround found quickly), Low (papercut).

| # | Area | Issue | Severity |
|---|------|-------|----------|
| 1 | Vega Virtual Device | Does not start on Apple Silicon | Critical |
| 2 | Vega WebView | The remote's OK never reaches the page | Critical |
| 3 | Vega WebView | Back can never leave the app | High |
| 4 | Vega WebView | `http://` blocked with no opt-out | High |
| 5 | Vega Virtual Device | Reaching the host machine | Medium |
| 6 | Vega IAP | Manifest entries split across three pages | Medium |
| 7 | Vega IAP | Sandbox needs two JSON files in two folders | Medium |
| 8 | Vega IAP | The documented `mkdir` step fails | Low |
| 9 | App Tester | Every call returns FAILED until relaunched | High |
| 10 | Vega IAP API | Responses can't cross a WebView bridge | Medium |
| 11 | App Tester | Buying an owned item shows the buy dialog again | Low |
| 12 | Vega remote keys | Media keys arrive twice, names disagree | Medium |

---

## 1. Vega Virtual Device does not start on Apple Silicon (Critical)

- **Task:** run the app on the Vega Virtual Device.
- **Steps:** one-line SDK installer, then `vega virtual-device start`.
- **Expected:** the device boots.
- **Actual:** `Vega operation FAILED due to an irrecoverable error: Registering QEMU binary as identified to system failed.` The logs under `~/vega/sdk/.../logs` give no cause and the troubleshooting page has no entry for it. The bundled binary also panics with a Go stack trace (`zap.Must`) if `--log-path` does not exist.
- **Workaround:** run the bundled binary directly:
  `~/vega/sdk/vega-sdk/main/0.24.12112/vvd/bin/virtualdevice create-and-launch --log-path /tmp/vvdlog --instances-path ~/vega/sdk/vega-sdk/main/0.24.12112/vvd/instances`.
  After that, `vega run-app ... -d VirtualDevice` installs and launches normally.
- **Suggestion:** print the underlying error of the registration step, document the direct command as a fallback, and create the log folder automatically.

## 2. The remote's OK button never reaches a WebView page (Critical)

- **Task:** drive a web game with the D-pad.
- **Steps:** `vegaWebview` template, `keydown` listeners in the page.
- **Expected:** OK arrives as Enter (or keyCode 23), like the arrows.
- **Actual:** arrows, Enter and play/pause arrive as normal key events, but the center button produces nothing in the page: no key event and no click. `inputd-cli button_press KEY_SELECT` did not reproduce it in `useTVEventHandler` either.
- **Workaround:** catch `select` in the React Native shell with `useTVEventHandler` and inject a synthetic Enter into the page with `injectJavaScript`. The page accepts every OK variant (`Enter`, `Select`, `Accept`, keyCodes 13/23/66) and uses real focused `<button>`s in case OK arrives as a click.
- **Suggestion:** deliver select as Enter by default, document how each remote key maps into WebView pages, and make `inputd-cli` names match what the virtual remote sends.

## 3. Back can never leave a WebView app (High)

- **Task:** Back on the title screen should exit, like every Fire TV app.
- **Steps:** the template with `allowSystemKeyEvents`.
- **Expected:** the page handles Back where it can; otherwise the app exits.
- **Actual:** the WebView registers a `hardwareBackPress` handler that always returns `true` ("Once WebView receives the back key event, it always consumes the event"). The template has no `onCloseWindow`, so the user is stuck. Back also arrives in the page as `key: "GoBack"` with `keyCode: 27` (Escape's code but not its name), so `e.key === "Escape"` misses it.
- **Workaround:** the shell registers its own Back handler after the WebView's (BackHandler calls the newest first), sends the page a cancelable Escape `keydown`, and calls `BackHandler.exitApp()` unless the page calls `preventDefault()`. Verified on the virtual device.
- **Suggestion:** wire `onCloseWindow={() => BackHandler.exitApp()}` into the `vegaWebview` template, and let `dispatchBackAction` report "not handled".

## 4. `http://` is blocked with no opt-out (High)

- **Task:** load the TV view from the dev laptop while developing.
- **Steps:** point the WebView at `http://<laptop>:5178`.
- **Expected:** allowed in debug builds, like an Android network security config.
- **Actual:** `net::ERR_CLEARTEXT_NOT_PERMITTED`. `@amazon-devices/webview` calls `setCheckCleartextPermitted(true)` on load, there is no prop to change it, and calling the TurboModule with `false` afterwards had no effect.
- **Workaround:** an HTTPS tunnel (`cloudflared tunnel --url http://localhost:5178`). Phones need HTTPS anyway (camera and motion sensors on iOS).
- **Suggestion:** an `allowCleartextTraffic` prop or a debug manifest entry, and a line about the default in the WebView docs.

## 5. Reaching the host machine from the Virtual Device (Medium)

- **Task:** open the laptop's dev server from the device.
- **Steps:** use the laptop's LAN IP.
- **Expected:** reachable.
- **Actual:** `Webpage not available`. The host is `10.0.2.2` (the Android emulator convention), which I only guessed from the emulator arguments in the log.
- **Workaround:** use `10.0.2.2`.
- **Suggestion:** document the host alias, or `vega device start-port-forwarding --reverse` examples, in the WebView getting-started guide.

## 6. The IAP manifest entries are split across three pages (Medium)

- **Task:** enable In-App Purchasing.
- **Steps:** read the IAP Overview, the API README (`keplerscript-appstore-iap-lib`), "Configure App Tester" and "Use App Tester".
- **Expected:** one list of `manifest.toml` entries.
- **Actual:** the overview lists none; the README lists the production ones; "Configure App Tester" adds `com.amazon.iap.tester.service` and `/com.amazonappstore.iap.tester@IIAPTesterUI`; "Use App Tester" repeats only the service. None says whether tester entries must be removed for release. The build also adds `/com.amazon.kepler.appstore_iap_lib_2@IAppstoreIapLib_12` by itself, which is not mentioned anywhere.
- **Workaround:** merged the lists, marked the tester lines as development only, and checked the generated `build/private/vega/*/Debug/manifest.toml`.
- **Suggestion:** one "IAP manifest checklist" with debug and release columns, or a `vega project add-capability iap` command.

## 7. Sandbox mode needs two JSON files in two folders (Medium)

- **Task:** test purchases in App Tester.
- **Steps:** push `amazon.sdktester.json` to `/tmp/scratch/com.amazonappstore.iap.tester/` as documented.
- **Expected:** one config file, as on Fire OS.
- **Actual:** the app only uses App Tester if a second file, `amazon.config.json` with `{"debug.amazon.sandboxmode": "debug"}`, is in `/tmp/scratch/<app id>/`. It is only in step 3 of the "Use App Tester" page.
- **Workaround:** both files are in the repo (`tv-app/amazon.sdktester.json`, `tv-app/amazon.config.json`) and `tv-app/IAP.md` pushes both. The log line `Sandbox parameter debug.amazon.sandboxmode in config file is debug` confirms it.
- **Suggestion:** `vega device iap-sandbox --app <id> --items amazon.sdktester.json` that pushes both files and restarts App Tester.

## 8. The documented `mkdir` step fails (Low)

- **Task:** App Tester setup.
- **Steps:** `vega exec vda shell mkdir /tmp/scratch/com.amazonappstore.iap.tester/`.
- **Expected:** works as written.
- **Actual:** `File exists`. The folder belongs to App Tester's sandbox and lists as `d?????????` (Permission denied), which makes the setup look broken. `vega device copy-to` still writes into it.
- **Workaround:** skip the step and verify with `copy-from`. Note: `copy-from` uses `-o` for the host destination and `-d` for the device serial.
- **Suggestion:** drop the step or use `mkdir -p`, and mention that the folder is not listable from the developer shell.

## 9. Every IAP call returns FAILED until App Tester is relaunched (High)

- **Task:** buy an item in sandbox.
- **Steps:** install App Tester, launch the game, call `getProductData`, `getPurchaseUpdates` or `purchase`.
- **Expected:** products and a purchase.
- **Actual:** a bare `FAILED`. The app log only says `Invalid request Id present in the response`. The real cause is in App Tester's log: `performOperation called after shutdown`. Its service stops after its UI goes to the background. It happened again while recording the demo video.
- **Workaround:** `vlcm terminate-app -f -p com.amazonappstore.iap.tester`, `vmsgr send pkg://com.amazonappstore.iap.tester.ui`, then launch the game. After that everything worked the first time: localized prices, receipt, `notifyFulfillment`, restore on relaunch, `ALREADY_PURCHASED`.
- **Suggestion:** return a dedicated code with "App Tester service is not running" to the calling app, and keep the service alive in the background.

## 10. IAP responses cannot cross a WebView bridge (Medium)

- **Task:** send product data to the web page.
- **Steps:** `JSON.stringify` of the `getProductData` result.
- **Expected:** plain JSON.
- **Actual:** `Price.valueInMicros` (and `PromotionPlan.priceCycles`) is a `bigint`, so stringify throws `Do not know how to serialize a BigInt`; `productData` is a `Map`, which serializes to `{}`. The library JS is obfuscated, so I could not check the real shape.
- **Workaround:** convert to plain objects in the shell, with prices as strings, handling both Map and object.
- **Suggestion:** a `toJSON()` helper, or a WebView IAP bridge sample, since `vegaWebview` is the recommended path for web games.

## 11. Buying an owned item shows the full buy dialog again (Low)

- **Task:** repeat purchase of an ENTITLED SKU.
- **Steps:** `purchase` of a SKU the user already owns.
- **Expected:** `ALREADY_PURCHASED` right away.
- **Actual:** App Tester shows "Cancel / Get Item" again; only after "Get Item" does it say "You already own this item." The purchase promise also resolves only when the user closes the "Thank you" dialog, not when the order completes.
- **Workaround:** restore entitlements on launch and never offer an owned item.
- **Suggestion:** document which dialogs App Tester shows for each response code, so developers know what production will do.

## 12. Media keys arrive twice, and the event names disagree (Medium)

- **Task:** Play/Pause, Rewind and Fast forward in a WebView game.
- **Steps:** forward media keys from `useTVEventHandler` in the shell.
- **Expected:** one place where each key arrives.
- **Actual:** media keys reach the page natively (`MediaPlayPause` 179, `MediaRewind` 227, `MediaFastForward` 228) and also through TVEventHandler in the shell, so forwarding doubles them. Menu never reaches the page. `TVTypes.d.ts` comments say `rewind`/`forward` while the type says `skip_backward`/`skip_forward`. The template does not declare `com.amazon.inputd.service`, which the TVEventHandler docs require.
- **Workaround:** forward each key once, drop duplicates within 250 ms in the page, add the manifest entry. Verified with `inputd-cli`.
- **Suggestion:** one remote-keys table (TVEventHandler name, what a WebView page receives, whether it needs `allowSystemKeyEvents`), and consistent names in comments and types.

---

## What worked well

- **`vegaWebview` template:** `vega project list-templates` plus `--uri` gave a working TV app with focus, Back handling and a splash screen in one command, built at the first attempt. The fastest path from a web game to Fire TV; it deserves a prominent spot in the docs.
- **`inputd-cli`:** `vega device run-cmd -c 'inputd-cli button_press KEY_DOWN'` is excellent for scripting remote presses. The whole demo video was recorded with it. It deserves its own docs page.
- **Vega IAP API:** once App Tester runs, the API is clean and every flow worked the first time.
