import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Check,
  RotateCcw,
  ShieldAlert,
  AlertTriangle,
  Info,
  Maximize2,
  Minimize2,
  Edit2,
} from 'lucide-react';
import { SafetyZone, Point2D, ZoneSeverity } from '../types/zoneguard';

interface ZoneEditorProps {
  zones: SafetyZone[];
  onZonesChange: (zones: SafetyZone[]) => void;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  videoResolution?: { width: number; height: number };
  activeZoneId: string | null;
  onSelectZone: (id: string | null) => void;
  previewImageUrl?: string;
}

const SEVERITY_COLORS: Record<ZoneSeverity, { stroke: string; fill: string; border: string; text: string }> = {
  CRITICAL: {
    stroke: '#ef4444',
    fill: 'rgba(239, 68, 68, 0.22)',
    border: 'border-red-500/40',
    text: 'text-red-400',
  },
  WARNING: {
    stroke: '#f59e0b',
    fill: 'rgba(245, 158, 11, 0.22)',
    border: 'border-amber-500/40',
    text: 'text-amber-400',
  },
  CAUTION: {
    stroke: '#06b6d4',
    fill: 'rgba(6, 182, 212, 0.22)',
    border: 'border-cyan-500/40',
    text: 'text-cyan-400',
  },
};

