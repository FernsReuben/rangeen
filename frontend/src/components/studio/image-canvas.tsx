import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { samplePixels, type ColorSample, type SampleSize } from "../../analysis/pixel-sampling.ts";
import type { LoadedImage } from "../../image/image-loader.ts";
import { setHoverSample } from "../../state/hover-sample-store.ts";

interface ImageCanvasProps {
  image: LoadedImage;
  sampleSize: SampleSize;
  lockedPoint: { x: number; y: number } | null;
  onLock: (sample: ColorSample) => void;
  onUnlock: () => void;
}

interface Layout {
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

const LOUPE_CSS_SIZE = 132;
const LOUPE_PIXELS = 15; // odd, so there is a centre pixel
const LOUPE_OFFSET = 22;

/**
 * Displays the reference image fitted to its container and turns pointer
 * input into color samples. Pointer moves are coalesced to one sample per
 * animation frame and written to the hover store, so React does not re-render
 * this component (or its parents) while the pointer moves.
 */
export function ImageCanvas({ image, sampleSize, lockedPoint, onLock, onUnlock }: ImageCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<Layout>({ scale: 1, offsetX: 0, offsetY: 0, width: 0, height: 0 });
  const pendingRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const frameRef = useRef(0);
  const keyboardPointRef = useRef<{ x: number; y: number } | null>(null);

  // Latest props for event handlers without re-binding listeners.
  const propsRef = useRef({ image, sampleSize, lockedPoint, onLock, onUnlock });
  propsRef.current = { image, sampleSize, lockedPoint, onLock, onUnlock };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const { bitmap } = propsRef.current.image;
    const rect = stage.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const scale = Math.min(width / bitmap.width, height / bitmap.height);
    const drawW = bitmap.width * scale;
    const drawH = bitmap.height * scale;
    const layout: Layout = { scale, offsetX: (width - drawW) / 2, offsetY: (height - drawH) / 2, width, height };
    layoutRef.current = layout;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    // Smooth when shrinking; show crisp pixels when enlarging small images.
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, layout.offsetX, layout.offsetY, drawW, drawH);

