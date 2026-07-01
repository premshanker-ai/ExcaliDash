/**
 * Excalidraw re-encodes inserted images to a static PNG (dropping GIF frames)
 * while keeping the fileId, which is SHA-1 of the *original* file. We capture the
 * original GIF bytes at the input boundary (drop / paste / file-picker), keyed by
 * that same SHA-1, so we can:
 *   - render the animated GIF as an overlay <img> (see GifOverlay), and
 *   - substitute the real GIF back into the files that get persisted, so it
 *     survives save/reload (see useEditorPersistence).
 */

const capturedGifs = new Map<string, string>(); // fileId (sha1 hex) -> gif dataURL

const isGifDataUrl = (u: unknown): u is string => {
  if (typeof u !== "string") return false;
  const i = u.indexOf("base64,");
  return i >= 0 && u.startsWith("R0lGOD", i + 7); // "GIF87a"/"GIF89a" base64
};

async function sha1Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function readDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

async function captureFileList(list?: FileList | File[] | null): Promise<void> {
  if (!list) return;
  for (const f of Array.from(list)) {
    if (!f || f.type !== "image/gif") continue;
    try {
      const id = await sha1Hex(await f.arrayBuffer());
      if (!capturedGifs.has(id)) capturedGifs.set(id, await readDataURL(f));
    } catch {
      /* ignore unreadable files */
    }
  }
}

let initialized = false;
/** Attach global capture listeners once. Safe to call repeatedly. */
export function initGifCapture(): void {
  if (initialized || typeof document === "undefined") return;
  initialized = true;
  document.addEventListener("drop", (e: DragEvent) => captureFileList(e.dataTransfer?.files), true);
  document.addEventListener("paste", (e: ClipboardEvent) => captureFileList(e.clipboardData?.files), true);
  document.addEventListener(
    "change",
    (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (t?.tagName === "INPUT" && t.type === "file") captureFileList(t.files);
    },
    true,
  );
  // Excalidraw uses the File System Access API for the image tool when available.
  const w = window as any;
  const orig: any = w.showOpenFilePicker;
  if (typeof orig === "function" && !orig.__gifWrapped) {
    const wrapped = async (...args: any[]) => {
      const handles = await orig.apply(window, args);
      Promise.all(handles.map((h: any) => h.getFile())).then(captureFileList).catch(() => {});
      return handles;
    };
    wrapped.__gifWrapped = true;
    w.showOpenFilePicker = wrapped;
  }
}

/** Original GIF dataURL for an element's fileId, or undefined. */
export function getCapturedGif(fileId: string): string | undefined {
  return capturedGifs.get(fileId);
}

export { isGifDataUrl };

/**
 * Replace the dataURL of any file we have original GIF bytes for, so the saved
 * scene keeps the animated GIF instead of Excalidraw's re-encoded PNG.
 */
export function substituteGifFiles<T extends Record<string, any> | null | undefined>(files: T): T {
  if (!files) return files;
  let changed = false;
  const out: Record<string, any> = { ...files };
  for (const id of Object.keys(out)) {
    const gif = capturedGifs.get(id);
    const f = out[id];
    if (gif && f && f.dataURL !== gif) {
      out[id] = { ...f, id, mimeType: "image/gif", dataURL: gif };
      changed = true;
    }
  }
  return (changed ? out : files) as T;
}
