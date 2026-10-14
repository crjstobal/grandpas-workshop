// The keepsake: Grandpa's letter and the family's drawings as a Christmas card to save.
import { useState } from "react";
import type { PublicState } from "../../../shared/types";

export function ChristmasCard({ state }: { state: PublicState }) {
  const [busy, setBusy] = useState(false);
  if (!state.letter) return <div className="wait"><h2>The Star Machine is waking up!</h2><p>Look at the TV. Jingle is unfolding Grandpa's letter...</p></div>;

  const save = async () => {
    setBusy(true);
    try {
      const blob = await render(state);
      const file = new File([blob], "grandpas-workshop-christmas.png", { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.canShare?.({ files: [file] })) await nav.share({ files: [file], title: "A letter from Grandpa Felix" });
      else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
      }
    } catch { /* share sheet closed */ } finally { setBusy(false); }
  };

  return (
    <div className="card-view">
      <div className="paper small">{state.letter.split(/\n+/).filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}</div>
      <button className="big" onClick={save} disabled={busy}>Save our Christmas card</button>
    </div>
  );
}

async function render(state: PublicState): Promise<Blob> {
  const W = 1080, H = 1500;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  await document.fonts?.ready;
  g.fillStyle = "#f6ecd9"; g.fillRect(0, 0, W, H);
  g.strokeStyle = "#c8963e"; g.lineWidth = 14; g.strokeRect(36, 36, W - 72, H - 72);
  g.fillStyle = "#b23a2e"; g.textAlign = "center";
  g.font = "700 64px Fraunces, Georgia, serif"; g.fillText("Grandpa's Workshop", W / 2, 140);
  g.fillStyle = "#3a2516"; g.font = "500 32px Nunito, sans-serif";
  g.fillText(`Christmas Eve ${new Date().getFullYear()}`, W / 2, 190);

  g.textAlign = "left"; g.font = "500 34px Fraunces, Georgia, serif";
  let y = 270;
  for (const para of state.letter!.split(/\n+/).filter(Boolean)) {
    for (const line of wrap(g, para, W - 200)) { g.fillText(line, 100, y); y += 46; }
    y += 18;
  }

  const pics = [state.key, ...state.ornaments].filter(Boolean).slice(0, 5) as NonNullable<PublicState["key"]>[];
  const size = 170, gap = 24;
  let x = (W - (pics.length * size + (pics.length - 1) * gap)) / 2;
  const top = Math.max(y + 20, H - size - 120);
  for (const p of pics) {
    const img = await load(p.imageUrl).catch(() => null);
    if (img) {
      g.save(); g.beginPath(); g.arc(x + size / 2, top + size / 2, size / 2, 0, Math.PI * 2); g.clip();
      const s = Math.min(img.width, img.height);
      g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, x, top, size, size);
      g.restore();
      g.strokeStyle = "#c8963e"; g.lineWidth = 6; g.beginPath(); g.arc(x + size / 2, top + size / 2, size / 2, 0, Math.PI * 2); g.stroke();
    }
    x += size + gap;
  }
  return new Promise((res) => c.toBlob((b) => res(b!), "image/png"));
}

function wrap(g: CanvasRenderingContext2D, text: string, max: number) {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > max && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

function load(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