    const locked = propsRef.current.lockedPoint;
    if (locked) {
      const cx = layout.offsetX + (locked.x + 0.5) * scale;
      const cy = layout.offsetY + (locked.y + 0.5) * scale;
      const radius = Math.max(9, (propsRef.current.sampleSize * scale) / 2 + 5);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(7, 6, 10, 0.85)";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    }
  }, []);

  const hideLoupe = () => {
    if (loupeRef.current) loupeRef.current.style.opacity = "0";
  };

  /** Samples at an image coordinate and positions the loupe at a stage coordinate. */
  const showSampleAt = useCallback((imageX: number, imageY: number, stageX: number, stageY: number) => {
    const { image: img, sampleSize: size } = propsRef.current;
    const sample = samplePixels(img.pixels, imageX, imageY, size);
    setHoverSample(sample);

    const loupe = loupeRef.current;
    if (!loupe) return;
    if (!sample) {
      hideLoupe();
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(LOUPE_CSS_SIZE * dpr);
    if (loupe.width !== px) {
      loupe.width = px;
      loupe.height = px;
    }
    const ctx = loupe.getContext("2d");
    if (!ctx) return;
    const cell = px / LOUPE_PIXELS;
    const half = Math.floor(LOUPE_PIXELS / 2);
    const sx = Math.floor(imageX) - half;
    const sy = Math.floor(imageY) - half;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#07060a";
    ctx.fillRect(0, 0, px, px);
    // Draw only the part of the window that is inside the image, keeping pixel alignment.
    const x0 = Math.max(0, sx);
    const y0 = Math.max(0, sy);
    const x1 = Math.min(img.bitmap.width, sx + LOUPE_PIXELS);
    const y1 = Math.min(img.bitmap.height, sy + LOUPE_PIXELS);
    if (x1 > x0 && y1 > y0) {
      ctx.drawImage(img.bitmap, x0, y0, x1 - x0, y1 - y0, (x0 - sx) * cell, (y0 - sy) * cell, (x1 - x0) * cell, (y1 - y0) * cell);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = 1; i < LOUPE_PIXELS; i++) {
      const p = Math.round(i * cell) + 0.5;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, px);
      ctx.moveTo(0, p);
      ctx.lineTo(px, p);
      ctx.stroke();
    }
    const win = Math.min(size, LOUPE_PIXELS);
    const start = (half - Math.floor(win / 2)) * cell;
    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = "rgba(7,6,10,0.9)";
    ctx.strokeRect(start, start, win * cell, win * cell);
    ctx.lineWidth = 1 * dpr;
    ctx.strokeStyle = "#ffffff";
    ctx.strokeRect(start, start, win * cell, win * cell);

    const { width, height } = layoutRef.current;
    let left = stageX + LOUPE_OFFSET;
    let top = stageY + LOUPE_OFFSET;
    if (left + LOUPE_CSS_SIZE > width) left = stageX - LOUPE_OFFSET - LOUPE_CSS_SIZE;
    if (top + LOUPE_CSS_SIZE > height) top = stageY - LOUPE_OFFSET - LOUPE_CSS_SIZE;
    loupe.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    loupe.style.borderColor = sample.hex;
    loupe.style.opacity = "1";
  }, []);

  const toImagePoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const { scale, offsetX, offsetY } = layoutRef.current;
    const stageX = clientX - rect.left;
    const stageY = clientY - rect.top;
    return { imageX: (stageX - offsetX) / scale, imageY: (stageY - offsetY) / scale, stageX, stageY };
  };

  const flushPointer = useCallback(() => {
    frameRef.current = 0;
    const pending = pendingRef.current;
    if (!pending) return;
    const point = toImagePoint(pending.clientX, pending.clientY);
    if (point) showSampleAt(point.imageX, point.imageY, point.stageX, point.stageY);
  }, [showSampleAt]);

  // Redraw on resize and whenever the image, lock or sample size changes.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(stage);
    return () => observer.disconnect();
  }, [draw]);

  useEffect(() => {
    draw();
  }, [draw, image, lockedPoint, sampleSize]);

  useEffect(() => () => {
    cancelAnimationFrame(frameRef.current);
    setHoverSample(null);
  }, []);

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    keyboardPointRef.current = null;
    pendingRef.current = { clientX: event.clientX, clientY: event.clientY };
    if (!frameRef.current) frameRef.current = requestAnimationFrame(flushPointer);
  };

  const onPointerLeave = () => {
    pendingRef.current = null;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    setHoverSample(null);
    hideLoupe();
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const point = toImagePoint(event.clientX, event.clientY);
    if (!point) return;
    const { image: img, sampleSize: size, onLock: lock } = propsRef.current;
    const sample = samplePixels(img.pixels, point.imageX, point.imageY, size);
    if (sample) lock(sample);
    if (event.pointerType !== "mouse") {
      setHoverSample(null);
      hideLoupe();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const { image: img, sampleSize: size, onLock: lock, onUnlock: unlock, lockedPoint: locked } = propsRef.current;
    if (event.key === "Escape") {
      unlock();
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const current =
      keyboardPointRef.current ?? locked ?? { x: Math.floor(img.pixels.width / 2), y: Math.floor(img.pixels.height / 2) };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      const next = {
        x: Math.min(img.pixels.width - 1, Math.max(0, current.x + move[0])),
        y: Math.min(img.pixels.height - 1, Math.max(0, current.y + move[1])),
      };
      keyboardPointRef.current = next;
      const { scale, offsetX, offsetY } = layoutRef.current;
      showSampleAt(next.x, next.y, offsetX + (next.x + 0.5) * scale, offsetY + (next.y + 0.5) * scale);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const sample = samplePixels(img.pixels, current.x, current.y, size);
      if (sample) lock(sample);
    }
  };

  return (
    <div ref={stageRef} className="image-stage">
      <canvas
        ref={canvasRef}
        className="image-canvas"
        tabIndex={0}
        role="img"
        aria-label={`Reference image ${image.fileName}. Move the pointer or use the arrow keys to sample colors; click or press Enter to lock a color, Escape to unlock.`}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (keyboardPointRef.current) {
            keyboardPointRef.current = null;
            setHoverSample(null);
            hideLoupe();
          }
        }}
      />
      <canvas ref={loupeRef} className="loupe" aria-hidden="true" style={{ width: LOUPE_CSS_SIZE, height: LOUPE_CSS_SIZE }} />
    </div>
  );
}
