// A 3D object on the phone made from the player's own drawing: the family's key (with four of
// Grandpa's toys engraved on the back, the order of the drawer code) or their Christmas ornament.
// Drag to turn it.
import { useEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { DRAWER_TOYS } from "../../../shared/story";
import { applyDrawing, drawingTexture, frame, loadGlb, makeStage, textTexture } from "./three-kit";

const brass = () => new THREE.MeshStandardMaterial({ color: 0xc8963e, metalness: 1, roughness: 0.32 });

/** The back of the key: the four toys of the drawer code, numbered in order, on brass. */
function toyPlateTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(220, 200, 40, 256, 256, 300);
  grad.addColorStop(0, "#e2b765");
  grad.addColorStop(1, "#9c6e2a");
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  g.textAlign = "center";
  g.textBaseline = "middle";
  DRAWER_TOYS.forEach((t, i) => {
    const x = i % 2 ? 358 : 154, y = i < 2 ? 160 : 360;
    g.font = "150px 'Apple Color Emoji', 'Noto Color Emoji', 'Segoe UI Emoji', sans-serif";
    g.fillText(t.icon, x, y + 10);
    g.fillStyle = "#4a2f0e";
    g.beginPath(); g.arc(x - 78, y - 74, 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#f6e2b0";
    g.font = "800 46px Fraunces, Georgia, serif";
    g.fillText(String(i + 1), x - 78, y - 71);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Swaps the embossed engraving of key.glb for the toy plate, on the same face of the medallion. */
function engraveToys(obj: THREE.Object3D) {
  const old = obj.getObjectByName("Engraving");
  const plate = obj.getObjectByName("backplate") as THREE.Mesh | undefined;
  if (!plate) return;
  if (old) old.visible = false;
  plate.geometry.computeBoundingBox();
  const box = plate.geometry.boundingBox!;
  const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
  const disc = new THREE.Mesh(new THREE.CircleGeometry(Math.max(size.x, size.y) / 2 * 1.04, 64),
    new THREE.MeshStandardMaterial({ map: toyPlateTexture(), metalness: 0.35, roughness: 0.5 }));
  // in key.glb the medallion's back faces -Z: turn the disc round so it reads upright from behind
  disc.rotation.set(0, Math.PI, 0);
  disc.position.set(centre.x, centre.y, box.min.z - 0.0008);
  plate.add(disc);
}

export function Viewer3D({ model, drawing, caption, extra }: { model: "key" | "ornament"; drawing: string | null; caption: string; extra?: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stage = makeStage(host.current!);
    let alive = true;
    (async () => {
      const obj = (await loadGlb(`/models/${model}.glb`)) ?? (model === "key" ? fallbackKey() : fallbackOrnament());
      if (!alive) return;
      if (drawing) {
        const tex = await drawingTexture(drawing).catch((e) => { console.warn("[gw] drawing texture failed", e); return null; });
        if (tex && alive) console.info("[gw] drawing applied to", applyDrawing(obj, tex), "meshes");
      }
      if (model === "key") engraveToys(obj);
      frame(obj, model === "key" ? 1.9 : 1.3);
      stage.scene.add(obj);
      if (model === "ornament") stage.onTick((dt) => { obj.rotation.z = Math.sin(performance.now() / 900) * 0.06; void dt; });
    })();
    return () => { alive = false; stage.dispose(); };
  }, [model, drawing]);

  return (
    <div className="viewer">
      <div className="viewer-canvas" ref={host} />
      <p>{caption}</p>
      {extra}
    </div>
  );
}

/** Built in code, used until the modeled key.glb exists. Same contract: a "Drawing" face. */
function fallbackKey() {
  const g = new THREE.Group();
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 64), brass());
  bow.rotation.x = Math.PI / 2;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.42, 64), new THREE.MeshStandardMaterial({ color: 0xf6ecd9 }));
  face.material.name = "Drawing";
  face.position.z = 0.041;
  // CircleGeometry UVs are flipped relative to glTF; match the glTF convention used by drawingTexture.
  flipV(face.geometry);
  const back = new THREE.Mesh(new THREE.CircleGeometry(0.42, 64), new THREE.MeshStandardMaterial({
    map: toyPlateTexture(), metalness: 0.35, roughness: 0.5,
  }));
  back.position.z = -0.041;
  back.rotation.y = Math.PI;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 24), brass());
  shaft.position.y = -1.1;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 16, 64), brass());
  const teeth = new THREE.Group();
  for (const [y, w] of [[-1.55, 0.32], [-1.38, 0.22], [-1.68, 0.18]] as const) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.07), brass());
    t.position.set(w / 2 + 0.04, y, 0);
    teeth.add(t);
  }
  g.add(bow, face, back, ring, shaft, teeth);
  return g;
}

function fallbackOrnament() {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 64, 48), new THREE.MeshPhysicalMaterial({ color: 0xb23a2e, metalness: 0.3, roughness: 0.15, clearcoat: 1 }));
  const label = new THREE.Mesh(new THREE.CircleGeometry(0.36, 64), new THREE.MeshStandardMaterial({ color: 0xf6ecd9 }));
  label.material.name = "Drawing";
  flipV(label.geometry);
  label.position.z = 0.605;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.025, 12, 64), brass());
  rim.position.z = 0.605;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.16, 32), brass());
  cap.position.y = 0.64;
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 12, 32), brass());
  loop.position.y = 0.78;
  g.add(ball, label, rim, cap, loop);
  return g;
}

function flipV(geo: THREE.BufferGeometry) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  uv.needsUpdate = true;
}
