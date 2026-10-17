import { useEffect, useRef } from "react";
import { edgeSlices } from "@/lib/background-edge";

type Props = {
  url: string;
  transform: { scale: number; x: number; y: number };
  adjusting: boolean;
  onPointerDown: React.PointerEventHandler<HTMLCanvasElement>;
  onPointerMove: React.PointerEventHandler<HTMLCanvasElement>;
  onPointerUp: React.PointerEventHandler<HTMLCanvasElement>;
};

export function DashboardBackground({ url, transform, adjusting, onPointerDown, onPointerMove, onPointerUp }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const redrawRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let active = true;
    const draw = () => {
      const image = imageRef.current;
      if (!image || !active) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const tf = transformRef.current;
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * tf.scale;
      const imageWidth = image.naturalWidth * scale;
      const imageHeight = image.naturalHeight * scale;
      const x = (width - imageWidth) / 2 + tf.x;
      const y = (height - imageHeight) / 2 + tf.y;
      const xs = edgeSlices(image.naturalWidth, x, imageWidth, width);
      const ys = edgeSlices(image.naturalHeight, y, imageHeight, height);
      for (const row of ys) {
        for (const col of xs) {
          context.drawImage(image, col.source, row.source, col.sourceSize, row.sourceSize,
            col.target, row.target, col.targetSize, row.targetSize);
        }
      }
    };
    redrawRef.current = draw;
    imageRef.current = null;
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      imageRef.current = image;
      draw();
    };
    image.src = url;
    window.addEventListener("resize", draw);
    return () => {
      active = false;
      window.removeEventListener("resize", draw);
    };
  }, [url]);

  useEffect(() => { redrawRef.current(); }, [transform]);

  return <canvas ref={canvasRef} aria-hidden
    className={`fixed inset-0 z-0 h-full w-full ${adjusting ? "cursor-move touch-none" : "pointer-events-none"}`}
    onPointerDown={onPointerDown} onPointerMove={onPointerMove}
    onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />;
}