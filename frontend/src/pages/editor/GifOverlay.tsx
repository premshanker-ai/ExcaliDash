import { useEffect, useRef } from "react";
import { getCapturedGif, initGifCapture, isGifDataUrl } from "./gifStore";

/**
 * Excalidraw renders images onto a <canvas>, which only paints one frame of a
 * GIF (and it re-encodes the image to a static PNG on insert anyway). This draws
 * a real <img> — which browsers animate — on top of the canvas for each GIF
 * element, tracking position/size/rotation on pan/zoom/move. The original GIF
 * bytes come from gifStore, which captures them at the input boundary.
 *
 * ponytail: overlay sits above the whole canvas with pointer-events:none.
 *   Selection handles over a selected GIF may be partly hidden, and z-order vs
 *   other shapes is ignored (a GIF always draws on top). Not worth deeper canvas
 *   integration for the common case.
 */
export function GifOverlay({ excalidrawAPI }: { excalidrawAPI: any }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!excalidrawAPI || !containerRef.current) return;
    initGifCapture();
    const container = containerRef.current;
    const nodes = new Map<string, HTMLImageElement>();
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const elements = excalidrawAPI.getSceneElements?.() ?? [];
      const files = excalidrawAPI.getFiles?.() ?? {};
      const appState = excalidrawAPI.getAppState?.() ?? {};
      const zoom = appState.zoom?.value ?? 1;
      const scrollX = appState.scrollX ?? 0;
      const scrollY = appState.scrollY ?? 0;

      const seen = new Set<string>();
      for (const el of elements) {
        if (el.isDeleted || el.type !== "image" || !el.fileId) continue;
        const file = files[el.fileId];
        // Prefer the original captured GIF; fall back to the stored file if it is
        // itself a real GIF (e.g. after reload, once persisted).
        const gifSrc =
          getCapturedGif(el.fileId) ||
          (file && isGifDataUrl(file.dataURL) ? file.dataURL : null);
        if (!gifSrc) continue;

        seen.add(el.id);
        let img = nodes.get(el.id);
        if (!img) {
          img = new Image();
          img.style.position = "absolute";
          img.style.top = "0";
          img.style.left = "0";
          img.style.transformOrigin = "center center";
          img.draggable = false;
          container.appendChild(img);
          nodes.set(el.id, img);
        }
        // Set src only when the file changes; reassigning every frame restarts
        // the GIF, freezing it on frame 1.
        if (img.dataset.fileId !== el.fileId) {
          img.src = gifSrc;
          img.dataset.fileId = el.fileId;
        }

        const w = el.width * zoom;
        const h = el.height * zoom;
        const x = (el.x + scrollX) * zoom; // container is inset:0 over the canvas
        const y = (el.y + scrollY) * zoom;
        img.style.width = `${w}px`;
        img.style.height = `${h}px`;
        img.style.opacity = String((el.opacity ?? 100) / 100);
        img.style.transform = `translate(${x}px, ${y}px) rotate(${el.angle ?? 0}rad)`;
        img.style.display = "block";
      }

      for (const [id, node] of nodes) {
        if (!seen.has(id)) {
          node.remove();
          nodes.delete(id);
        }
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      for (const node of nodes.values()) node.remove();
    };
  }, [excalidrawAPI]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 3,
      }}
    />
  );
}
