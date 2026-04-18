import React, { useRef, useCallback, useEffect } from 'react';
import { Point } from '../types';

interface DrawingCanvasProps {
  width: number;
  height: number;
  paths: Point[][];
  currentPath: Point[];
  color: string;
  strokeWidth: number;
  isActive: boolean;
  onMouseDown: (point: Point) => void;
  onMouseMove: (point: Point) => void;
  onMouseUp: (finalPath: Point[]) => void;
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  width,
  height,
  paths,
  currentPath,
  color,
  strokeWidth,
  isActive,
  onMouseDown,
  onMouseMove,
  onMouseUp,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const currentPathRef = useRef<Point[]>([]);
  const colorRef = useRef(color);
  const strokeWidthRef = useRef(strokeWidth);

  useEffect(() => {
    colorRef.current = color;
    strokeWidthRef.current = strokeWidth;
  }, [color, strokeWidth]);

  const getPointFromEvent = useCallback((e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const drawPath = useCallback((
    ctx: CanvasRenderingContext2D,
    points: Point[],
    strokeColor: string,
    sw: number
  ) => {
    if (points.length === 0) return;

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = sw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, sw / 2, 0, Math.PI * 2);
      ctx.fillStyle = strokeColor;
      ctx.fill();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    if (points.length === 2) {
      ctx.lineTo(points[1].x, points[1].y);
    } else {
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];
        ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
      }
      const last = points[points.length - 1];
      const prev = points[points.length - 2];
      ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + last.x) / 2, (prev.y + last.y) / 2);
      ctx.lineTo(last.x, last.y);
    }

    ctx.stroke();
  }, []);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    for (const path of paths) {
      drawPath(ctx, path, colorRef.current, strokeWidthRef.current);
    }

    if (currentPathRef.current.length > 0) {
      drawPath(ctx, currentPathRef.current, colorRef.current, strokeWidthRef.current);
    }
  }, [width, height, paths, drawPath]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isActive) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    currentPathRef.current = [];
    colorRef.current = color;
    strokeWidthRef.current = strokeWidth;
    const point = getPointFromEvent(e);
    currentPathRef.current.push(point);
    onMouseDown(point);
    renderCanvas();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isActive || !isDrawingRef.current) return;
    e.preventDefault();
    const point = getPointFromEvent(e);
    currentPathRef.current.push(point);
    onMouseMove(point);
    renderCanvas();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isActive) return;
    e.preventDefault();
    e.currentTarget.releasePointerCapture(e.pointerId);
    isDrawingRef.current = false;
    const finalPath = [...currentPathRef.current];
    currentPathRef.current = [];
    onMouseUp(finalPath);
    renderCanvas();
  };

  return (
    <canvas
      ref={canvasRef}
      className="drawing-canvas"
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        touchAction: 'none',
        cursor: isActive ? 'crosshair' : 'default',
        pointerEvents: isActive ? 'auto' : 'none',
        zIndex: 3,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    />
  );
};
