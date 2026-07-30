"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Signature capture with pointer events, so a finger on a phone, a stylus, and a
 * mouse all work through one code path.
 *
 * The canvas is backed at devicePixelRatio so the exported PNG is crisp when it
 * lands in the PDF, and drawing is done on a transparent background so the
 * signature composites over the PDF's signature line.
 */
export function SignaturePad({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (dataUrl: string) => void;
  ariaLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(Boolean(value));

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 1.9;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#12213a";
  }, []);

  useEffect(() => {
    setupCanvas();
    // Re-scale on resize (orientation change on mobile), which clears the
    // canvas — so the stored signature is dropped too rather than silently
    // keeping ink the client can no longer see.
    const handleResize = () => {
      setupCanvas();
      setHasInk(false);
      onChange("");
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [setupCanvas, onChange]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(event);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const last = lastPointRef.current;
    if (!canvas || !ctx || !last) return;

    const point = pointFromEvent(event);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
    if (!hasInk) setHasInk(true);
  };

  const commit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    onChange(hasInk ? canvas.toDataURL("image/png") : "");
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange("");
  };

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-neutral-300 bg-white">
        <canvas
          ref={canvasRef}
          aria-label={ariaLabel}
          role="img"
          className="block h-[150px] w-full cursor-crosshair touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={commit}
          onPointerLeave={commit}
          onPointerCancel={commit}
        />
        {!hasInk ? (
          <p className="pointer-events-none absolute inset-x-0 bottom-5 text-center text-xs text-neutral-400">
            Υπογράψτε εδώ με το δάχτυλο ή το ποντίκι
          </p>
        ) : null}
        <div className="pointer-events-none absolute inset-x-6 bottom-4 border-b border-dashed border-neutral-300" />
      </div>

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={handleClear}
          className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-800"
        >
          Καθαρισμός
        </button>
      </div>
    </div>
  );
}
