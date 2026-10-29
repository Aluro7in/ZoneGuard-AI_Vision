import React from 'react';
import {
  Clock,
  AlertOctagon,
  ArrowRight,
  ShieldCheck,
  HelpCircle,
  FileSearch,
  UserCheck,
  ChevronRight,
} from 'lucide-react';
import { ZoneEvent, VerificationStatus, ReviewDecision } from '../types/zoneguard';

interface EventTimelineProps {
  events: ZoneEvent[];
  activeEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  onSeekToTimestamp: (timestampSeconds: number) => void;
  onOpenReviewModal: (event: ZoneEvent) => void;
}

export const EventTimeline: React.FC<EventTimelineProps> = ({
  events,
  activeEventId,
  onSelectEvent,
  onSeekToTimestamp,
  onOpenReviewModal,
}) => {
  if (!events || events.length === 0) {
    return (
      <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-lg text-center text-slate-500 text-xs">
        <span>No qualifying safety zone events recorded during this investigation run.</span>
      </div>
    );
  }

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}s`;
  };

  const getVerificationBadge = (status: VerificationStatus) => {
    switch (status) {
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-red-400 bg-red-950/40 border border-red-500/30 px-1.5 py-0.5 rounded">
            <AlertOctagon className="w-3 h-3" />
            VERIFIED
          </span>
        );
      case 'AMBIGUOUS':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-amber-400 bg-amber-950/40 border border-amber-500/30 px-1.5 py-0.5 rounded">
            <HelpCircle className="w-3 h-3" />
            AMBIGUOUS
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
            UNCONFIRMED
          </span>
        );
    }
  };

  const getReviewBadge = (state: ReviewDecision) => {
    switch (state) {
      case 'CONFIRMED':
        return (
          <span className="text-[10px] font-mono text-red-300 bg-red-900/30 border border-red-500/30 px-1.5 py-0.5 rounded">
            Auditor Confirmed
          </span>
        );
      case 'FALSE_ALARM':
        return (
          <span className="text-[10px] font-mono text-emerald-300 bg-emerald-900/30 border border-emerald-500/30 px-1.5 py-0.5 rounded">
            Marked False Alarm
          </span>
        );
      case 'DISMISSED':
        return (
          <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
            Dismissed
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-mono text-amber-300/80 bg-amber-950/30 border border-amber-500/20 px-1.5 py-0.5 rounded">
            Review Required
          </span>
        );
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div>
          <h3 className="text-xs font-semibold text-slate-200">
            Chronological Incident Timeline
          </h3>
          <p className="text-[11px] text-slate-400">
            Click any event to seek video directly to the detected boundary transition
          </p>
        </div>
        <span className="text-[11px] font-mono text-slate-400 tabular-nums">
          {events.length} events logged
        </span>
      </div>

      <div className="space-y-2">
        {events.map((evt) => {
          const isSelected = activeEventId === evt.id;

          return (
            <div
              key={evt.id}
              onClick={() => {
                onSelectEvent(evt.id);
                onSeekToTimestamp(evt.timestamp_seconds);
              }}
              className={`p-3 bg-slate-900 border rounded-lg cursor-pointer transition-all ${
                isSelected
                  ? 'border-cyan-500/60 bg-slate-850 shadow-sm'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeekToTimestamp(evt.timestamp_seconds);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-800 hover:bg-cyan-950 border border-slate-700 hover:border-cyan-500/40 rounded text-xs font-mono font-bold text-cyan-300 transition-colors tabular-nums"
                    title="Seek video to timestamp"
                  >
                    <Clock className="w-3 h-3 text-cyan-400" />
                    <span>{formatSeconds(evt.timestamp_seconds)}</span>
                  </button>

                  <span className="text-xs font-semibold text-slate-200">
                    {evt.event_type.replace(/_/g, ' ')}
                  </span>
                  <span className="text-slate-600">·</span>
                  <span className="text-xs text-slate-400">{evt.zone_name}</span>
                </div>

                <div className="flex items-center gap-2">
                  {getVerificationBadge(evt.verification_status)}
                  {getReviewBadge(evt.review_state)}
                </div>
              </div>

              {/* Event details and explanation */}
              <p className="text-xs text-slate-300 leading-relaxed font-sans mb-2">
                {evt.reason_explanation}
              </p>

              {/* Metadata strip & Action buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/60 text-[11px] font-mono text-slate-400">
                <div className="flex items-center gap-3">
                  <span>
                    Track ID: <span className="text-slate-200 font-bold">#{evt.track_id}</span>
                  </span>
                  <span className="text-slate-700">|</span>
                  <span>
                    Model Confidence: <span className="text-slate-200 tabular-nums">{(evt.confidence * 100).toFixed(0)}%</span>
                  </span>
                  {evt.evidence_frames.length > 0 && (
                    <>
                      <span className="text-slate-700">|</span>
                      <span>
                        Frames: <span className="text-cyan-400">{evt.evidence_frames.join(', ')}</span>
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenReviewModal(evt);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded transition-colors text-[11px] font-sans font-medium"
                  >
                    <UserCheck className="w-3 h-3 text-cyan-400" />
                    <span>Audit Review</span>
                  </button>
                </div>
              </div>

              {/* Review notes if present */}
              {evt.reviewer_notes && (
                <div className="mt-2 p-2 bg-slate-950 border border-slate-800 rounded text-xs text-slate-300">
                  <span className="font-semibold text-slate-400">Auditor Note ({evt.reviewed_by || 'Officer'}): </span>
                  <span>{evt.reviewer_notes}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
