import { useCallback, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { Box } from "@mui/material";

interface Props {
  src: string;
  alt: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SCALE = 2.5;

interface Transform {
  scale: number;
  x: number;
  y: number;
}

interface GestureStart {
  dist: number; // pinch: initial finger distance (0 for a single-finger pan)
  scale: number;
  cx: number; // anchor cursor x at gesture start
  cy: number;
  x: number; // transform x/y at gesture start
  y: number;
}

// Pinch-to-zoom + drag-to-pan image viewer (dependency-free, pointer events).
// At scale 1 the image is shown fully via `object-fit: contain` (never cropped);
// the user can zoom in to read the dense chart on mobile and pan around. The
// zoom level is kept across date changes so the same region can be compared.
export default function ZoomableImage({ src, alt }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [tf, setTf] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const start = useRef<GestureStart | null>(null);
  const lastTap = useRef(0);

  // Keep the (scaled) image from being dragged entirely off-screen.
  const clamp = useCallback((next: Transform): Transform => {
    const el = ref.current;
    const w = el?.clientWidth ?? 0;
    const h = el?.clientHeight ?? 0;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
    const maxX = ((scale - 1) * w) / 2;
    const maxY = ((scale - 1) * h) / 2;
    return {
      scale,
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  }, []);

  const onPointerDown = (e: PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      start.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        scale: tf.scale,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        x: tf.x,
        y: tf.y,
      };
      return;
    }

    start.current = { dist: 0, scale: tf.scale, cx: e.clientX, cy: e.clientY, x: tf.x, y: tf.y };

    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      setTf((p) =>
        clamp(p.scale > 1 ? { scale: 1, x: 0, y: 0 } : { scale: DOUBLE_TAP_SCALE, x: 0, y: 0 }),
      );
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const s = start.current;
    if (!s) return;

    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const ratio = dist / (s.dist || dist);
      setTf(clamp({ scale: s.scale * ratio, x: s.x, y: s.y }));
    } else if (tf.scale > 1) {
      setTf(clamp({ scale: tf.scale, x: s.x + (e.clientX - s.cx), y: s.y + (e.clientY - s.cy) }));
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    start.current = null;
    // If one finger is still down after a pinch, resume single-finger panning.
    if (pointers.current.size === 1) {
      const [only] = [...pointers.current.values()];
      start.current = { dist: 0, scale: tf.scale, cx: only.x, cy: only.y, x: tf.x, y: tf.y };
    }
  };

  // Trackpad pinch / ctrl+wheel zoom on desktop.
  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    setTf((p) => clamp({ scale: p.scale * (e.deltaY < 0 ? 1.12 : 0.89), x: p.x, y: p.y }));
  };

  return (
    <Box
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      sx={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        touchAction: "none",
        cursor: tf.scale > 1 ? "grab" : "default",
      }}
    >
      <Box
        component="img"
        src={src}
        alt={alt}
        draggable={false}
        sx={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          p: { xs: 0.5, sm: 2 },
          boxSizing: "border-box",
          transform: `translate(${tf.x}px, ${tf.y}px) scale(${tf.scale})`,
          transformOrigin: "center center",
          willChange: "transform",
          userSelect: "none",
          WebkitUserSelect: "none",
          touchAction: "none",
        }}
      />
    </Box>
  );
}
