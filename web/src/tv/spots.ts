// Things you can point at in each rendered scene (stage pixels, measured on the 1920x1080 renders),
// and what Jingle says when you poke the ones that are just for fun.
import type { Hotspot } from "./Hand";
import type { sfx } from "../sfx";

export interface FunSpot extends Hotspot {
  line?: string;
  sound?: keyof typeof sfx;
}

/** The snowy garden: where Jingle sits frozen on the workshop's window ledge (garden render,
 * art/blender/garden_jingle.json). His sprites are drawn as a 478px square at (435, 325). */
export const GARDEN = {
  jingle: { id: "jingle", x: 647, y: 606, r: 130, label: "Jingle" },
  sprite: { x: 435, y: 325, size: 478 },
};

export const DOOR = {
  envelope: { id: "envelope", x: 800, y: 485, r: 75, label: "Grandpa's note" },
  keyhole: { id: "keyhole", x: 1047, y: 560, r: 80, label: "The lock" },
  fun: [
    { id: "lantern", x: 487, y: 195, r: 70, label: "Lantern", line: "Grandpa's lantern. It never goes out on Christmas Eve.", sound: "chime" },
    { id: "wreath", x: 905, y: 200, r: 110, label: "Wreath", line: "Holly and berries! Grandpa picks them every December.", sound: "sparkle" },
    { id: "window", x: 1565, y: 370, r: 150, label: "Round window", line: "I can see the workbench in there... it's so cosy inside!", sound: "knock" },
  ] as FunSpot[],
};

export const SHELF = {
  lock: { id: "lock", x: 908, y: 735, r: 120, label: "Combination lock" },
  fun: [
    { id: "nutcracker_l", x: 483, y: 170, r: 75, label: "Nutcracker", line: "Ten-hut! The nutcracker guards Grandpa's toys.", sound: "drum" },
    { id: "elephant", x: 725, y: 215, r: 90, label: "Wooden elephant", line: "Grandpa carved this elephant when he was a boy.", sound: "knock" },
    { id: "top_small", x: 898, y: 262, r: 45, label: "Spinning top", line: "Wheee! It spins for a whole minute.", sound: "whirr" },
    { id: "stacker", x: 962, y: 225, r: 60, label: "Ring stacker", line: "Red, yellow, blue, green... all in the right order.", sound: "knock" },
    { id: "house", x: 1152, y: 235, r: 75, label: "Toy house", line: "It's a tiny copy of this workshop!", sound: "chime" },
    { id: "nutcracker_r", x: 1378, y: 170, r: 75, label: "Nutcracker", line: "His brother guards the other side.", sound: "drum" },
    { id: "train", x: 610, y: 555, r: 110, label: "Toy train", line: "Toot toot! All aboard the Christmas express!", sound: "toot" },
    { id: "blocks", x: 1015, y: 570, r: 70, label: "Blocks", line: "Grandpa's first toys were blocks just like these.", sound: "knock" },
    { id: "top", x: 1172, y: 570, r: 60, label: "Big top", line: "Whirr! Round and round it goes.", sound: "whirr" },
    { id: "drum", x: 1305, y: 578, r: 75, label: "Drum", line: "Rat-a-tat-tat!", sound: "drum" },
    { id: "drawer_l", x: 515, y: 738, r: 60, label: "Drawer", line: "Only buttons and string in this one.", sound: "knock" },
    { id: "drawer_r", x: 1313, y: 745, r: 60, label: "Drawer", line: "Sawdust and a pencil stub. Not here!", sound: "knock" },
  ] as FunSpot[],
};

export const PHONOGRAPH = {
  gramophone: { id: "gramophone", x: 1065, y: 470, r: 120, label: "Gramophone" },
  hiding: [
    { id: "cushion", x: 1700, y: 780, r: 95, label: "Cushion" },
    { id: "basket", x: 1355, y: 935, r: 90, label: "Basket" },
    { id: "gift_red", x: 455, y: 985, r: 75, label: "Red present" },
    { id: "gift_green", x: 822, y: 1000, r: 65, label: "Green present" },
  ] as Hotspot[],
  fun: [
    { id: "tree", x: 640, y: 560, r: 130, label: "Little tree", line: "This little tree is waiting for its lights.", sound: "sparkle" },
    { id: "window", x: 440, y: 210, r: 110, label: "Window", line: "Look at the snow! It's getting deeper.", sound: "chime" },
    { id: "lamp", x: 975, y: 560, r: 40, label: "Oil lamp", line: "Careful, it's warm. Mmm, nice and warm.", sound: "chime" },
  ] as FunSpot[],
};

/** The hooks on the Star Machine's tree (machine.jpg), where an ornament's loop hangs. */
export const HOOKS: [number, number][] = [
  [1041, 426], [919, 742], [1182, 617], [973, 593], [1073, 679], [1019, 375],
  [1057, 743], [1096, 515], [965, 681], [1082, 390], [1019, 650],
];
export const STAR_SOCKET = { id: "socket", x: 1094, y: 133, r: 80, label: "Top of the tree" };

/** Jingle's perch on the workbench, where he takes the warm things. */
export const JINGLE_SPOT = { id: "jingle", x: 1178, y: 690, r: 130, label: "Jingle's perch" };
