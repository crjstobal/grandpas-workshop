// Remote keys for the web page.
//
// What reaches a Vega WebView page by itself (Build Web Apps with WebView, 0.24): the arrows,
// Enter, MediaPlayPause (179), MediaRewind (227) and MediaFastForward (228). Back arrives as
// key "GoBack" with keyCode 27, and only when allowSystemKeyEvents is set. The D-pad center
// (select) and the menu button arrive as nothing, so the shell forwards them.
//
// The shell forwards every key it hears in useTVEventHandler as a synthetic keydown + keyup on
// the focused element (it bubbles up to document and window). Because some of those keys can
// ALSO arrive natively, a small helper installed in the page drops the second copy when the
// same key (same `key` or same `keyCode`) shows up twice within DEDUPE_MS, whichever came first.

const DEDUPE_MS = 250;

/** eventType from useTVEventHandler -> DOM key. Back is handled separately (see App.tsx). */
export const FORWARDED_KEYS: Record<string, {key: string; code: string; keyCode: number}> = {
  select: {key: 'Enter', code: 'Enter', keyCode: 13},
  enter: {key: 'Enter', code: 'Enter', keyCode: 13},
  playpause: {key: 'MediaPlayPause', code: 'MediaPlayPause', keyCode: 179},
  menu: {key: 'ContextMenu', code: 'ContextMenu', keyCode: 93},
  context_menu: {key: 'ContextMenu', code: 'ContextMenu', keyCode: 93},
  // The TVTypes.d.ts comment says "rewind" / "forward", its union type says "skip_backward" /
  // "skip_forward". Accept all of them.
  rewind: {key: 'MediaRewind', code: 'MediaRewind', keyCode: 227},
  skip_backward: {key: 'MediaRewind', code: 'MediaRewind', keyCode: 227},
  forward: {key: 'MediaFastForward', code: 'MediaFastForward', keyCode: 228},
  fast_forward: {key: 'MediaFastForward', code: 'MediaFastForward', keyCode: 228},
  skip_forward: {key: 'MediaFastForward', code: 'MediaFastForward', keyCode: 228},
};

/**
 * Idempotent page helper. Defines window.__gwShell.key(key, code, keyCode), which dispatches a
 * cancelable keydown and keyup and returns "handled" (the page called preventDefault on the
 * keydown), "unhandled", or "dup" (the same key arrived natively a moment ago, nothing sent).
 * Also sets window.__gwFireTV = true so the page knows it runs inside the Fire TV shell.
 */
export const PAGE_HELPER = `(function(){
if (window.__gwShell) return;
window.__gwFireTV = true;
var last = {};
var now = function(){ return (window.performance && performance.now) ? performance.now() : Date.now(); };
var seen = function(e){ return last['k:' + e.key] || last['c:' + e.keyCode]; };
var mark = function(key, keyCode, synthetic){ var v = {t: now(), s: synthetic}; last['k:' + key] = v; last['c:' + keyCode] = v; };
window.addEventListener('keydown', function(e){
  if (!e.isTrusted) return;
  var l = seen(e);
  if (l && l.s && now() - l.t < ${DEDUPE_MS}) { e.stopImmediatePropagation(); e.preventDefault(); return; }
  mark(e.key, e.keyCode, false);
}, true);
window.__gwShell = { key: function(key, code, keyCode){
  var l = last['k:' + key] || last['c:' + keyCode];
  if (l && !l.s && now() - l.t < ${DEDUPE_MS}) return 'dup';
  mark(key, keyCode, true);
  var t = document.activeElement || document.body || document;
  var init = {key: key, code: code, keyCode: keyCode, which: keyCode, bubbles: true, cancelable: true};
  var down = new KeyboardEvent('keydown', init);
  var handled = !t.dispatchEvent(down);
  t.dispatchEvent(new KeyboardEvent('keyup', init));
  return handled ? 'handled' : 'unhandled';
}};
})();`;

/** Script that forwards one key. */
export function keyScript(k: {key: string; code: string; keyCode: number}): string {
  return `${PAGE_HELPER} window.__gwShell.key(${JSON.stringify(k.key)}, ${JSON.stringify(
    k.code,
  )}, ${k.keyCode}); true;`;
}

/**
 * Script for the remote's Back button. The page gets an Escape keydown (keyCode 27). If it calls
 * preventDefault on it, or has set window.__gwCanGoBack = true, the page keeps the Back press.
 * Otherwise the page posts {type: "app", action: "exit"} and the shell does the system Back
 * (BackHandler.exitApp), which is what a Fire TV user expects on the top screen.
 */
export const BACK_SCRIPT = `${PAGE_HELPER} (function(){
var r = window.__gwShell.key('Escape', 'Escape', 27);
if (r !== 'handled' && window.__gwCanGoBack !== true && window.ReactNativeWebView) {
  window.ReactNativeWebView.postMessage(JSON.stringify({type: 'app', action: 'exit'}));
}
})(); true;`;
