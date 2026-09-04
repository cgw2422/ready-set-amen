"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

/**
 * Finger/mouse signature capture. The drawn image is supporting evidence — the
 * typed legal name plus the audit record is what carries the signature
 * (docs/ARCHITECTURE.md §4.4), so this is never the only thing collected.
 */
export function SignaturePad({
  name,
  required,
  onChange,
}: {
  name: string;
  required?: boolean;
  onChange?: (value: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [value, setValue] = useState("");

  /**
   * Size the bitmap to the box it is actually drawn in.
   *
   * This has to be observed rather than measured once: the signing form keeps
   * its later steps in a `display: none` container, so on mount the canvas
   * measures 0×0. A zero-sized canvas silently swallows every stroke and hands
   * back "data:," instead of an image — the pad looks fine and simply does
   * nothing. The observer fires when the step is revealed and again on a
   * rotation, which is the moment there is finally a real size to use.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const configure = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(rect.width * ratio);
      const height = Math.round(rect.height * ratio);
      if (canvas.width === width && canvas.height === height) return;

      // Changing the bitmap size clears it, so anything already drawn is gone
      // and must not stay recorded as a signature.
      canvas.width = width;
      canvas.height = height;
      setValue((current) => {
        if (current) onChange?.(null);
        return "";
      });

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0E2239";
    };

    configure();
    const observer = new ResizeObserver(configure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [onChange]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const commit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const data = canvas.toDataURL("image/png");
    setValue(data);
    onChange?.(data);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setValue("");
    onChange?.(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="no-touch-gestures h-40 w-full rounded-xl border-2 border-dashed border-line bg-white"
        aria-label="Signature area — draw your signature here"
        role="img"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          last.current = point(e);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext("2d");
          const next = point(e);
          if (!ctx || !last.current) return;
          ctx.beginPath();
          ctx.moveTo(last.current.x, last.current.y);
          ctx.lineTo(next.x, next.y);
          ctx.stroke();
          last.current = next;
        }}
        onPointerUp={() => {
          if (!drawing.current) return;
          drawing.current = false;
          last.current = null;
          commit();
        }}
        onPointerLeave={() => {
          if (!drawing.current) return;
          drawing.current = false;
          last.current = null;
          commit();
        }}
      />
      <input type="hidden" name={name} value={value} />
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-navy-faint">
          {required ? "Draw your signature above." : "Optional — draw your signature above."}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={clear}>
          Clear
        </Button>
      </div>
    </div>
  );
}
