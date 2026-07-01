import { useEffect, useRef } from "react";

/**
 * Excalidraw paints every image onto a <canvas>, and canvas drawImage() only
 * ever renders a single frame of a GIF. This overlay renders a real <img> (which
 * the browser animates natively) on top of the canvas for each animated-GIF image
 * element, tracking its position/size/rotation as the scene is panned, zoomed, or
 * the element is moved.
 *
 * ponytail: overlay sits above the whole canvas with pointer-events:none.
 *   - selection handles drawn over a selected GIF may be partially hidden
 *   - z-order vs other shapes is ignored (a GIF always appears on top)
 *   Upgrade path if either bites: reconcile per-element z-index / hook Excalidraw's
 *   interactive canvas. Not worth it for the common case.
 */
export function GifOverlay({ excalidrawAPI }: { excalidrawAPI: any }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<Map<string, HTMLImageElement>>(new Map());

  useEffect(() => {
    if (!excalidrawAPI || !containerRef.current) return;
    const container = containerRef.current;
    const nodes = nodesRef.current;
    let raf = 0;

    const isGif = (file: any) =>
      file && (file.mimeType === "image/gif" ||
        (typeof file.dataURL === "string" && file.dataURL.startsWith("data:image/gif")));

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
        if (!isGif(file)) continue;

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
        if (img.src !== file.dataURL) img.src = file.dataURL;

        const w = el.width * zoom;
        const h = el.height * zoom;
        // container is inset:0 over the canvas, so viewport == container coords.
        const x = (el.x + scrollX) * zoom;
        const y = (el.y + scrollY) * zoom;
        img.style.width = `${w}px`;
        img.style.height = `${h}px`;
        img.style.opacity = String((el.opacity ?? 100) / 100);
        // rotate about center: shift by top-left, then rotate around the midpoint.
        img.style.transform =
          `translate(${x}px, ${y}px) rotate(${el.angle ?? 0}rad)`;
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
      nodes.clear();
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
