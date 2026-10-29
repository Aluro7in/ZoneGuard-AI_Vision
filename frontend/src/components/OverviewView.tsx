import React, { useState } from 'react';
import {
  Shield,
  Plus,
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  Cpu,
  ChevronRight,
  Search,
  Eye,
  Activity,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { BackendHealthState, InvestigationRecord } from '../types/zoneguard';
import { StatusBadge } from './StatusBadge';

export interface OverviewViewProps {
  health: BackendHealthState | null;
  onStartNew: () => void;
  onOpenDiagnostics: () => void;
  onLookupAnalysis: (analysisId: string) => Promise<void>;
  isLookingUp?: boolean;
  recentInvestigations: InvestigationRecord[];
  onSelectInvestigation: (record: InvestigationRecord) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  health,
  onStartNew,
  onOpenDiagnostics,
  onLookupAnalysis,
  isLookingUp = false,
  recentInvestigations,
  onSelectInvestigation,
}) => {
  const [lookupIdInput, setLookupIdInput] = useState('');

  const handleLookupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = lookupIdInput.trim();
    if (!trimmed) return;
    await onLookupAnalysis(trimmed);
  };

  // Compute real session summary stats without fabricating any numbers
  const alertCount = recentInvestigations.filter((r) => r.decision === 'ALERT').length;
  const reviewCount = recentInvestigations.filter((r) => r.decision === 'REVIEW').length;
  const clearCount = recentInvestigations.filter((r) => r.decision === 'CLEAR').length;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Hero Section — Neo-Brutalist Command Center */}
      <div className="relative p-6 sm:p-10 rounded-xl bg-gradient-to-br from-[#151923] via-[#151923] to-[#1D2330] border-2 border-slate-800 dark:border-slate-800 neo-shadow overflow-hidden">
        {/* Decorative Grid Accents */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-cyan-500/10 via-violet-500/10 to-transparent blur-2xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-slate-950 border border-cyan-500/40 rounded-sm text-[11px] font-mono font-bold text-cyan-400 neo-shadow-sm">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>Industrial Safety Intelligence Platform</span>
            <span>·</span>
            <span>OpenCV 5 DNN & YOLOX Vision</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-slate-100 tracking-tight leading-[1.1] font-sans">
            Know what happened.{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-violet-400">
              See the evidence.
            </span>{' '}
            Improve workplace safety.
          </h1>

          <p className="text-sm text-slate-300 leading-relaxed max-w-2xl font-sans">
            Turn workplace video into evidence-backed safety investigations with OpenCV 5 and an agentic
            visual inspection workflow. Ground-plane footpoint tracking eliminates false alarms and delivers
            verifiable, defensible incident records.
          </p>

          <div className="pt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onStartNew}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-sm transition-all border-2 border-slate-900 neo-shadow-sm active:translate-x-0.5 active:translate-y-0.5"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Start New Investigation</span>
            </button>

            <button
              type="button"
              onClick={onOpenDiagnostics}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-850 border-2 border-slate-700 rounded-sm transition-all neo-shadow-sm"
            >
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>
                System Status ({health?.connected ? 'Online' : 'Check Connection'})
              </span>
            </button>
          </div>

          {/* Quick Lookup by Analysis ID */}
          <form onSubmit={handleLookupSubmit} className="pt-4 max-w-xl">
            <label className="block text-[11px] font-mono text-slate-400 mb-1.5 font-bold uppercase tracking-wider">
              Retrieve Existing Analysis by ID
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={lookupIdInput}
                  onChange={(e) => setLookupIdInput(e.target.value)}
                  placeholder="Enter analysis_id (e.g. 67688e7854f049808b8e6ec9cb390938)"
                  className="w-full pl-8 pr-3 py-2 text-xs font-mono bg-slate-950 border-2 border-slate-700 rounded-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <button
                type="submit"
                disabled={isLookingUp || !lookupIdInput.trim()}
                className="px-4 py-2 text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border-2 border-slate-700 rounded-sm transition-colors disabled:opacity-40 whitespace-nowrap neo-shadow-sm"
              >
                {isLookingUp ? 'Fetching...' : 'Load'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Operational Summary Grid — Truthful Session Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* System State */}
        <div className="p-4 bg-slate-900 border-2 border-slate-800 rounded-lg neo-shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-bold uppercase text-slate-400">Vision Engine</span>
            {health?.connected ? (
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            ) : (
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            )}
          </div>
          <div className="text-lg font-black font-sans text-slate-100">
            {health?.connected ? 'Operational' : 'Unavailable'}
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            OpenCV {health?.opencv?.version || '5.0.0'} · YOLOX
          </div>
        </div>

        {/* Real Investigations Count */}
        <div className="p-4 bg-slate-900 border-2 border-slate-800 rounded-lg neo-shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-bold uppercase text-slate-400">Session Records</span>
            <FileCheck2 className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-lg font-black font-mono text-cyan-300 tabular-nums">
            {recentInvestigations.length}
          </div>
          <div className="text-[11px] text-slate-400">
            Completed video analyses
          </div>
        </div>

        {/* Confirmed Alerts */}
        <div className="p-4 bg-slate-900 border-2 border-slate-800 rounded-lg neo-shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-bold uppercase text-slate-400">Verified Alerts</span>
            <AlertTriangle className="w-4 h-4 text-[#FF626B]" />
          </div>
          <div className="text-lg font-black font-mono text-[#FF626B] tabular-nums">
            {alertCount}
          </div>
          <div className="text-[11px] text-slate-400">
            Footpoint breach confirmed
          </div>
        </div>

        {/* Human Review Required */}
        <div className="p-4 bg-slate-900 border-2 border-slate-800 rounded-lg neo-shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-bold uppercase text-slate-400">Audit Review</span>
            <Eye className="w-4 h-4 text-[#FFBE55]" />
          </div>
          <div className="text-lg font-black font-mono text-[#FFBE55] tabular-nums">
            {reviewCount}
          </div>
          <div className="text-[11px] text-slate-400">
            Borderline / requires sign-off
          </div>
        </div>
      </div>

      {/* Recent Investigations Session Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between pb-2 border-b-2 border-slate-800">
          <div>
            <h2 className="text-sm font-black tracking-tight text-slate-100 uppercase font-mono">
              Recent Investigation Records
            </h2>
            <p className="text-xs text-slate-400">
              Surveillance footage analyzed during this session
            </p>
          </div>
          <span className="text-xs font-mono text-cyan-400 tabular-nums font-bold">
            {recentInvestigations.length} records
          </span>
        </div>

        {recentInvestigations.length === 0 ? (
          <div className="p-8 bg-slate-900/40 border-2 border-dashed border-slate-800 rounded-xl text-center space-y-3 neo-shadow-sm">
            <Shield className="w-10 h-10 text-slate-600 mx-auto" />
            <div className="space-y-1 max-w-sm mx-auto">
              <h3 className="text-xs font-bold text-slate-200">No Investigations Loaded Yet</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Upload a warehouse or facility video, draw polygon exclusion zones, and let the agentic inspector identify hazardous crossings.
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={onStartNew}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-sm border-2 border-slate-900 neo-shadow-sm transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Launch First Investigation</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="border-2 border-slate-800 rounded-xl overflow-hidden bg-slate-900 divide-y-2 divide-slate-800 neo-shadow">
            {recentInvestigations.map((rec) => (
              <div
                key={rec.investigation_id}
                onClick={() => onSelectInvestigation(rec)}
                className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-850 cursor-pointer transition-colors"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs font-black text-slate-100">
                      #{rec.investigation_id.slice(0, 16)}…
                    </span>
                    <StatusBadge decision={rec.decision} status={rec.status} size="sm" />
                  </div>
                  <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2 font-mono text-[11px]">
                    <span>File: <strong className="text-slate-200">{rec.video_meta.filename}</strong></span>
                    <span>·</span>
                    <span>Duration: <strong className="text-slate-200">{rec.video_meta.duration_seconds}s</strong></span>
                    <span>·</span>
                    <span>Zones: <strong className="text-slate-200">{rec.zones.length}</strong></span>
                    <span>·</span>
                    <span>Keyframes: <strong className="text-slate-200">{rec.evidence_frames_data?.length ?? 0}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-mono text-slate-500">
                    {new Date(rec.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div className="inline-flex items-center gap-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs font-semibold text-slate-200">
                    <span>Open</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3 Core Capability Cards — Neo-Brutalist Architecture */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 bg-slate-900 border-2 border-slate-800 rounded-lg neo-shadow-sm space-y-2">
          <div className="w-9 h-9 rounded-sm bg-cyan-950 border-2 border-cyan-400 flex items-center justify-center text-cyan-400 neo-shadow-sm">
            <Crosshair className="w-4 h-4 stroke-[2.5]" />
          </div>
          <h3 className="text-sm font-black text-slate-100 font-sans">
            Footpoint Ground-Plane Occupancy
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed font-sans">
            Eliminates perspective distortion by calculating physical floor footpoints instead of raw bounding boxes.
          </p>
        </div>

        <div className="p-5 bg-slate-900 border-2 border-slate-800 rounded-lg neo-shadow-sm space-y-2">
          <div className="w-9 h-9 rounded-sm bg-emerald-950 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 neo-shadow-sm">
            <Cpu className="w-4 h-4 stroke-[2.5]" />
          </div>
          <h3 className="text-sm font-black text-slate-100 font-sans">
            Evidence-Driven Agentic Investigation
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed font-sans">
            An autonomous controller zooms into ambiguous frames, tracks temporal crossings, and logs tool steps.
          </p>
        </div>

        <div className="p-5 bg-slate-900 border-2 border-slate-800 rounded-lg neo-shadow-sm space-y-2">
          <div className="w-9 h-9 rounded-sm bg-violet-950 border-2 border-violet-400 flex items-center justify-center text-violet-400 neo-shadow-sm">
            <FileCheck2 className="w-4 h-4 stroke-[2.5]" />
          </div>
          <h3 className="text-sm font-black text-slate-100 font-sans">
            Defensible Audit Semantics
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed font-sans">
            Outcomes resolve to ALERT, CLEAR, or REVIEW. Safety teams never mistake missing detection for proof of safety.
          </p>
        </div>
      </div>
    </div>
  );
};
