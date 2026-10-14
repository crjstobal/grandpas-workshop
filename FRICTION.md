# Friction log

Notes taken while building, for the Amazon Developer teams. Format: what I expected, what
happened, how I got past it, and the feature I would ask for.

## 2026-10-11 · Vega CLI · `vega virtual-device start` fails on Apple Silicon

- **Expected:** after the one-line installer, `vega virtual-device start` boots the Vega Virtual Device.
- **Happened:** `Vega operation FAILED due to an irrecoverable error: Registering QEMU binary as identified to system failed.` The log files under `~/vega/sdk/.../logs` do not mention the cause, and the troubleshooting page has no entry for it.
- **Workaround:** calling the bundled binary directly works:
  `~/vega/sdk/vega-sdk/main/0.24.12112/vvd/bin/virtualdevice create-and-launch --log-path /tmp/vvdlog --instances-path ~/vega/sdk/vega-sdk/main/0.24.12112/vvd/instances`.
  After that, `vega run-app ... -d VirtualDevice` installs and launches normally.
- **Also:** without an existing `--log-path` directory the binary panics with a Go stack trace (`zap.Must`) instead of creating the folder or printing a clear error.
- **Feature request:** print the underlying error of the registration step, and document the direct `virtualdevice` command as a fallback.

## 2026-10-11 · WebView 4.x · http:// is blocked with no way to opt out

- **Expected:** load the TV view from the dev laptop over `http://` while developing, like any Android WebView with a network security config.
- **Happened:** `net::ERR_CLEARTEXT_NOT_PERMITTED`. `@amazon-devices/webview` calls `setCheckCleartextPermitted(true)` when the module loads, there is no prop to change it, and calling the TurboModule method with `false` from the app afterwards had no effect.
- **Workaround:** serve the dev server through an HTTPS tunnel (`cloudflared tunnel --url http://localhost:5178`) and point the app at it. Phones need HTTPS anyway (camera, microphone and motion sensors on iOS).
- **Feature request:** a `allowCleartextTraffic` prop or a manifest entry for debug builds, and a line in the WebView docs about the default.

## 2026-10-11 · Vega Virtual Device · reaching the host machine

- **Expected:** the virtual device can reach the laptop's LAN address.
- **Happened:** `Webpage not available` for `http://192.168.x.x:5178`. The host is reachable as `10.0.2.2` (the Android emulator convention), which I only guessed from the emulator arguments in the log.
- **Feature request:** document the host alias (or `vega device start-port-forwarding --reverse` examples) in the WebView getting-started guide.

## 2026-10-11 · Vega project templates · good news

- `vega project list-templates` has a `vegaWebview` template with a `--uri` flag. One command gave a working WebView app with focus, back key handling and splash screen already wired. It built at the first attempt (`npm run build:debug`, about a minute). This is the fastest path from an existing web game to a Fire TV app, and it deserves a more prominent spot in the docs.

## 2026-10-11 · Vega WebView · the remote's OK button never reaches the page

- **Expected:** the D-pad center arrives in the web page as a key event (Enter or keyCode 23), like the arrows do.
- **Happened:** arrows, Enter and play/pause arrive as normal `keydown`/`keyup` events, but the center button produces nothing in the page: no key event and no click. Injecting `KEY_SELECT` with `inputd-cli` showed nothing in `useTVEventHandler` either, so I could not even reproduce the GUI remote's OK from the command line.
- **Workaround:** in the React Native shell, `useTVEventHandler` (from `@amazon-devices/react-native-kepler`) catches `select` and the app forwards it with `injectJavaScript` as a synthetic Enter. The page also accepts every OK variant (`Enter`, `Select`, `Accept`, keyCodes 13/23/66) and its buttons are real focused `<button>`s in case OK arrives as a click.
- **Feature request:** document how D-pad keys map into WebView pages, ideally deliver select as Enter by default, and make `inputd-cli button_press` names match what the virtual remote sends.
- **Good news:** `inputd-cli` on the device (`vega device run-cmd -c 'inputd-cli button_press KEY_DOWN'`) is a great way to drive a TV app from scripts. It deserves a page in the docs.

## 2026-10-14 · Vega IAP · the manifest entries are split across three pages

