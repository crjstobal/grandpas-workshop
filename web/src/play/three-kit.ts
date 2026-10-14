// Shared three.js setup for the phone viewers: renderer, studio lighting, drag-to-turn.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export function makeStage(host: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const warm = new THREE.DirectionalLight(0xffd9a0, 1.2);
  warm.position.set(2, 3, 4);
  scene.add(warm, new THREE.AmbientLight(0xffffff, 0.25));

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  camera.position.set(0, 0, 3.2);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableZoom = true;
  controls.minDistance = 1.6;
  controls.maxDistance = 5;
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.2;
  renderer.domElement.addEventListener("pointerdown", () => { controls.autoRotate = false; }, { once: true });

  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  const tickers: ((dt: number) => void)[] = [];
  let last = performance.now();
  renderer.setAnimationLoop((t) => {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    for (const f of tickers) f(dt);
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    scene, camera, controls, renderer,
    onTick: (f: (dt: number) => void) => tickers.push(f),
    dispose: () => {
      ro.disconnect();
      renderer.setAnimationLoop(null);
      renderer.dispose();
      pmrem.dispose();
      renderer.domElement.remove();
    },
  };
}

export async function loadGlb(url: string): Promise<THREE.Object3D | null> {
  try {
    const head = await fetch(url, { method: "HEAD" });
    if (!head.ok || !(head.headers.get("content-type") ?? "").match(/gltf|octet|model/)) return null;
    const gltf = await new GLTFLoader().loadAsync(url);
    return gltf.scene;
  } catch {
    return null;
  }
}

/** Fits an object into a unit-ish box at the origin. */
export function frame(obj: THREE.Object3D, size = 1.4) {
  const box = new THREE.Box3().setFromObject(obj);
  const s = size / Math.max(...box.getSize(new THREE.Vector3()).toArray());
  obj.scale.multiplyScalar(s);
  const c = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
  obj.position.sub(c);
}

/** A photographed paper drawing, cropped square and given more contrast so it reads as ink. */
export async function drawingTexture(url: string): Promise<THREE.Texture> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });
  const side = Math.min(img.width, img.height);
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  g.filter = "contrast(1.5) saturate(1.25) brightness(1.08)";
  g.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false; // glTF UV convention
  return tex;
}

/** Applies a texture to every mesh whose material (or own name) is "Drawing". Returns how many. */
export function applyDrawing(root: THREE.Object3D, tex: THREE.Texture) {
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach((mat, i) => {
      if (mat.name !== "Drawing" && m.name !== "Drawing") return;
      const next = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0, side: THREE.DoubleSide });
      next.name = "Drawing";
      if (Array.isArray(m.material)) m.material[i] = next; else m.material = next;
      n++;
    });
  });
  return n;
}

export function textTexture(text: string, opts: { bg?: string; fg?: string; font?: string; w?: number; h?: number } = {}) {
  const c = document.createElement("canvas");
  c.width = opts.w ?? 512;
  c.height = opts.h ?? 512;
  const g = c.getContext("2d")!;
  if (opts.bg) { g.fillStyle = opts.bg; g.fillRect(0, 0, c.width, c.height); }
  g.fillStyle = opts.fg ?? "#3a2516";
  g.font = opts.font ?? "700 150px Fraunces, Georgia, serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const lines = text.split("\n");
  const lh = parseInt(g.font.match(/(\d+)px/)?.[1] ?? "60") * 1.15;
  lines.forEach((l, i) => g.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * lh));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
