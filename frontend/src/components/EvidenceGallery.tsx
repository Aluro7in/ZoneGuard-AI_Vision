import React, { useState } from 'react';
import { Camera, ZoomIn, Download, X, Crosshair } from 'lucide-react';
import { BackendEvidenceFrame, ZoneEvent } from '../types/zoneguard';

interface EvidenceGalleryProps {
  investigationId: string;
  events: ZoneEvent[];
  evidenceFrames?: BackendEvidenceFrame[];
  isSimulated?: boolean;
}

interface GalleryItem {
  id: string;
  label: string;
  timestamp: number;
  frameIndex?: number;
  imageSrc?: string;
  event?: ZoneEvent;
}

export const EvidenceGallery: React.FC<EvidenceGalleryProps> = ({
  investigationId,
  events,
  evidenceFrames = [],
}) => {
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);

  // Build gallery items from actual backend evidence.frames first
  const items: GalleryItem[] = [];

  if (evidenceFrames.length > 0) {
    evidenceFrames.forEach((f, idx) => {
      // Find closest event if any
      const matchingEvent = events.find(
        (e) =>
          f.timestamp >= e.timestamp_seconds - 0.6 &&
          f.timestamp <= (e.end_timestamp_seconds ?? e.timestamp_seconds) + 0.6
      );
      items.push({
        id: `frame-${f.frame}-${idx}`,
        label: `Frame #${f.frame}`,
        timestamp: f.timestamp,
        frameIndex: f.frame,
        imageSrc: f.image,
        event: matchingEvent,
      });
    });
  } else {
    // Fallback to any frame references attached to events
    events.forEach((evt) => {
      evt.evidence_frames.forEach((frameName, idx) => {
        items.push({
          id: `${evt.id}-${frameName}-${idx}`,
          label: frameName,
          timestamp: evt.timestamp_seconds,
          imageSrc: frameName.startsWith('data:image/') ? frameName : undefined,
          event: evt,
        });
      });
    });
  }

  if (items.length === 0) {
    return (
      <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-lg text-center text-slate-500 text-xs">
        <Camera className="w-8 h-8 text-slate-700 mx-auto mb-2" />
        <span>No forensic evidence frames extracted for this analysis run.</span>
      </div>
    );
  }

  const handleDownloadFrame = (item: GalleryItem) => {
    if (!item.imageSrc) return;
    const link = document.createElement('a');
    link.href = item.imageSrc;
    link.download = `${investigationId}-frame-${item.frameIndex ?? item.timestamp.toFixed(2)}.jpg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div>
          <h3 className="text-xs font-semibold text-slate-200">
            Forensic Evidence Keyframes
          </h3>
          <p className="text-[11px] text-slate-400">
            Extracted OpenCV 5 keyframes with annotated zone polygons and footpoint detections
          </p>
        </div>
        <span className="text-[11px] font-mono text-cyan-400 tabular-nums">
          {items.length} {items.length === 1 ? 'keyframe' : 'keyframes'}
        </span>
      </div>

      {/* Grid of frames */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => setSelectedItem(item)}
            className="group relative bg-slate-900 border border-slate-800 hover:border-cyan-500/50 rounded-lg overflow-hidden cursor-pointer transition-all flex flex-col"
          >
            <div className="aspect-video w-full bg-slate-950 flex items-center justify-center relative overflow-hidden">
              {item.imageSrc ? (
                <img
                  src={item.imageSrc}
                  alt={`${item.label} at t=${item.timestamp.toFixed(2)}s`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-3 text-center">
                  <div className="w-8 h-8 rounded-full border border-cyan-500/40 bg-cyan-950/40 flex items-center justify-center mb-1 text-cyan-400">
                    <Crosshair className="w-4 h-4" />
                  </div>
                  <span className="font-mono text-xs font-bold text-slate-200">{item.label}</span>
                </div>
              )}

              <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-950/80 p-1 rounded text-cyan-300">
                <ZoomIn className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="p-2 bg-slate-900 text-[11px] border-t border-slate-800/60 flex items-center justify-between gap-2">
              <span className="font-mono text-slate-200 truncate">
                {item.label}
              </span>
              <span className="text-[10px] font-mono text-cyan-400 tabular-nums shrink-0">
                t={item.timestamp.toFixed(2)}s
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Frame Detail Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-3xl w-full overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-mono font-semibold text-slate-200">
                  {selectedItem.label} (t={selectedItem.timestamp.toFixed(2)}s) — Forensic Evidence Detail
                </span>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-slate-400 hover:text-slate-200 p-1"
                aria-label="Close evidence modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="aspect-video w-full bg-slate-950 rounded border border-slate-800 flex items-center justify-center relative overflow-hidden">
                {selectedItem.imageSrc ? (
                  <img
                    src={selectedItem.imageSrc}
                    alt={`${selectedItem.label} full resolution`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center p-6 space-y-2">
                    <Crosshair className="w-8 h-8 text-cyan-400 mx-auto" />
                    <p className="text-xs text-slate-400 font-mono">{selectedItem.label}</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase">Frame Index</span>
                  <span className="text-slate-200 font-semibold tabular-nums">
                    {selectedItem.frameIndex !== undefined ? `#${selectedItem.frameIndex}` : selectedItem.label}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase">Timestamp</span>
                  <span className="text-cyan-400 font-semibold tabular-nums">
                    {selectedItem.timestamp.toFixed(2)}s
                  </span>
                </div>
                <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase">Associated Event</span>
                  <span className="text-slate-200 font-semibold">
                    {selectedItem.event
                      ? `${selectedItem.event.event_type} (Track #${selectedItem.event.track_id})`
                      : 'Extracted Keyframe'}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase">Analysis ID</span>
                  <span className="text-slate-300 truncate block" title={investigationId}>
                    {investigationId.slice(0, 12)}…
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 px-4 py-3 bg-slate-950 border-t border-slate-800">
              {selectedItem.imageSrc ? (
                <button
                  type="button"
                  onClick={() => handleDownloadFrame(selectedItem)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Keyframe JPEG</span>
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
