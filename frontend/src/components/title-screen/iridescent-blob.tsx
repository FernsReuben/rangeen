import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../../hooks/use-prefers-reduced-motion.ts";
import { BLOB_FRAGMENT_SHADER, BLOB_VERTEX_SHADER } from "./blob-shader.ts";

/** Cap the render resolution: the blob is soft, so full 2x/3x DPR is wasted GPU time. */
const MAX_PIXEL_RATIO = 1.25;
/** Frame used when animation is disabled (reduced motion). Chosen to look good. */
const STILL_FRAME_TIME = 14;

interface BlobRenderer {
  render(timeSeconds: number, pointerX: number, pointerY: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not allocate a WebGL shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "unknown error";
    gl.deleteShader(shader);
    throw new Error(`Blob shader failed to compile: ${log}`);
  }
  return shader;
}

function createBlobRenderer(canvas: HTMLCanvasElement): BlobRenderer {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error("WebGL is not available in this browser.");

  const vertex = compileShader(gl, gl.VERTEX_SHADER, BLOB_VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, BLOB_FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error("Could not allocate a WebGL program.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Blob shader failed to link: ${gl.getProgramInfoLog(program) ?? "unknown error"}`);
  }
  gl.useProgram(program);

  // One triangle that covers the whole viewport.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uResolution = gl.getUniformLocation(program, "u_resolution");
  const uTime = gl.getUniformLocation(program, "u_time");
  const uPointer = gl.getUniformLocation(program, "u_pointer");

  return {
    resize(width, height) {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const w = Math.max(1, Math.round(width * ratio));
      const h = Math.max(1, Math.round(height * ratio));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
    },
    render(time, pointerX, pointerY) {
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, time);
      gl.uniform2f(uPointer, pointerX, pointerY);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    },
  };
}

/**
 * Full-bleed animated background for the title screen. Pauses when it is
 * scrolled out of view or the tab is hidden, follows the pointer slightly,
 * and renders a single still frame when the user prefers reduced motion.
 * Falls back to a static CSS gradient if WebGL is unavailable.
 */
export function IridescentBlob() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: BlobRenderer;
    try {
      renderer = createBlobRenderer(canvas);
    } catch (error) {
      console.error("[title-screen] Falling back to static background:", error);
      setWebglFailed(true);
      return;
    }

    const pointerTarget = { x: 0, y: 0 };
    const pointer = { x: 0, y: 0 };
    let frame = 0;
    let visible = true;
    let lastTimestamp: number | null = null;
    let elapsed = 0;

    const drawStill = () => renderer.render(STILL_FRAME_TIME, 0, 0);

    const tick = (timestamp: number) => {
      // Advance our own clock so pausing doesn't make the blob jump on resume.
      if (lastTimestamp !== null) elapsed += Math.min(timestamp - lastTimestamp, 100) / 1000;
      lastTimestamp = timestamp;
      pointer.x += (pointerTarget.x - pointer.x) * 0.04;
      pointer.y += (pointerTarget.y - pointer.y) * 0.04;
      renderer.render(STILL_FRAME_TIME + elapsed, pointer.x, pointer.y);
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (reducedMotion || frame !== 0 || !visible || document.hidden) return;
      lastTimestamp = null;
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return;
      renderer.resize(entry.contentRect.width, entry.contentRect.height);
      if (reducedMotion) drawStill();
    });
    resizeObserver.observe(canvas);

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) start();
      else stop();
    });
    intersectionObserver.observe(canvas);

    const onVisibilityChange = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibilityChange);

    const onPointerMove = (event: PointerEvent) => {
      pointerTarget.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointerTarget.y = -((event.clientY / window.innerHeight) * 2 - 1);
    };
    if (!reducedMotion) window.addEventListener("pointermove", onPointerMove, { passive: true });

    const rect = canvas.getBoundingClientRect();
    renderer.resize(rect.width, rect.height);
    if (reducedMotion) drawStill();
    else start();

    return () => {
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pointermove", onPointerMove);
      renderer.dispose();
    };
  }, [reducedMotion]);

  if (webglFailed) return <div className="title-blob title-blob--fallback" aria-hidden="true" />;
  return <canvas ref={canvasRef} className="title-blob" aria-hidden="true" />;
}
