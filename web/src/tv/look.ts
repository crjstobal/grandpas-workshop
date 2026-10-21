// How Jingle looks tonight. Once the family buys Jingle's Knitted Scarf he wears it in every sprite
// (flying, perched, dancing, the roof flight) for the rest of the game. TvApp sets it from the room state.
let scarf = false;

export const setScarf = (on: boolean) => { scarf = on; };
export const hasScarf = () => scarf;

/** Flying frame a (0, wings up) or b (1, wings down). */
export const flySprite = (frame: number) => `/scenes/jingle_fly_${frame ? "b" : "a"}${scarf ? "_scarf" : ""}.png`;

/** Perched on the garden ledge: Jingle and the still layer with his shadow in the snow. */
export const gardenSprites = (pose: "sleep" | "cold" | "awake") => {
  const p = scarf && pose === "awake" ? "awake_scarf" : pose;
  return { body: `/scenes/garden_jingle_${p}.png`, ground: `/scenes/garden_ground_${p}.png` };
};
