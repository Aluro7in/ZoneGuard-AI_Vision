import React, { useState, useRef } from 'react';
import {
  Download,
  Video,
  CheckCircle2,
  AlertTriangle,
  Eye,
  RefreshCw,
  Sparkles,
  FileText,
  Clock,
  Layers,
  Search,
} from 'lucide-react';
import { InvestigationRecord, ZoneEvent } from '../types/zoneguard';
import { StatusBadge } from './StatusBadge';
import { VideoPlayer, VideoPlayerHandle } from './VideoPlayer';
import { EventTimeline } from './EventTimeline';
import { EvidenceGallery } from './EvidenceGallery';
import { AgentTraceView } from './AgentTraceView';
import { ReviewModal } from './ReviewModal';
import { SampleBanner } from './SampleBanner';
import { api } from '../services/api';

interface WorkspaceViewProps {
  investigation: InvestigationRecord;
  onUpdateInvestigation: (updated: InvestigationRecord) => void;
  onExitSample?: () => void;
  onNewInvestigationClick: () => void;
  onOpenCopilotWithInvestigation?: (investigation: InvestigationRecord) => void;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  investigation,
  onUpdateInvestigation,
  onExitSample,
  onNewInvestigationClick,
  onOpenCopilotWithInvestigation,
}) => {
  const videoPlayerRef = useRef<VideoPlayerHandle>(null);

  const [activeEventId, setActiveEventId] = useState<string | null>(
    investigation.events.length > 0 ? investigation.events[0].id : null
  );
  const [activeReviewEvent, setActiveReviewEvent] = useState<ZoneEvent | null>(null);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [statusBannerMessage, setStatusBannerMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'timeline' | 'trace' | 'evidence' | 'tracks'>('timeline');

  const analysisId = investigation.analysis_id || investigation.investigation_id;

  // Handle seeking video to specific timestamp
  const handleSeekToTimestamp = (timestampSeconds: number) => {
    videoPlayerRef.current?.seekTo(timestampSeconds);
  };

  // Refresh status & report from FastAPI GET /api/analyses/{analysis_id} and /report
  const handleRefreshAnalysisStatus = async () => {
    setIsRefreshingStatus(true);
    setStatusBannerMessage(null);
    try {
      const statusData = await api.getAnalysisStatus(analysisId);
      const refreshed = await api.getInvestigation(analysisId, investigation.zones);
      onUpdateInvestigation({
        ...refreshed,
        local_video_url: investigation.local_video_url,
        video_meta: {
          ...refreshed.video_meta,
          filename: investigation.video_meta.filename || refreshed.video_meta.filename,
        },
      });
      setStatusBannerMessage(
        `Verified analysis status: "${statusData.status}"`
      );
    } catch (err: unknown) {
      setStatusBannerMessage(
        `Status check failed: ${err instanceof Error ? err.message : 'Unable to reach backend'}`
      );
    } finally {
      setIsRefreshingStatus(false);
    }
  };

  // Submit human audit review annotation
  const handleSubmitReview = async (
    eventId: string,
    decision: 'CONFIRMED' | 'FALSE_ALARM' | 'DISMISSED',
    reviewerName: string,
    notes: string
  ) => {
    setIsSubmittingReview(true);
    try {
      const updatedEvents = investigation.events.map((evt) => {
        if (evt.id !== eventId) return evt;
        return {
          ...evt,
          review_state: decision,
          reviewer_notes: notes,
          reviewed_by: reviewerName,
          reviewed_at: new Date().toISOString(),
        };
      });
      onUpdateInvestigation({
        ...investigation,
        events: updatedEvents,
      });
    } finally {
      setIsSubmittingReview(false);
      setActiveReviewEvent(null);
    }
  };

  // Download JSON report from GET /api/analyses/{analysis_id}/report
  const handleDownloadReport = () => {
    const link = document.createElement('a');
    link.href = api.getReportDownloadUrl(analysisId);
    link.download = `zoneguard-report-${analysisId}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Download annotated video from GET /api/analyses/{analysis_id}/annotated
  const handleDownloadVideo = () => {
    const link = document.createElement('a');
    link.href = api.getAnnotatedVideoUrl(analysisId, false);
    link.download = `zoneguard-annotated-${analysisId}.mp4`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const resolutionLabel = `${investigation.video_meta.resolution.width}×${investigation.video_meta.resolution.height}`;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {investigation.is_simulated_reference && (
        <SampleBanner onDismiss={onExitSample} label={investigation.simulation_label} />
      )}

      {/* Top Header & Investigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 bg-slate-900 border-2 border-slate-800 rounded-xl neo-shadow">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-xs font-black text-slate-100">
              Analysis ID: <span className="text-cyan-300">#{analysisId.slice(0, 16)}…</span>
            </span>
            <StatusBadge decision={investigation.decision} status={investigation.status} size="md" />
            <span className="text-[11px] font-mono px-2 py-0.5 bg-slate-950 border border-slate-700 rounded text-slate-300">
              Uncertainty: <strong className="text-slate-100">{investigation.uncertainty_level}</strong>
            </span>
          </div>

          <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2 font-mono text-[11px]">
            <span>Video: <strong className="text-slate-200">{investigation.video_meta.filename}</strong></span>
            <span>·</span>
            <span>Resolution: <strong className="text-slate-200">{resolutionLabel}</strong></span>
            <span>·</span>
            <span>Duration: <strong className="text-slate-200">{investigation.video_meta.duration_seconds}s</strong></span>
            <span>·</span>
            <span>Zones: <strong className="text-slate-200">{investigation.zones.length}</strong></span>
            <span>·</span>
            <span>Keyframes: <strong className="text-slate-200">{investigation.evidence_frames_data?.length ?? 0}</strong></span>
          </div>
        </div>

        {/* Action Buttons: Copilot, Downloads & Refresh */}
        <div className="flex flex-wrap items-center gap-2">
          {onOpenCopilotWithInvestigation && (
            <button
              type="button"
              onClick={() => onOpenCopilotWithInvestigation(investigation)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-violet-200 bg-violet-950 hover:bg-violet-900 border-2 border-violet-400 rounded-sm transition-all neo-shadow-sm"
              title="Open ZoneGuard Copilot with this report context"
            >
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              <span>Analyze with AI Copilot</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleDownloadReport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border-2 border-slate-700 rounded-sm transition-all neo-shadow-sm"
            title="Download JSON incident report"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Download Report</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadVideo}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border-2 border-slate-700 rounded-sm transition-all neo-shadow-sm"
            title="Download annotated MP4 video"
          >
            <Video className="w-3.5 h-3.5 text-cyan-400" />
            <span>Download Video</span>
          </button>

          <button
            type="button"
            onClick={handleRefreshAnalysisStatus}
            disabled={isRefreshingStatus}
            className="p-2 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border-2 border-slate-700 rounded-sm transition-colors disabled:opacity-50"
            title="Refresh status from backend"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingStatus ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {statusBannerMessage && (
        <div className="px-4 py-2.5 bg-slate-900 border-2 border-cyan-500/40 rounded-lg text-xs font-mono text-cyan-300 flex items-center justify-between neo-shadow-sm">
          <span>{statusBannerMessage}</span>
          <button
            type="button"
            onClick={() => setStatusBannerMessage(null)}
            className="text-slate-400 hover:text-slate-200 text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Decision Summary Banner — Unmistakable Finding */}
      <div
        className={`p-5 rounded-xl border-2 neo-shadow ${
          investigation.decision === 'ALERT'
            ? 'bg-red-950/30 border-[#FF626B] text-red-200'
            : investigation.decision === 'CLEAR'
            ? 'bg-emerald-950/30 border-[#10B981] text-emerald-200'
            : 'bg-amber-950/30 border-[#FFBE55] text-amber-200'
        }`}
      >
        <div className="flex items-start gap-3.5">
          <div className="mt-0.5 shrink-0">
            {investigation.decision === 'ALERT' ? (
              <AlertTriangle className="w-6 h-6 text-[#FF626B]" />
            ) : investigation.decision === 'CLEAR' ? (
              <CheckCircle2 className="w-6 h-6 text-[#10B981]" />
            ) : (
              <Eye className="w-6 h-6 text-[#FFBE55]" />
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-black uppercase tracking-wider">
                Defensible Investigation Outcome: {investigation.decision}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-slate-200 font-sans font-medium">
              {investigation.decision_reason}
            </p>
          </div>
        </div>
      </div>

      {/* Primary Workspace Grid: Video & Inspection Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Columns: Video Player */}
        <div className="lg:col-span-7 space-y-4">
          <div className="border-2 border-slate-800 rounded-xl overflow-hidden bg-slate-950 neo-shadow">
            <VideoPlayer
              ref={videoPlayerRef}
              videoUrl={api.getAnnotatedVideoUrl(analysisId, true)}
              fallbackVideoUrl={investigation.local_video_url}
              fallbackPosterUrl={investigation.evidence_frames_data?.[0]?.image}
              zones={investigation.zones}
              events={investigation.events}
              observations={investigation.observations}
              sourceResolution={investigation.video_meta.resolution}
              activeEventId={activeEventId}
              onEventClick={(id) => setActiveEventId(id)}
            />
          </div>

          {/* Quick Zone Legend Strip */}
          <div className="p-3 bg-slate-900 border-2 border-slate-800 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs neo-shadow-sm">
            <span className="font-bold text-slate-300 font-mono uppercase text-[11px]">
              Active Exclusion Zones
            </span>
            <div className="flex flex-wrap items-center gap-3">
              {investigation.zones.map((z) => (
                <div key={z.id} className="flex items-center gap-1.5 font-mono text-[11px] text-slate-300">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      z.severity === 'CRITICAL'
                        ? 'bg-red-500'
                        : z.severity === 'WARNING'
                        ? 'bg-amber-400'
                        : 'bg-cyan-400'
                    }`}
                  />
                  <span>{z.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 5 Columns: Inspection Panel */}
        <div className="lg:col-span-5 space-y-4">
          {/* Sub-tab navigation */}
          <div className="flex items-center gap-1 p-1 bg-slate-900 border-2 border-slate-800 rounded-lg neo-shadow-sm">
            <button
              type="button"
              onClick={() => setActiveTab('timeline')}
              className={`flex-1 py-1.5 text-xs font-bold rounded transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'timeline'
                  ? 'bg-slate-800 text-cyan-300 border-b-2 border-cyan-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Timeline ({investigation.events.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('trace')}
              className={`flex-1 py-1.5 text-xs font-bold rounded transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'trace'
                  ? 'bg-slate-800 text-cyan-300 border-b-2 border-cyan-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Agent Trace ({investigation.agent_trace.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('evidence')}
              className={`flex-1 py-1.5 text-xs font-bold rounded transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'evidence'
                  ? 'bg-slate-800 text-cyan-300 border-b-2 border-cyan-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Keyframes ({investigation.evidence_frames_data?.length ?? investigation.events.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('tracks')}
              className={`flex-1 py-1.5 text-xs font-bold rounded transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'tracks'
                  ? 'bg-slate-800 text-cyan-300 border-b-2 border-cyan-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tracks ({investigation.tracks.length})
            </button>
          </div>

          {/* Tab content bodies */}
          <div className="bg-slate-900 border-2 border-slate-800 rounded-xl p-4 neo-shadow min-h-[460px]">
            {activeTab === 'timeline' && (
              <EventTimeline
                events={investigation.events}
                activeEventId={activeEventId}
                onSelectEvent={(id) => setActiveEventId(id)}
                onSeekToTimestamp={handleSeekToTimestamp}
                onOpenReviewModal={(evt) => setActiveReviewEvent(evt)}
              />
            )}

            {activeTab === 'trace' && (
              <AgentTraceView trace={investigation.agent_trace} />
            )}

            {activeTab === 'evidence' && (
              <EvidenceGallery
                investigationId={analysisId}
                events={investigation.events}
                evidenceFrames={investigation.evidence_frames_data}
                isSimulated={investigation.is_simulated_reference}
              />
            )}

            {activeTab === 'tracks' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div>
                    <h3 className="text-xs font-black text-slate-200 uppercase font-mono">
                      Multi-Object Tracking Table
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Verified YOLOX bounding boxes and footpoint coordinates across frames
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-cyan-400 tabular-nums font-bold">
                    {investigation.tracks.length} entities
                  </span>
                </div>

                {investigation.tracks.length === 0 ? (
                  <div className="p-8 bg-slate-950/60 border border-slate-800 rounded-lg text-center text-xs text-slate-500">
                    No person tracks were detected by YOLOX during this video scan.
                  </div>
                ) : (
                  <div className="border border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-800 text-xs font-mono">
                    {investigation.tracks.map((trk) => (
                      <div key={trk.track_id} className="p-3 bg-slate-950 flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-200">Track #{trk.track_id}</span>
                            <span className="text-[10px] uppercase font-bold text-cyan-400 bg-cyan-950 border border-cyan-500/40 px-1.5 py-0.2 rounded">
                              {trk.class_name}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1">
                            Seen: {trk.first_seen_s.toFixed(2)}s – {trk.last_seen_s.toFixed(2)}s
                          </div>
                        </div>

                        <div className="text-right">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                              trk.footpoint_in_zone
                                ? 'bg-red-950/50 border-red-500 text-red-300'
                                : 'bg-emerald-950/50 border-emerald-500 text-emerald-300'
                            }`}
                          >
                            {trk.footpoint_in_zone ? 'Zone Breach Confirmed' : 'Perimeter Safe'}
                          </span>
                          <div className="text-[10px] text-slate-500 mt-1">
                            Zone: {trk.max_iou_zone}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Human Review Modal */}
      {activeReviewEvent && (
        <ReviewModal
          event={activeReviewEvent}
          onClose={() => setActiveReviewEvent(null)}
          onSubmitReview={handleSubmitReview}
          isSubmitting={isSubmittingReview}
        />
      )}
    </div>
  );
};
