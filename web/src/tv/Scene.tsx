// Rendered backgrounds (Blender + Cycles, scripts in art/blender), crossfaded between chapters. Until a render
// exists, a painted placeholder keeps the game playable.
import { useEffect, useState } from "react";

const PLACEHOLDER: Record<string, string> = {
  title: "radial-gradient(ellipse at 50% 60%, #f0b25a33 0, transparent 30%), linear-gradient(#0d1b2a, #22385a 70%, #dfe8f2 70%, #b9c8d9)",
  door: "radial-gradient(circle at 50% 55%, #c8963e55 0, transparent 22%), linear-gradient(90deg, #3a2516, #5c3b22 30%, #5c3b22 70%, #3a2516)",
  workbench: "radial-gradient(ellipse at 62% 45%, #f2b66a66 0, transparent 40%), linear-gradient(#2b1d14, #4a3121 60%, #6b4a2f 60%, #3a271a)",
  shelf: "radial-gradient(ellipse at 50% 50%, #f2b66a44 0, transparent 45%), repeating-linear-gradient(#4a3121 0 190px, #2b1d14 190px 210px)",
  phonograph: "radial-gradient(ellipse at 40% 50%, #f2b66a55 0, transparent 40%), linear-gradient(135deg, #2b1d14, #4a3121)",
  machine: "radial-gradient(ellipse at 50% 55%, #8fb3d955 0, transparent 40%), linear-gradient(#0d1b2a, #1f2f47)",
  garden_empty: "radial-gradient(ellipse at 68% 50%, #f0b25a44 0, transparent 30%), linear-gradient(#0a1626, #1d3150 62%, #dfe8f2 62%, #b9c8d9)",
  roof: "radial-gradient(circle at 80% 20%, #ffffff22 0, transparent 20%), linear-gradient(#060e1c, #13284a 70%, #e8eef6 70%, #c4d2e2)",
  beacon: "radial-gradient(circle at 50% 22%, #ffd98a 0, #f2a65a55 14%, transparent 40%), linear-gradient(#0a1626, #22385a 66%, #f2e6d0 66%, #c9b89e)",
  machine_lit: "radial-gradient(ellipse at 50% 40%, #ffd98a 0, #f2a65a55 30%, transparent 60%), linear-gradient(#3a2516, #6b4a2f)",
};

const loaded = new Map<string, boolean>();

function useImage(src: string) {
  const [ok, setOk] = useState(loaded.get(src) ?? false);
  useEffect(() => {
    if (loaded.has(src)) { setOk(loaded.get(src)!); return; }
    const img = new Image();
    img.onload = () => { loaded.set(src, true); setOk(true); };
    img.onerror = () => { loaded.set(src, false); setOk(false); };
    img.src = src;
  }, [src]);
  return ok;
}

export function Scene({ name }: { name: string }) {
  const src = `/scenes/${name}.jpg`;
  const ok = useImage(src);
  return (
    <div className="scene" key={name}>
      <div className="scene-img" style={{ background: ok ? `center / cover url(${src})` : PLACEHOLDER[name] ?? PLACEHOLDER.title }} />
      {["title", "door", "machine", "garden_empty", "beacon"].includes(name) && <Snow />}
    </div>
  );
}

function Snow() {
  return (
    <div className="snow" aria-hidden>
      {Array.from({ length: 60 }, (_, i) => (
        <i key={i} style={{
          left: `${(i * 37) % 100}%`,
          animationDelay: `${-(i * 0.73) % 12}s`,
          animationDuration: `${8 + (i % 7)}s`,
          width: 4 + (i % 4) * 2, height: 4 + (i % 4) * 2, opacity: 0.4 + (i % 5) * 0.12,
        }} />
      ))}
    </div>
  );
}