export const ZoneEditor: React.FC<ZoneEditorProps> = ({
  zones,
  onZonesChange,
  videoRef,
  videoResolution,
  activeZoneId,
  onSelectZone,
  previewImageUrl,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point2D[]>([]);
  const [cursorPos, setCursorPos] = useState<Point2D | null>(null);
  const [draggedVertex, setDraggedVertex] = useState<{ zoneId: string; index: number } | null>(null);
  const [hoveredVertex, setHoveredVertex] = useState<{ zoneId: string; index: number } | null>(null);
  const [newZoneSeverity, setNewZoneSeverity] = useState<ZoneSeverity>('CRITICAL');
  const [newZoneName, setNewZoneName] = useState('');
  const [showCoordinateTable, setShowCoordinateTable] = useState(false);

  // Canvas dimensions based on container
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 450 });

  // Update canvas size matching container aspect ratio
  const updateCanvasDimensions = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width > 0) {
      const targetAspect = videoResolution && videoResolution.width > 0
        ? videoResolution.width / videoResolution.height
        : 16 / 9;
      const calculatedHeight = Math.round(rect.width / targetAspect);
      setCanvasSize({
        width: Math.floor(rect.width),
        height: calculatedHeight > 200 ? calculatedHeight : 450,
      });
    }
  }, [videoResolution]);

  useEffect(() => {
    updateCanvasDimensions();
    window.addEventListener('resize', updateCanvasDimensions);
    return () => window.removeEventListener('resize', updateCanvasDimensions);
  }, [updateCanvasDimensions]);

  // Convert mouse event coordinates to normalized [0, 1]
  const getNormalizedPoint = (e: React.MouseEvent<HTMLCanvasElement>): Point2D => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  // Convert normalized point to canvas pixel coordinates
  const toCanvasPixels = useCallback((point: Point2D) => {
    return {
      x: point.x * canvasSize.width,
      y: point.y * canvasSize.height,
    };
  }, [canvasSize]);

  // Draw overlay canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw existing zones
    zones.forEach((zone) => {
      if (zone.points.length < 2) return;
      const isSelected = zone.id === activeZoneId;
      const colors = SEVERITY_COLORS[zone.severity] || SEVERITY_COLORS.CRITICAL;

      ctx.save();
      ctx.beginPath();
      const firstPx = toCanvasPixels(zone.points[0]);
      ctx.moveTo(firstPx.x, firstPx.y);

      for (let i = 1; i < zone.points.length; i++) {
        const px = toCanvasPixels(zone.points[i]);
        ctx.lineTo(px.x, px.y);
      }
      ctx.closePath();

      // Fill polygon
      ctx.fillStyle = isSelected ? colors.fill.replace('0.22', '0.38') : colors.fill;
      ctx.fill();

      // Stroke polygon boundary
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = isSelected ? 3 : 2;
      if (!isSelected) {
        ctx.setLineDash([6, 4]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.stroke();

      // Draw label pill at centroid
      const centroid = zone.points.reduce(
        (acc, p) => ({ x: acc.x + p.x / zone.points.length, y: acc.y + p.y / zone.points.length }),
        { x: 0, y: 0 }
      );
      const centroidPx = toCanvasPixels(centroid);

      ctx.save();
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 1;
      ctx.font = '600 11px Plus Jakarta Sans, sans-serif';
      const text = `${zone.name} [${zone.severity}]`;
      const textWidth = ctx.measureText(text).width;
      const boxW = textWidth + 14;
      const boxH = 22;

      ctx.beginPath();
      ctx.roundRect(centroidPx.x - boxW / 2, centroidPx.y - boxH / 2, boxW, boxH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, centroidPx.x, centroidPx.y);
      ctx.restore();

      // Draw vertex handles
      zone.points.forEach((point, pIdx) => {
        const px = toCanvasPixels(point);
        const isHovered = hoveredVertex?.zoneId === zone.id && hoveredVertex.index === pIdx;

        ctx.save();
        ctx.beginPath();
        ctx.arc(px.x, px.y, isHovered || isSelected ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? '#ffffff' : colors.stroke;
        ctx.fill();
        ctx.strokeStyle = '#090d16';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      });

      ctx.restore();
    });

    // 2. Draw currently drafting polygon
    if (isDrawing && currentPoints.length > 0) {
      ctx.save();
      ctx.beginPath();
      const first = toCanvasPixels(currentPoints[0]);
      ctx.moveTo(first.x, first.y);

      for (let i = 1; i < currentPoints.length; i++) {
        const pt = toCanvasPixels(currentPoints[i]);
        ctx.lineTo(pt.x, pt.y);
      }

      // Rubberband line to mouse cursor
      if (cursorPos) {
        const cur = toCanvasPixels(cursorPos);
        ctx.lineTo(cur.x, cur.y);
      }

      const activeColor = SEVERITY_COLORS[newZoneSeverity];
      ctx.strokeStyle = activeColor.stroke;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();

      // Fill preview if >= 3 points
      if (currentPoints.length >= 2 && cursorPos) {
        ctx.fillStyle = activeColor.fill;
        ctx.fill();
      }

      // Draw placed vertices with index labels
      currentPoints.forEach((pt, idx) => {
        const px = toCanvasPixels(pt);
        ctx.beginPath();
        ctx.arc(px.x, px.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = idx === 0 ? '#10b981' : activeColor.stroke;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      ctx.restore();
    }
  }, [zones, isDrawing, currentPoints, cursorPos, activeZoneId, hoveredVertex, newZoneSeverity, canvasSize, toCanvasPixels]);

  // Handle canvas mouse click: place vertex or finish
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = getNormalizedPoint(e);

    if (isDrawing) {
      // Check if clicking near the first point to close polygon (within 16px)
      if (currentPoints.length >= 3) {
        const firstPx = toCanvasPixels(currentPoints[0]);
        const clickPx = toCanvasPixels(point);
        const dist = Math.hypot(clickPx.x - firstPx.x, clickPx.y - firstPx.y);
        if (dist <= 16) {
          finishDrawing();
          return;
        }
      }
      // Add point
      setCurrentPoints((prev) => [...prev, point]);
    } else {
      // Check if clicking on an existing zone or vertex to select it
      let selected: string | null = null;
      for (const zone of zones) {
        // Point in polygon test
        if (isPointInPolygon(point, zone.points)) {
          selected = zone.id;
          break;
        }
      }
      onSelectZone(selected);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getNormalizedPoint(e);
    setCursorPos(pt);

    // If dragging a vertex
    if (draggedVertex) {
      onZonesChange(
        zones.map((zone) => {
          if (zone.id !== draggedVertex.zoneId) return zone;
          const nextPoints = [...zone.points];
          nextPoints[draggedVertex.index] = pt;
          return { ...zone, points: nextPoints };
        })
      );
      return;
    }

    // Check vertex hover
    let foundHover: { zoneId: string; index: number } | null = null;
    const curPx = toCanvasPixels(pt);

    for (const zone of zones) {
      zone.points.forEach((p, idx) => {
        const px = toCanvasPixels(p);
        if (Math.hypot(px.x - curPx.x, px.y - curPx.y) <= 8) {
          foundHover = { zoneId: zone.id, index: idx };
        }
      });
    }
    setHoveredVertex(foundHover);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDrawing) return;
    const pt = getNormalizedPoint(e);
    const curPx = toCanvasPixels(pt);

    for (const zone of zones) {
      for (let idx = 0; idx < zone.points.length; idx++) {
        const px = toCanvasPixels(zone.points[idx]);
        if (Math.hypot(px.x - curPx.x, px.y - curPx.y) <= 8) {
          setDraggedVertex({ zoneId: zone.id, index: idx });
          onSelectZone(zone.id);
          return;
        }
      }
    }
  };

  const handleMouseUp = () => {
    setDraggedVertex(null);
  };

  // Start new polygon drawing
  const startNewZone = () => {
    setIsDrawing(true);
    setCurrentPoints([]);
    setNewZoneName(`Zone ${zones.length + 1} - Exclusion Area`);
  };

  // Complete drafting polygon
  const finishDrawing = () => {
    if (currentPoints.length < 3) {
      alert('A safety zone polygon must contain at least 3 vertices to establish a valid perimeter.');
      return;
    }

    const newZone: SafetyZone = {
      id: `zone-${Date.now()}`,
      name: newZoneName.trim() || `Zone ${zones.length + 1}`,
      severity: newZoneSeverity,
      points: currentPoints,
    };

    onZonesChange([...zones, newZone]);
    onSelectZone(newZone.id);
    setIsDrawing(false);
    setCurrentPoints([]);
    setNewZoneName('');
  };

  // Cancel drawing
  const cancelDrawing = () => {
    setIsDrawing(false);
    setCurrentPoints([]);
  };

  // Delete a zone
  const deleteZone = (id: string) => {
    onZonesChange(zones.filter((z) => z.id !== id));
    if (activeZoneId === id) onSelectZone(null);
  };

  // Quick preset templates for rapid setup
  const applyPreset = (presetType: 'forklift' | 'buffer' | 'perimeter') => {
    let presetZone: SafetyZone;
    if (presetType === 'forklift') {
      presetZone = {
        id: `zone-${Date.now()}`,
        name: 'Forklift Active Way',
        severity: 'CRITICAL',
        points: [
          { x: 0.2, y: 0.3 },
          { x: 0.75, y: 0.3 },
          { x: 0.85, y: 0.85 },
          { x: 0.15, y: 0.85 },
        ],
      };
    } else if (presetType === 'buffer') {
      presetZone = {
        id: `zone-${Date.now()}`,
        name: 'Pallet Staging Buffer',
        severity: 'WARNING',
        points: [
          { x: 0.75, y: 0.15 },
          { x: 0.95, y: 0.15 },
          { x: 0.97, y: 0.6 },
          { x: 0.77, y: 0.6 },
        ],
      };
    } else {
      presetZone = {
        id: `zone-${Date.now()}`,
        name: 'Walkway Transition Perimeter',
        severity: 'CAUTION',
        points: [
          { x: 0.05, y: 0.4 },
          { x: 0.35, y: 0.4 },
          { x: 0.35, y: 0.9 },
          { x: 0.05, y: 0.9 },
        ],
      };
    }
    onZonesChange([...zones, presetZone]);
    onSelectZone(presetZone.id);
  };

  return (
    <div className="space-y-4">
      {/* Editor Top Bar & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900 border border-slate-800 rounded-lg">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono font-medium text-slate-300">
            Defined Zones: <span className="text-cyan-400 font-bold tabular-nums">{zones.length}</span>
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-xs text-slate-400">
            Coordinate System: <span className="font-mono text-slate-300">Normalized (0.000 – 1.000)</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {!isDrawing ? (
            <>
              <button
                type="button"
                onClick={startNewZone}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-900 bg-cyan-400 hover:bg-cyan-300 rounded transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Draw Safety Zone</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('forklift')}
                className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition-colors"
                title="Add standard industrial forklift transit lane polygon"
              >
                + Forklift Preset
              </button>

              <button
                type="button"
                onClick={() => applyPreset('buffer')}
                className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition-colors"
                title="Add staging buffer zone"
              >
                + Buffer Preset
              </button>

              {zones.length > 0 && (
                <button
                  type="button"
                  onClick={() => onZonesChange([])}
                  className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-red-400 bg-slate-900 rounded border border-slate-800 hover:border-red-900/40 transition-colors"
                  title="Clear all zones"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newZoneName}
                onChange={(e) => setNewZoneName(e.target.value)}
                placeholder="Zone identifier name..."
                className="px-2.5 py-1 text-xs bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-cyan-400 w-44"
              />

              <select
                value={newZoneSeverity}
                onChange={(e) => setNewZoneSeverity(e.target.value as ZoneSeverity)}
                aria-label="Zone hazard severity level"
                className="px-2 py-1 text-xs bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-cyan-400"
              >
                <option value="CRITICAL">CRITICAL (High Hazard)</option>
                <option value="WARNING">WARNING (Buffer Zone)</option>
                <option value="CAUTION">CAUTION (Walkway Advisory)</option>
              </select>

              <button
                type="button"
                onClick={finishDrawing}
                disabled={currentPoints.length < 3}
                className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded transition-colors ${
                  currentPoints.length >= 3
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>Complete ({currentPoints.length} pts)</span>
              </button>

              <button
                type="button"
                onClick={cancelDrawing}
                className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Drawing Instructions banner when active */}
      {isDrawing && (
        <div className="flex items-center gap-2 px-3 py-2 bg-cyan-950/40 border border-cyan-500/30 rounded text-xs text-cyan-200">
          <Info className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>
            Click on video frame to plot vertices. Place at least 3 points, then click the first point or &quot;Complete&quot; to establish the safety zone.
          </span>
        </div>
      )}

      {/* Main Canvas & Video Viewport */}
      <div
        ref={containerRef}
        className="relative bg-slate-950 border border-slate-800 rounded-lg overflow-hidden select-none"
        style={{ minHeight: '360px' }}
      >
        {/* Underlying Video or Placeholder */}
        <div className="w-full h-full flex items-center justify-center bg-slate-950">
          {previewImageUrl ? (
            <img
              src={previewImageUrl}
              alt="Video frame preview"
              className="w-full h-auto object-contain block opacity-85"
            />
          ) : (
            <div className="w-full h-80 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 text-slate-500 text-xs">
              <div className="w-16 h-12 border-2 border-dashed border-slate-700 rounded flex items-center justify-center mb-2">
                <span className="font-mono text-slate-400 text-[10px]">CCTV</span>
              </div>
              <span>Upload footage above or use reference template to preview video frame</span>
            </div>
          )}
        </div>

        {/* Overlay Interactive Drawing Canvas */}
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          className={`absolute inset-0 w-full h-full z-10 ${
            isDrawing ? 'cursor-crosshair' : draggedVertex ? 'cursor-grabbing' : 'cursor-default'
          }`}
        />

        {/* Floating crosshair coordinates in bottom-right corner */}
        {cursorPos && (
          <div className="absolute bottom-2 right-2 z-20 px-2 py-1 bg-slate-950/80 backdrop-blur border border-slate-800 rounded text-[10px] font-mono text-slate-400 pointer-events-none tabular-nums">
            X: {cursorPos.x.toFixed(3)} · Y: {cursorPos.y.toFixed(3)}
            {videoResolution && (
              <span className="text-slate-500">
                {' '}
                ({Math.round(cursorPos.x * videoResolution.width)}px, {Math.round(cursorPos.y * videoResolution.height)}px)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Zone Definitions List & Inspection */}
      {zones.length > 0 && (
        <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/60">
          <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800 text-xs">
            <span className="font-semibold text-slate-300">Configured Safety Zones</span>
            <button
              type="button"
              onClick={() => setShowCoordinateTable(!showCoordinateTable)}
              className="text-slate-400 hover:text-cyan-400 font-mono text-[11px] transition-colors"
            >
              {showCoordinateTable ? 'Hide Raw Coordinates' : 'Inspect Raw Coordinates'}
            </button>
          </div>

          <div className="divide-y divide-slate-800/60">
            {zones.map((zone) => {
              const isSelected = zone.id === activeZoneId;
              const severityInfo = SEVERITY_COLORS[zone.severity];

              return (
                <div
                  key={zone.id}
                  onClick={() => onSelectZone(zone.id)}
                  className={`p-3 flex flex-wrap items-center justify-between gap-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-slate-800/80 border-l-2 border-l-cyan-400' : 'hover:bg-slate-850'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: severityInfo.stroke }}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-200">{zone.name}</span>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${severityInfo.border} ${severityInfo.text}`}
                        >
                          {zone.severity}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {zone.points.length} vertices · Area Coverage:{' '}
                        {(calculatePolygonArea(zone.points) * 100).toFixed(1)}% of frame
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteZone(zone.id);
                      }}
                      className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                      title="Delete zone"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Coordinate inspection drawer */}
          {showCoordinateTable && (
            <div className="p-3 bg-slate-950 border-t border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto">
              <pre className="text-slate-400">{JSON.stringify(zones, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Simple point-in-polygon ray-casting algorithm
function isPointInPolygon(point: Point2D, vs: Point2D[]): boolean {
  const x = point.x;
  const y = point.y;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x;
    const yi = vs[i].y;
    const xj = vs[j].x;
    const yj = vs[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Approximate polygon area using Shoelace formula
function calculatePolygonArea(pts: Point2D[]): number {
  if (pts.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}
