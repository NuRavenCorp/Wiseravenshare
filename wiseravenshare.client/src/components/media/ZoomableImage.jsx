import React, { useState, useRef, useCallback } from "react";
import { Image } from "@/components/ui/image";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

/**
 * ZoomableImage — wraps the platform Image component with double-click zoom.
 * Double-click toggles between 1x and 2.5x; when zoomed, drag to pan.
 * Also supports pinch-style scroll-wheel zoom and a reset button.
 */
export default function ZoomableImage({ src, alt, className = "", fittingType = "fit" }) {
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  const toggleZoom = useCallback((e) => {
    e?.stopPropagation?.();
    setZoom((z) => (z > 1 ? 1 : 2.5));
    if (zoom <= 1) {
      // Zoom toward the click point
      const rect = e?.currentTarget?.getBoundingClientRect?.();
      if (rect) {
        const cx = e.clientX - rect.left - rect.width / 2;
        const cy = e.clientY - rect.top - rect.height / 2;
        setPos({ x: -cx * 0.6, y: -cy * 0.6 });
      }
    } else {
      setPos({ x: 0, y: 0 });
    }
  }, [zoom]);

  const handleWheel = useCallback((e) => {
    e.stopPropagation();
    const delta = -e.deltaY * 0.0015;
    setZoom((z) => Math.min(4, Math.max(1, z + delta * z)));
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (zoom <= 1) return;
    e.stopPropagation();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, posX: pos.x, posY: pos.y };
  }, [zoom, pos]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging) return;
    setPos({
      x: dragStart.current.posX + (e.clientX - dragStart.current.x),
      y: dragStart.current.posY + (e.clientY - dragStart.current.y),
    });
  }, [dragging]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  const reset = useCallback((e) => {
    e?.stopPropagation?.();
    setZoom(1);
    setPos({ x: 0, y: 0 });
  }, []);

  return (
    <div
      className={`relative overflow-hidden select-none ${className}`}
      onDoubleClick={toggleZoom}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in" }}
    >
      <div
        style={{
          transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})`,
          transition: dragging ? "none" : "transform 0.2s ease-out",
          transformOrigin: "center",
          willChange: "transform",
        }}
      >
        <Image src={src} alt={alt} className="w-full h-full" fittingType={fittingType} />
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1.5 z-10">
        <button
          onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.max(1, z - 0.5)); }}
          className="w-8 h-8 rounded-lg bg-background/80 backdrop-blur border border-border flex items-center justify-center text-foreground hover:bg-background transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs text-muted-foreground px-1.5 tabular-nums">{Math.round(zoom * 100)}%</span>
        <button
          onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.min(4, z + 0.5)); }}
          className="w-8 h-8 rounded-lg bg-background/80 backdrop-blur border border-border flex items-center justify-center text-foreground hover:bg-background transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        {zoom > 1 && (
          <button
            onClick={reset}
            className="w-8 h-8 rounded-lg bg-background/80 backdrop-blur border border-border flex items-center justify-center text-foreground hover:bg-background transition-colors"
            title="Reset zoom"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}