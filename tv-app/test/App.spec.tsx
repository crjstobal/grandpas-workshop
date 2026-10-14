import * as React from 'react';
import {render} from '@testing-library/react-native';
import {App} from '../src/App';

jest.mock('@amazon-devices/webview', () => ({
  WebView: 'WebView',
}));

// IAP is not available in Jest: every call must turn into NOT_SUPPORTED, not a crash.
jest.mock('@amazon-devices/keplerscript-appstore-iap-lib', () => ({
  PurchasingService: {
    getPurchaseUpdates: jest.fn(() => Promise.reject(new Error('no IAP in tests'))),
  },
}));

jest.mock('@amazon-devices/react-native-kepler', () => ({
  usePreventHideSplashScreen: jest.fn(),
  useHideSplashScreenCallback: jest.fn(() => jest.fn()),
  useTVEventHandler: jest.fn(),
  StyleSheet: {create: (styles: unknown) => styles},
  View: 'View',
  BackHandler: {addEventListener: jest.fn(() => ({remove: jest.fn()})), exitApp: jest.fn()},
}));

describe('App', () => {
  it('renders without crashing', () => {
    const {toJSON} = render(<App />);
    expect(toJSON()).toBeTruthy();
  });
});
