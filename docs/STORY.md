# Grandpa's Workshop: the story

A Christmas adventure for the whole family, about 20 minutes. The TV tells the story and is
played with the Fire TV remote, one or two phones are the family's tools (kids share them, turn
by turn), paper and pencils are part of the game, and Alexa has been asked by Grandpa to keep an
eye on the family all night.

## The thread

It is Christmas Eve. Grandpa Felix, toymaker and inventor, is on his way home by train, but the
train is stuck in a blizzard and he can't see a thing. He sends the family a voice message
through Alexa: his Star Machine, in the workshop at the end of the garden, is a lighthouse. If
the family lights it, he will see it from the train and find his way home. Jingle, his clockwork
robin, knows how it works, but he is asleep on the workshop window, out in the snow.

Every chapter is a step towards lighting the star. The finale is Grandpa coming home.

## Chapters

| # | Chapter | Why it happens | On the phones | On the TV (remote) |
|---|---------|----------------|---------------|--------------------|
| 0 | A message from Grandpa | Alexa: "You have one new message, from Grandpa Felix." His train is stuck; light the star | Scan the QR code, add everyone who shares this phone | OK when ready |
| 1 | Wake up, Jingle | Jingle is asleep on the window ledge, his key run down | **Everyone shakes** to wind his key | His key clicks and he jiggles with every shake |
| 2 | Brrr! | He has been out in the snow all night: frozen gears | **Turns:** each player photographs something warm at home (Nova checks it) | Pick a warm thing with the arrows, OK sends it to Jingle; the frost melts |
| 3 | The locked door | Grandpa took the key. "A key is only a drawing that believes in itself" | **Draw a key** on paper and scan it: it becomes a 3D brass key with four of Grandpa's toys engraved on the back | Jingle, now flying, carries the drawn key to the lock |
| 4 | The Star Machine | Inside, three pieces are missing: the heart gear, Grandpa's song, the star | | The checklist of pieces; OK starts the search |
| 5 | Piece one: the heart gear | The drawer under the toy shelf has a four number lock; Grandpa hides his numbers on his toys | Spin the 3D key: the back shows four toys, in order | Fly Jingle under those toys to find a number on each (train 2, drum 4, elephant 1, house 2), dial them in the key's order with the D-pad |
| 5b | The gear in the snow globe | The gear floats inside a snow globe and only settles for a steady hand | **Turns, gyroscope:** tilt the phone to keep the gear in the golden circle | The big globe mirrors the gear live |
| 6 | Piece two: Grandpa's song | Only the toys remember his song; the gramophone records them | | **Toy orchestra:** the toys play, Jingle repeats the tune (three rounds) |
| 6b | The gramophone | The new record keeps a secret: Grandpa's voice, then the toys want to dance | **Statues:** dance while the music plays, freeze when it stops | Jingle must freeze too: any arrow press during the freeze and he's caught |
| 7 | Grandpa's tree | The Star Machine is a tree that only shines when the family decorates it | **Turns:** draw ornaments on paper and scan them | Jingle hangs each one on the hook you choose |
| 8 | Piece three: the star | The star's box has a memory lock: it opens for a family that remembers the night | Answer Alexa by voice | **Memory lock:** Alexa's three questions about what this family really did; pick with the D-pad |
| 9 | Starlight | The star is cold and dark | **Everyone shakes** to make starlight fall | Jingle flies into the sparkles to catch them |
| 10 | Up to the roof | A lighthouse belongs up high | Shake for a warm wind (boost and shield) | **Flight:** OK flaps, dodge smoke, snowballs and icicles |
| 11 | Grandpa's coming home | The star shines; far away the train starts moving. Grandpa: "I can see it!" | **Gingerbread:** decorate it with a finger, live on the TV | The cookie appears on the TV as you draw; then Grandpa's letter, written by Nova for this family and read in his voice |
| 12 | After the story | Alexa offers the next adventure, The Snowed-In Sleigh | The grown-up approves the purchase on their phone | Or buy it on the TV with the Amazon Appstore (Vega In-App Purchasing) |

## Alexa's part

Alexa is not a quiz bot bolted on: Grandpa asked her to watch over the family, so she
- delivers Grandpa's message,
- remembers the night (who brought what, who drew the key) and turns it into the memory lock,
- gives hints (always free),
- in the cold chapter, offers Jingle's Knitted Scarf as the other way to warm him up (a cosmetic he then wears all night),
- sells the next adventure with an Alexa+ style checkout: offer, price plus tax, explicit yes,
  then the grown-up's approval on their phone, then a receipt,
- picks up where the family left off: "Alexa, where did we leave Grandpa's Workshop?"

All of it goes through the game's own MCP server (spec 2025-11-25, Streamable HTTP).

## Design rules

- **One or two phones are enough.** Kids rarely have their own: several players can share a
  phone, and turn chapters say "pass the phone to Lucia".
- **Attributes, never objects.** Nobody has everything at home: "something warm", never "a mirror".
- **Generous judge.** Children draw. A wobbly key is a key.
- **Everyone plays.** Shakes add up, every drawing ends up on the tree, statues needs the whole room.
- **The remote matters.** D-pad, OK, play/pause (pauses the voices), menu (asks Alexa for a hint)
  and back (closes what is open, asks before leaving).
- **No app to install** on the phones: everything runs in the browser.
- **One voice at a time.** The narrator and Grandpa are never interrupted; Jingle's chatter is
  dropped when it would be stale.