- **Expected:** one place that lists every `manifest.toml` entry needed to sell an item and to test it.
- **Happened:** the IAP Overview page lists none of them. The API README (`keplerscript-appstore-iap-lib`) lists the production ones (`com.amazon.iap.core.service`, `/com.amazon.iap.core@IIAPCoreUI`, `/com.amazon.kepler.appstore.iap.purchase.core@IAppstoreIAPPurchaseCoreService`). "Configure App Tester" adds `com.amazon.iap.tester.service` and `/com.amazonappstore.iap.tester@IIAPTesterUI`, and "Use App Tester" repeats only the service, without the module. None of them says whether the tester entries must be removed for a release build.
- **Also:** the docs ask for `~2.13.0` while the `vegaWebview` template pins its other `@amazon-devices` packages with `^`. The build's manifest remapper then adds `/com.amazon.kepler.appstore_iap_lib_2@IAppstoreIapLib_12` by itself, which is nice, but it is not mentioned anywhere, so I spent time wondering whether I had to add it.
- **How I resolved it:** merged the three lists, marked the two tester lines as development only in a comment, and checked the generated `build/private/vega/*/Debug/manifest.toml`.
- **Feature request:** a single "IAP manifest checklist" block on the overview page with a debug and a release column, or a `vega project add-capability iap` command that writes the entries.

## 2026-10-14 · Vega IAP · sandbox mode needs two different JSON files in two different folders

- **Expected:** one config file, as on Fire OS with App Tester.
- **Happened:** App Tester reads the items from `amazon.sdktester.json` in `/tmp/scratch/com.amazonappstore.iap.tester/`, but the app only uses App Tester if a second file, `amazon.config.json` with `{"debug.amazon.sandboxmode": "debug"}`, is in `/tmp/scratch/<your app id>/`. The second file is only on the "Use App Tester" page, inside step 3, and that page even says "This content is different from the JSON file provided for the IAP Tester", which tells you the docs know it is confusing.
- **How I resolved it:** both files are in the repo (`tv-app/amazon.sdktester.json`, `tv-app/amazon.config.json`) and `tv-app/IAP.md` pushes both. The log line `Sandbox parameter debug.amazon.sandboxmode in config file is debug` in `loggingctl log -v <app id>` is the quickest way to confirm the second one was picked up.
- **Feature request:** `vega device iap-sandbox --app <id> --items amazon.sdktester.json` that copies both files and restarts App Tester.

## 2026-10-14 · Vega IAP · the documented `mkdir` step fails, and the folder is invisible

- **Expected:** `vega exec vda shell mkdir /tmp/scratch/com.amazonappstore.iap.tester/` works as written.
- **Happened:** after installing App Tester the folder already exists and belongs to App Tester's sandbox: `mkdir: cannot create directory ... File exists`, and `ls` from `vega device run-cmd` shows it as `d?????????` with `Permission denied`. `vega device copy-to` still writes into it (I checked with `copy-from`), so the step is unnecessary, but the error makes you think the setup is broken.
- **Also:** `vega device copy-from` uses `-o` for the host destination and `-d` for the device serial. I passed `-d <folder>` first and got nothing.
- **Feature request:** drop the `mkdir` step (or use `mkdir -p`), and mention that the folder is not listable from the developer shell.

## 2026-10-14 · App Tester · every call returns FAILED until App Tester is relaunched

- **Expected:** install App Tester once, then launch my app and buy.
- **Happened:** `getProductData`, `getPurchaseUpdates` and `purchase` all returned `FAILED` with no explanation in my app. The app log only said `Invalid request Id present in the response`. The real cause was in the tester's log: `com.amazonappstore.iap.tester.service: performOperation called after shutdown`. The service had stopped after its UI went to the background.
- **How I resolved it:** `vlcm terminate-app -f -p com.amazonappstore.iap.tester`, `vmsgr send pkg://com.amazonappstore.iap.tester.ui`, then launch the game. Everything worked at the first try after that: products with localized prices, purchase with receipt, `notifyFulfillment`, restore after relaunch, and `ALREADY_PURCHASED` on the second purchase.
- **Feature request:** return `NOT_SUPPORTED` (or a dedicated code) with a message such as "App Tester service is not running" to the calling app, instead of a generic `FAILED`.

