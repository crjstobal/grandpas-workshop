// Where the TV view is served. It must be HTTPS: the Vega WebView refuses plain http://.
// During development this is an HTTPS tunnel to the laptop (see the README); for the
// published build it is the deployed game.
export const TV_URL = 'https://54.217.90.126.sslip.io/tv';
