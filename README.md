# Grandpa's Workshop

A 40 minute Christmas adventure for the whole family, on Fire TV.

Grandpa Felix, toymaker and inventor, hid the pieces of his last invention in his workshop.
The TV tells the story. Every phone in the room becomes a tool: it scans drawings made with
pencil and paper, turns them into 3D objects you can spin to find clues, hunts for warm things
around the house, and shakes to wind up Jingle, Grandpa's clockwork robin, who the family then flies around the TV with the remote. Alexa knows a secret only
Grandpa could have told her. At the end, Grandpa writes the family a letter about everything they
did that night.

No app to install on the phones: scan the QR code on the TV and play in the browser.

## How it plays

The phones bring things into the story; the TV is where the family uses them. Jingle, the
clockwork robin, is the pointer on the TV: the family flies him around with the remote's arrows,
and he opens, carries and places things.

| Chapter | Phones | TV (remote) | Built with |
|---------|--------|-------------|------------|
| The letter | | Find and open the envelope on the door | Point and click, D-pad |
| Wake up Jingle | Shake to wind Jingle's key | Jingle jiggles with every shake | DeviceMotion, live room state |
| The locked door | Draw a key on paper, scan it | Carry your drawn key to the lock | Amazon Nova (vision) judges the drawing |
| The drawer | Spin the 3D key: its back shows four toys, in order | Fly Jingle under those toys to find their numbers, dial the lock | three.js, D-pad |
| The snow globe | Shake the globe, wait for the snow to settle | The big globe swirls with every phone | three.js, canvas particles |
| Something warm | Photograph anything warm or cosy at home | Hand the photo to Jingle | Amazon Nova (vision), attribute matching |
| The toy orchestra | Help remember | Fly Jingle to the toys in the order they played (memory game) | Web Audio |
| Grandpa's secret | "Alexa, open Grandpa's Workshop" | Search the room for the hidden record | MCP server + simulated Alexa+ (Nova) |
| The missing star | Everyone draws ornaments | Hang each one on a hook, place the star | Amazon Nova (vision) |
| Starlight | Shake to make starlight fall | Fly Jingle through the sparkles to fill the star | Live room state |
| Finale | Save the letter as a card | The tree lights up, Grandpa's letter is read aloud | Amazon Nova, ElevenLabs |

Sound effects and Grandpa's music box are synthesized in the browser (Web Audio). The background
music is one loop composed with Eleven Music (cleared for commercial use) by
`npm run music -w server`, crossfaded into itself on the TV.

The full script is in [docs/STORY.md](docs/STORY.md).

## Architecture

```
 Fire TV (Vega OS)                 Phones (browser)                 Alexa+ / any MCP client
 tv-app: WebView  ── /tv           /play/:code                      POST /mcp/:code
        │                              │                                   │
        └──────────── HTTPS ───────────┴───────────────┬───────────────────┘
                                                       │
                             server (Node, Hono)  ─────┤ game engine (pure TS, no vendor SDKs)
                                                       ├ Amazon Bedrock: Nova 2 Lite (vision judge, letter, Alexa sim)
                                                       └ voices: ElevenLabs (key in SSM), Amazon Polly as fallback
```

- `shared/` story script and types shared by every part.
- `server/` game engine, room state with live updates (Server-Sent Events, with a polling
  fallback), the MCP server, and the AWS integrations.
- `web/` the TV view (`/tv`, a fixed 1920x1080 stage driven by the remote) and the phone view
  (`/play/:code`).
- `tv-app/` the Vega OS app: a WebView around the TV view, generated from the official
  `vegaWebview` template.
- `art/` Cinema 4D and Blender sources for the scenes and 3D models.

### MCP server

`/mcp/:code` speaks MCP over Streamable HTTP (stateless, protocol `2025-11-25`), scoped to one
family's game. Tools: `get_story_status`, `get_hint`, `get_grandpas_question`,
`record_family_tradition`; prompt: `open_grandpas_workshop`. The simulated Alexa+ in the phone
connects to the same server as an MCP client, so it uses exactly what a real assistant would.

## Run it locally

Requirements: Node 20+, an AWS account with Bedrock access to Amazon Nova 2 Lite and Polly
(or `GW_MOCK=1` to play offline with canned answers).

```bash
npm install
# terminal 1: game server (AWS credentials from your usual profile)
AWS_PROFILE=your-profile npm run dev:server     # or GW_MOCK=1 npm run dev:server
# terminal 2: web
npm run dev:web
# terminal 3: HTTPS for phones (camera, mic and motion need it) and for the Fire TV WebView
cloudflared tunnel --url http://localhost:5178
```

Restart the server with `GW_PUBLIC_URL=<tunnel url>` so the QR code points at the tunnel, then
open `<tunnel url>/tv` on a big screen.

### On Fire TV (Vega OS)

```bash
cd tv-app
# set TV_URL in src/config.ts to <tunnel url>/tv
npm install && npm run build:debug
vega virtual-device start          # see FRICTION.md if this fails on Apple Silicon
vega run-app build/aarch64-debug/grandpasworkshop_aarch64.vpkg com.grandpasworkshop.tv.main -d VirtualDevice
```

## Deploy on AWS

`infra/core.yaml` is a CloudFormation stack, launched once by an admin: one Graviton instance
(t4g.nano) running the game server, Caddy in front for HTTPS on a fixed address, and a
least-privilege role (Nova on Bedrock, Polly, one SSM parameter for the voice key, the releases
bucket). No SSH: `infra/deploy.sh` builds the web app, uploads a release to S3 and installs it
through SSM Run Command.

```bash
AWS_PROFILE=your-profile infra/deploy.sh
```

Live build: https://54.217.90.126.sslip.io/tv (the Fire TV app in `tv-app/` points here).

## AWS services used

- **Amazon Bedrock (Amazon Nova 2 Lite):** looks at every photo (drawings and objects) and
  decides generously whether it matches what Jingle asked for, writing Jingle's reaction; plays
  Alexa+ through the MCP server; writes Grandpa's final letter from what the family did.
- **Amazon Polly (neural voices):** the fallback voices for the narrator, Jingle, Grandpa and
  Alexa. The main voices are ElevenLabs: scripted lines are pre-rendered into `web/public/voice`,
  dynamic ones (names, Nova's words, the letter) are synthesized live with the key read from SSM.
- **Amazon EC2 (Graviton t4g.nano):** runs the game server; games live in memory and are saved to
  disk, so they survive restarts and deploys.
- **AWS Systems Manager:** Parameter Store holds the voice key (SecureString, read by the
  instance role); Run Command installs each release, so the server has no SSH.
- **Amazon S3:** the release bucket. **AWS CloudFormation:** the whole stack in `infra/core.yaml`.

## License

MIT, see [LICENSE](LICENSE). Music: "Deck the Halls" (traditional, public domain),
synthesized in the browser; background loop generated with Eleven Music.