## 2026-10-14 · Vega IAP API · `valueInMicros` is a BigInt and `productData` is a Map

- **Expected:** response objects I can `JSON.stringify` and send to a WebView.
- **Happened:** `Price.valueInMicros` is typed `bigint` (and `PromotionPlan.priceCycles` too), so a plain `JSON.stringify` of a product would throw `TypeError: Do not know how to serialize a BigInt`, and `ProductDataResponse.productData` is a `Map`, which serializes to `{}`. For a WebView app, where every result crosses a string bridge, this is the first thing that breaks. The `.d.ts` is good, but the package's JavaScript is obfuscated, so I could not check what the bridge really returns and had to handle both Map and plain object.
- **How I resolved it:** convert to a plain product object in the shell, with `priceMicros` as a string.
- **Feature request:** a `toJSON()` helper in the library, or a WebView IAP bridge sample, since the `vegaWebview` template is the recommended path for web games.

## 2026-10-14 · App Tester · a repeat purchase of an owned item still shows the buy dialog

- **Expected:** `purchase` of an ENTITLED SKU the user already owns returns `ALREADY_PURCHASED` right away, as the response code suggests.
- **Happened:** App Tester shows the full "Cancel / Get Item" dialog again; only after "Get Item" does it say "You already own this item." and return `ALREADY_PURCHASED`. Also, after a successful purchase the promise resolves only when the user closes the "Thank you" dialog, not when the order completes.
- **How I resolved it:** the page should not offer a purchase for a SKU listed in `entitlements` (the shell restores them at start), so a real user never hits this. Noted so I do not mistake the second dialog for a bug in my code.
- **Feature request:** document which dialogs App Tester shows for each response, so developers know what the production Appstore will do.

## 2026-10-14 · Vega WebView · `allowSystemKeyEvents` means Back can never leave the app

- **Expected:** with the template's `allowSystemKeyEvents`, the page handles Back where it can, and Back on the top screen exits like every other Fire TV app.
- **Happened:** the WebView registers a `hardwareBackPress` handler that always returns `true` ("Once WebView receives the back key event, it always consumes the event", says the component reference). The template App.tsx has no `onCloseWindow`, so a web page has no way to exit, and a user pressing Back on the title screen gets nothing. According to the WebView guide the key also arrives in the page as `key: "GoBack"` with `keyCode: 27`, the code of Escape but not its name, so code that checks `e.key === "Escape"` misses it.
- **How I resolved it:** the shell registers its own Back handler after the WebView's (BackHandler calls the newest first), sends the page a cancelable Escape `keydown`, and exits with `BackHandler.exitApp()` unless the page calls `preventDefault()` or sets `window.__gwCanGoBack`. `window.close()` also exits through `onCloseWindow`. Verified on the virtual device: Back kept by the page, and Back closing the app when the page ignores it.
- **Feature request:** wire `onCloseWindow={() => BackHandler.exitApp()}` into the `vegaWebview` template, and give `dispatchBackAction` a way to report "not handled" so the system Back can run.

## 2026-10-14 · Vega remote keys · media keys arrive twice, and the event names disagree

- **Expected:** one list of remote events and one place where each key arrives.
- **Happened:** in a WebView page, Play/Pause, Rewind and Fast forward arrive natively (`MediaPlayPause` 179, `MediaRewind` 227, `MediaFastForward` 228, from the WebView guide table), while the TVEventHandler docs list the same buttons for the shell, so it is not clear where they will land and a shell that forwards them risks doubling them. Menu does not reach the page at all. In `TVTypes.d.ts` the comment calls the events `rewind` and `forward`, while the union type says `skip_backward` and `skip_forward`. The TVEventHandler docs require `com.amazon.inputd.service` in the manifest for remote events, but the `vegaWebview` template does not declare it.
- **How I resolved it:** the shell accepts every spelling, forwards each key once, and a small helper in the page drops a duplicate of the same key within 250 ms. Verified with `inputd-cli`: each key reaches the page exactly once. Added `com.amazon.inputd.service` to the manifest.
- **Feature request:** one table of remote keys with three columns (TVEventHandler name, what a WebView page receives, whether it needs `allowSystemKeyEvents`), and the same names in the comment and the type.
