"use client";

import { useState } from "react";

const MAX_SIDE = 1600;
const QUALITY = 0.82;
const MAX_TOTAL = 3.8 * 1024 * 1024; // one upload must stay under the host's request limit

/** Shrinks photos on the phone before upload (fast on mobile data, fits hosting limits). */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export default function PhotoInput({ name, max }: { name: string; max: number }) {
  const [status, setStatus] = useState("");

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const files = Array.from(input.files ?? []).slice(0, max);
    if (files.length === 0) return;
    setStatus("Préparation des photos…");
    const shrunk = await Promise.all(files.map(shrink));
    const small: File[] = [];
    let total = 0;
    for (const f of shrunk) { if (total + f.size > MAX_TOTAL) break; small.push(f); total += f.size; }
    const dt = new DataTransfer();
    small.forEach((f) => dt.items.add(f));
    input.files = dt.files;
    const kb = Math.round(small.reduce((s, f) => s + f.size, 0) / 1024);
    const left = shrunk.length - small.length;
    setStatus(`${small.length} photo(s) prête(s) · ${kb > 1024 ? `${(kb / 1024).toFixed(1)} Mo` : `${kb} Ko`}` +
      (left > 0 ? ` — envoyez les ${left} autre(s) ensuite` : ""));
  }

  return (
    <>
      <input className="input py-2" type="file" name={name} accept="image/jpeg,image/png,image/webp" multiple required onChange={onChange} />
      {status && <span role="status" className="text-xs text-muted">{status}</span>}
    </>
  );
}
