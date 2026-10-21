// The script: what each chapter looks like, what the narrator and Jingle say, and Grandpa's
// recorded messages. Pure data, used by the server (lines, hints, Alexa) and by both views.
//
// The thread: on Christmas Eve Grandpa Felix's train is stuck in a blizzard on the way home.
// His Star Machine, in the workshop at the end of the garden, is a lighthouse: if the family
// lights it, he will see it from the train and find his way home. Every chapter is a step
// towards lighting it.
import type { ChapterId, Product, ProductId } from "./types";

export interface Chapter {
  id: ChapterId;
  title: string;
  scene: string;
  /** What the narrator says when the chapter starts. Short: one or two sentences. */
  narration: string;
  /** What Jingle says right after the narrator, if anything. */
  jingle?: string;
  /** What the phones ask the players to do. Empty when there is nothing to do on the phone. */
  phoneTask: string;
  /** What Alexa says when someone asks her for a hint in this chapter. */
  hint: string;
  /** The remote moves the story forward (OK) in this chapter. */
  remoteAdvances: boolean;
  /** Goes around the family one player at a time ("pass the phone"). */
  turns?: boolean;
}

/** Grandpa's recorded voice messages. Read by his own voice, never by the narrator. */
export const GRANDPA = {
  stuck: "Hello, my dears, it's Grandpa. My train is stuck in the snow, halfway home, and I can't see a thing out here. But listen. My Star Machine, in the workshop, is a lighthouse. Light it, and I'll see it from the train. Jingle knows how. He's asleep on the workshop window. Wind him up! I love you.",
  song: "Ha ha! You played my song! Clever, clever family. That's two pieces. The last one is the star, locked in my little box on the workbench. It only opens for people who remember the night. Alexa has been watching. Ask her! But first, my tree needs decorating. It only shines for a family that decorates it.",
  seeIt: "I can see it! I can see the light from here! The train is moving again. Hold on, my dears. I'm coming home.",
  home: "Ho ho! I'm home! Look at you all. Look at my star! Now, is that gingerbread for me?",
} as const;

export const ALEXA_LINES = {
  newMessage: "You have one new message, from Grandpa Felix.",
  memoryIntro: "Grandpa asked me to keep an eye on you tonight, and I did. His box only opens if you remember. Here's the first question.",
  memoryDone: "That's all three! You remember everything. Grandpa's box is open.",
} as const;

/** The number engraved on the back of the key. It opens the drawer. Christmas Eve: 24 of December. */
export const DRAWER_CODE = "2412";

/** The toy orchestra plays this many tunes, each one note longer. */
export const ORCHESTRA_ROUNDS = 3;

/** Statues: how many times the family has to freeze. */
export const DANCE_ROUNDS = 3;

