import React, { useState } from 'react';
import { X, CheckCircle, AlertTriangle, ShieldX, UserCheck, MessageSquare } from 'lucide-react';
import { ZoneEvent, ReviewDecision } from '../types/zoneguard';

interface ReviewModalProps {
  event: ZoneEvent;
  onClose: () => void;
  onSubmitReview: (
    eventId: string,
    decision: 'CONFIRMED' | 'FALSE_ALARM' | 'DISMISSED',
    reviewerName: string,
    notes: string
  ) => Promise<void>;
  isSubmitting?: boolean;
}

export const ReviewModal: React.FC<ReviewModalProps> = ({
  event,
  onClose,
  onSubmitReview,
  isSubmitting = false,
}) => {
  const [decision, setDecision] = useState<'CONFIRMED' | 'FALSE_ALARM' | 'DISMISSED'>('CONFIRMED');
  const [reviewerName, setReviewerName] = useState('Safety Lead Auditor');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmitReview(event.id, decision, reviewerName.trim() || 'Safety Auditor', notes.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-semibold text-slate-200">
              Human Operator Safety Sign-Off
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1"
            aria-label="Close review modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Finding attribution breakdown */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-mono text-[11px]">1. Automated Model Finding:</span>
              <span className="text-slate-200 font-semibold font-mono">
                {event.event_type} (Track #{event.track_id})
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-mono text-[11px]">2. Agent Verification Result:</span>
              <span className="text-red-400 font-semibold font-mono">
                {event.verification_status}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-mono text-[11px]">3. Event Timestamp:</span>
              <span className="text-cyan-400 font-mono tabular-nums">
                t={event.timestamp_seconds.toFixed(2)}s in {event.zone_name}
              </span>
            </div>
          </div>

          {/* Audit Decision Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Select Auditor Decision
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setDecision('CONFIRMED')}
                className={`flex flex-col items-center justify-center p-2.5 rounded border text-xs transition-colors ${
                  decision === 'CONFIRMED'
                    ? 'bg-red-950/60 border-red-500 text-red-200 font-semibold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <AlertTriangle className="w-4 h-4 mb-1 text-red-400" />
                <span>Confirm Violation</span>
              </button>

              <button
                type="button"
                onClick={() => setDecision('FALSE_ALARM')}
                className={`flex flex-col items-center justify-center p-2.5 rounded border text-xs transition-colors ${
                  decision === 'FALSE_ALARM'
                    ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200 font-semibold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <CheckCircle className="w-4 h-4 mb-1 text-emerald-400" />
                <span>False Alarm</span>
              </button>

              <button
                type="button"
                onClick={() => setDecision('DISMISSED')}
                className={`flex flex-col items-center justify-center p-2.5 rounded border text-xs transition-colors ${
                  decision === 'DISMISSED'
                    ? 'bg-slate-800 border-slate-600 text-slate-200 font-semibold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <ShieldX className="w-4 h-4 mb-1 text-slate-400" />
                <span>Dismiss</span>
              </button>
            </div>
          </div>

          {/* Reviewer Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Safety Reviewer Name / Badge ID
            </label>
            <input
              type="text"
              required
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
            />
          </div>

          {/* Corrective Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Corrective Action or Auditor Observation Notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Pedestrian walked through aisle without checking mirror; retraining ticket filed."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 focus:outline-none focus:border-cyan-400 resize-none"
            />
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Recording Decision...' : 'Save Audit Decision'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
