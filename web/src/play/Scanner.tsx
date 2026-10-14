// Scans a drawing or an object with the phone camera. Uses the native camera picker (works on
// every phone without permissions dance), shrinks the photo, and sends it to Jingle.
import { useRef, useState } from "react";
import type { ScanKind, ScanResult } from "../../../shared/types";
import { api } from "../api";

export function Scanner({ code, playerId, kind, title, text, repeat, found = [], compact }: {
  code: string; playerId: string; kind: ScanKind; title: string; text: string;
  repeat?: boolean; found?: string[]; compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setErr(null); setResult(null);
    const blob = await shrink(file, 1024);
    setPreview(URL.createObjectURL(blob));
    setBusy(true);
    try {
      setResult(await api.scan(code, playerId, kind, blob));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className={`scanner ${compact ? "compact" : ""}`}>
      {title && <h2>{title}</h2>}
      {text && <p>{text}</p>}
      {preview && (
        <div className={`scan-preview ${busy ? "busy" : ""} ${result ? (result.accepted ? "yes" : "no") : ""}`}>
          <img src={preview} alt="" />
          {busy && <span className="scan-line" />}
        </div>
      )}
      {busy && <p className="status">Jingle is looking closely...</p>}
      {result && <p className={`jingle-says ${result.accepted ? "yes" : "no"}`}>{result.jingleLine}</p>}
      {err && <p className="err">{err}</p>}
      {found.length > 0 && <p className="found">You found: {found.join(", ")}</p>}
      {(!result?.accepted || repeat || compact) && (
        <button className="big camera" disabled={busy} onClick={() => input.current?.click()}>
          {result && !result.accepted ? "Try again" : compact ? "Scan another drawing" : repeat && found.length ? "Find another one" : "Open the camera"}
        </button>
      )}
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}

/** Resizes to fit max x max and re-encodes as JPEG, so uploads stay small and fast. */
async function shrink(file: File, max: number): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b ?? file), "image/jpeg", 0.85));
}
