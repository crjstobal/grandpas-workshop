// A 3D object on the phone made from the player's own drawing: the family's key (with the drawer
// code engraved on the back) or their Christmas ornament. Drag to turn it.
import { useEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { DRAWER_CODE } from "../../../shared/story";
import { applyDrawing, drawingTexture, frame, loadGlb, makeStage, textTexture } from "./three-kit";

const brass = () => new THREE.MeshStandardMaterial({ color: 0xc8963e, metalness: 1, roughness: 0.32 });
const engraved = `${DRAWER_CODE.slice(0, 2)} ${DRAWER_CODE.slice(2)}`;

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
    map: textTexture(engraved, { bg: "#b78634", fg: "#5a3a12", font: "800 170px Fraunces, Georgia, serif" }), metalness: 0.8, roughness: 0.4,
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
