import {WebView} from '@amazon-devices/webview';
import * as React from 'react';
import {useCallback, useEffect, useRef} from 'react';
import {BackHandler, View, StyleSheet} from 'react-native';
import {TV_URL} from './config';
import {
  useHideSplashScreenCallback,
  usePreventHideSplashScreen,
  useTVEventHandler,
} from '@amazon-devices/react-native-kepler';
import {
  SslErrorData,
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewMessageEvent,
  WebViewNavigationEvent,
} from '@amazon-devices/webview/dist/types/WebViewTypes';
import {handleIapMessage, iapEventScript, restore, IapDetail, IapRequest} from './iap';
import {BACK_SCRIPT, FORWARDED_KEYS, PAGE_HELPER, keyScript} from './keys';

export const App = () => {
  const webRef = useRef<{injectJavaScript: (js: string) => void} | null>(null);
  const loadedRef = useRef(false);
  // Result of the getPurchaseUpdates call made at app start, re-sent after every page load.
  const startupRestoreRef = useRef<IapDetail | null>(null);

  const inject = useCallback((js: string) => {
    try {
      webRef.current?.injectJavaScript(js);
    } catch (e) {
      console.error(`[shell] injectJavaScript failed: ${String(e)}`);
    }
  }, []);

  const sendIap = useCallback(
    (detail: IapDetail) => {
      if (loadedRef.current) inject(iapEventScript(detail));
    },
    [inject],
  );

  // Restore entitlements once at app start (Amazon recommends getPurchaseUpdates on launch).
  useEffect(() => {
    restore('startup')
      .then(detail => {
        startupRestoreRef.current = detail;
        console.info(`[iap] startup restore: ${detail.status} ${detail.entitlements.join(',')}`);
        sendIap(detail);
      })
      .catch(e => console.error(`[iap] startup restore threw: ${String(e)}`));
  }, [sendIap]);

  // Remote keys the page does not get by itself (see keys.ts). eventKeyAction 0 is key down.
  // Back is not handled here: it goes through BackHandler below.
  useTVEventHandler((evt: {eventType: string; eventKeyAction?: number}) => {
    if (evt.eventKeyAction !== 0) return;
    const k = FORWARDED_KEYS[evt.eventType];
    if (k && loadedRef.current) inject(keyScript(k));
  });

  // Back. With allowSystemKeyEvents the WebView registers its own hardwareBackPress handler that
  // always consumes Back and sends "GoBack" (keyCode 27) to the page, so the app would never
  // exit. This handler is registered after the WebView's (parent effects run after child
  // effects) and BackHandler calls the newest handler first, so it runs instead: the page gets
  // Escape and decides; if it does not keep the press, it asks the shell to exit (see keys.ts).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!loadedRef.current || !webRef.current) {
        BackHandler.exitApp(); // no page to ask (still loading or failed): plain system Back
        return true;
      }
      inject(BACK_SCRIPT);
      return true;
    });
    return () => sub.remove();
  }, [inject]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let msg: unknown;
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return; // not ours
      }
      if (!msg || typeof msg !== 'object') return;
      const m = msg as {type?: string; action?: string};
      if (m.type === 'app' && m.action === 'exit') {
        BackHandler.exitApp();
        return;
      }
      if (m.type !== 'iap') return;
      handleIapMessage(m as IapRequest)
        .then(detail => {
          if (detail) sendIap(detail);
        })
        .catch(e => {
          const r = m as IapRequest;
          sendIap({
            requestId: typeof r.requestId === 'string' ? r.requestId : '',
            action: r.action,
            ok: false,
            status: 'NOT_SUPPORTED',
            entitlements: [],
            error: String(e),
          });
        });
    },
    [sendIap],
  );

  // By default splash screen is shown in app launch, as the splash
  // screen images are bundled in this app (assets/raw/ folder)
  // Declare that application wants to extend splash screen lifecycle
  usePreventHideSplashScreen();
  const hideSplashScreenCallback = useHideSplashScreenCallback();
  return (
    <View style={styles.container}>
      <WebView
        ref={webRef as never}
        style={styles.webview}
        allowSystemKeyEvents
        allowsDefaultMediaControl
        domStorageEnabled
        hasTVPreferredFocus
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="compatibility"
        // Installs the key helper and window.__gwFireTV before the page's own scripts run.
        injectedJavaScriptBeforeContentLoaded={PAGE_HELPER}
        // thirdPartyCookiesEnabled
        // userAgent={''}
        source={{
          // headers: {},
          uri: TV_URL,
        }}
        onMessage={onMessage}
        // window.close() in the page also exits the app.
        onCloseWindow={() => BackHandler.exitApp()}
        onLoad={(_event: WebViewNavigationEvent) => {
          console.info('Page loading completed...');
          loadedRef.current = true;
          // Make sure the helper exists even if the pre-load injection did not run.
          inject(`${PAGE_HELPER} true;`);
          if (startupRestoreRef.current) {
            sendIap({...startupRestoreRef.current});
          }
          // Hide the splash screen
          hideSplashScreenCallback();
        }}
        onLoadStart={(_event: WebViewNavigationEvent) => {
          console.info('Page loading started...');
          loadedRef.current = false;
        }}
        onError={({
          nativeEvent: {code, url, description},
        }: WebViewErrorEvent) => {
          console.error(`[onError]: (${code}: ${url}) ${description}`);
        }}
        onHttpError={({
          nativeEvent: {url, statusCode: code, description, isMainFrame},
        }: WebViewHttpErrorEvent) => {
          console.error(`[onHttpError]: (${code}: ${url}) ${description}`);
          console.error(`[onHttpError]: isMainFrame: ${isMainFrame}`);
        }}
        onSslError={({code, url, description}: SslErrorData) => {
          console.error(`[onSslError]: (${code}: ${url}) ${description}`);
        }}
      />
    </View>
  );
};

// Styles for layout, which are necessary for proper focus behavior
const styles = StyleSheet.create({
  container: {flex: 1},
  webview: {backgroundColor: '#0d1b2a'},
});