export const CHAPTERS: Chapter[] = [
  {
    id: "lobby",
    title: "Grandpa's Workshop",
    scene: "title",
    narration: "",
    phoneTask: "",
    hint: "Scan the code on the TV with a phone and add everyone who is playing. Kids can share a phone. Then press OK on the remote.",
    remoteAdvances: true,
  },
  {
    id: "message",
    title: "A message from Grandpa",
    scene: "title",
    narration: "",
    phoneTask: "",
    hint: "Listen to Grandpa's message, then press OK on the remote.",
    remoteAdvances: true,
  },
  {
    id: "wind_jingle",
    title: "Wake up, Jingle",
    scene: "garden_empty",
    narration: "Out in the snowy garden, on the workshop window, a little brass robin is fast asleep. His wind-up key has run all the way down.",
    phoneTask: "Shake your phone to wind Jingle's key! Everyone together.",
    hint: "Shake the phones to turn Jingle's key. Every shake adds up, so everyone shake together!",
    remoteAdvances: false,
  },
  {
    id: "warm_jingle",
    title: "Brrr!",
    scene: "garden_empty",
    narration: "Jingle is awake, but he has been out in the snow all night. His little gears are frozen stiff.",
    jingle: "Brrr! B-b-bring me something warm, please! Anything cosy from your house!",
    phoneTask: "Find something warm or cosy at home and show it to Jingle.",
    hint: "Anything warm or cosy works: a sock, a blanket, a mug, a scarf, even a cat. Take a photo of it, then carry it to Jingle with the remote. Or buy him a knitted scarf from the tray on the TV.",
    remoteAdvances: false,
    turns: true,
  },
  {
    id: "door_key",
    title: "The locked door",
    scene: "door",
    narration: "Grandpa took the workshop key with him. But he always said: a key is only a drawing that believes in itself.",
    jingle: "Draw me a key! Any key at all, as long as you believe in it.",
    phoneTask: "Draw a key on paper, then scan it.",
    hint: "Draw any key on paper and scan it with a phone. Then fly Jingle to the lock on the TV with the remote and press OK.",
    remoteAdvances: false,
  },
  {
    id: "workshop",
    title: "The Star Machine",
    scene: "machine",
    narration: "Inside, Jingle lights a lantern, and there it is: Grandpa's Star Machine. But three pieces are missing.",
    jingle: "The heart gear, Grandpa's song, and the star! Without all three, it won't light up. Let's find them!",
    phoneTask: "",
    hint: "Press OK on the remote to start looking for the three missing pieces.",
    remoteAdvances: true,
  },
  {
    id: "drawer",
    title: "Piece one: the heart gear",
    scene: "shelf",
    narration: "Grandpa keeps his most precious things in the drawer under the toy shelf. It has a four number lock.",
    jingle: "Grandpa engraves everything. Maybe the number is on something you already have?",
    phoneTask: "Turn your key around on the phone. Something is written on the back.",
    hint: "Spin the key you drew on the phone and read the back. Then fly Jingle to the lock on the TV, press OK and dial the numbers.",
    remoteAdvances: false,
  },
  {
    id: "globe",
    title: "The gear in the snow globe",
    scene: "shelf",
    narration: "In the drawer there is a snow globe, and floating inside it, the heart gear. It only settles for a steady hand.",
    jingle: "Tilt the globe very gently and keep the gear in the middle. One at a time!",
    phoneTask: "Tilt your phone to keep the gear in the golden circle.",
    hint: "Hold the phone flat and tilt it slowly, so the gear stays inside the golden circle until the ring fills up. Then pass the phone to the next player.",
    remoteAdvances: false,
    turns: true,
  },
  {
    id: "orchestra",
    title: "Piece two: Grandpa's song",
    scene: "shelf",
    narration: "With the heart gear back, the toys on the shelf wake up. They are the only ones who remember Grandpa's song.",
    jingle: "Listen to the toys, then fly me to them in the same order. The gramophone is recording!",
    phoneTask: "",
    hint: "The toys play a tune on the TV. Fly Jingle to each toy in the same order and press OK on each one. Everyone can help remember!",
    remoteAdvances: false,
  },
  {
    id: "record",
    title: "The gramophone",
    scene: "phonograph",
    narration: "The old gramophone has cut the toys' tune into a brand new record. Grandpa used to say his records always keep a secret.",
    jingle: "Let's put it on! Fly me to the gramophone.",
    phoneTask: "When the music plays, dance! When it stops, freeze!",
    hint: "Put the record on the gramophone with the remote. Then dance with your phones while the music plays, and stay perfectly still when it stops. Jingle has to freeze too!",
    remoteAdvances: false,
  },
  {
    id: "ornaments",
    title: "Grandpa's tree",
    scene: "machine",
    narration: "The Star Machine is really a Christmas tree, and Grandpa's tree only shines when the family decorates it.",
    jingle: "Everyone draw an ornament on paper. Then I'll hang them up!",
    phoneTask: "Draw a Christmas ornament on paper and scan it.",
    hint: "Each player draws an ornament and scans it. Then hang each one on the tree with the remote.",
    remoteAdvances: false,
    turns: true,
  },
  {
    id: "memory",
    title: "Piece three: the star",
    scene: "workbench",
    narration: "Grandpa's star is locked in a little box on the workbench. Its lock is made of memories.",
    phoneTask: "Answer Alexa's questions. Pick the answer on the TV with the remote, or just tell Alexa.",
    hint: "Alexa asks about things that happened tonight. Choose the answer on the TV with the arrows and press OK, or say it to Alexa.",
    remoteAdvances: false,
  },
  {
    id: "starlight",
    title: "Starlight",
    scene: "machine",
    narration: "The box opens. Grandpa's star is cold and dark. It needs starlight, and starlight only falls when the whole family shakes it loose.",
    jingle: "Shake your phones and I'll catch the sparkles!",
    phoneTask: "Shake your phone to make starlight fall!",
    hint: "Shake the phones to make sparkles fall on the TV, and fly Jingle to catch them.",
    remoteAdvances: false,
  },
  {
    id: "flight",
    title: "Up to the roof",
    scene: "roof",
    narration: "The star is shining. A lighthouse belongs up high, so Jingle has to carry it to the top of the roof, through the snow.",
    jingle: "Press OK to flap my wings! And shake your phones for a warm wind!",
    phoneTask: "Shake your phone to send Jingle a warm wind!",
    hint: "Press OK on the remote to make Jingle flap and dodge the smoke and the snowballs. Shaking the phones gives him a boost.",
    remoteAdvances: false,
  },
  {
    id: "finale",
    title: "Grandpa's coming home",
    scene: "beacon",
    narration: "The star shines over the snow, as bright as a lighthouse. Far away, a little train starts to move.",
    phoneTask: "Decorate a gingerbread for Grandpa!",
    hint: "Decorate the gingerbread on your phone with your finger: it appears on the TV. Grandpa is almost home!",
    remoteAdvances: false,
  },
];

export const chapterOf = (id: ChapterId) => CHAPTERS.find((c) => c.id === id)!;
export const nextChapter = (id: ChapterId): ChapterId | null => {
  const i = CHAPTERS.findIndex((c) => c.id === id);
  return CHAPTERS[i + 1]?.id ?? null;
};
/** Chapter number shown on the TV (the lobby and Grandpa's message are a prologue). */
export const chapterNumber = (id: ChapterId) => Math.max(0, CHAPTERS.findIndex((c) => c.id === id) - 1);
export const CHAPTER_COUNT = CHAPTERS.length - 2;

// ---- what the family can buy (simulated: no real money moves) ----

export const PRODUCTS: Record<ProductId, Product> = {
  snowed_in_sleigh: {
    id: "snowed_in_sleigh",
    title: "The Snowed-In Sleigh",
    pitch: "A new 20 minute family adventure: Jingle has to fly Grandpa's old sleigh out of a blizzard.",
    priceSpoken: "two dollars and ninety-nine cents",
    price: 2.99,
    tax: 0.24,
    kind: "story",
  },
  jingle_scarf: {
    id: "jingle_scarf",
    title: "Jingle's Knitted Scarf",
    pitch: "A green knitted scarf for Jingle. It warms him up straight away, and he wears it for the rest of the night.",
    priceSpoken: "ninety-nine cents",
    price: 0.99,
    tax: 0.08,
    kind: "extra",
  },
};

/** More stories, shown in the store as coming soon. */
export const COMING_SOON = [
  { title: "Jingle and the Northern Lights", pitch: "A trip to the top of the world to fix the lights in the sky." },
  { title: "The Lighthouse Keeper's Cat", pitch: "A seaside mystery for the whole family, one stormy night." },
];
