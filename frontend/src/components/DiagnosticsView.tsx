import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Server,
  FileCode,
  Terminal,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { BackendHealthState } from '../types/zoneguard';
import { api } from '../services/api';
import { getConfiguredBackendBaseUrl } from '../config/backend';

interface DiagnosticsViewProps {
  health: BackendHealthState | null;
  onRefreshHealth: () => Promise<void>;
  isRefreshing: boolean;
}

export const DiagnosticsView: React.FC<DiagnosticsViewProps> = ({
  health,
  onRefreshHealth,
  isRefreshing,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [openApiSchema, setOpenApiSchema] = useState<Record<string, unknown> | null>(null);
  const [isOpenApiLoading, setIsOpenApiLoading] = useState(false);
  const [openApiError, setOpenApiError] = useState<string | null>(null);

  const configuredBaseUrl = getConfiguredBackendBaseUrl();
  const opencvVersion = health?.opencv?.version || '5.0.0';
  const opencvSupported = health?.opencv?.supported ?? true;

  const fetchOpenApi = async () => {
    setIsOpenApiLoading(true);
    setOpenApiError(null);
    try {
      const schema = await api.getOpenApiSchema();
      setOpenApiSchema(schema);
    } catch (err: unknown) {
      setOpenApiError(err instanceof Error ? err.message : 'Failed to retrieve OpenAPI schema');
    } finally {
      setIsOpenApiLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b-2 border-slate-800">
        <div>
          <h2 className="text-base font-black text-slate-100 flex items-center gap-2 font-mono uppercase tracking-tight">
            <Server className="w-5 h-5 text-cyan-400" />
            System Status & Connectivity
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time verification of the OpenCV {opencvVersion} DNN video inspection service
          </p>
        </div>

        <button
          type="button"
          onClick={onRefreshHealth}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border-2 border-slate-700 rounded-sm transition-all disabled:opacity-50 neo-shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
          <span>Check Connection</span>
        </button>
      </div>

      {/* Main Connectivity Panel — Clean Default View */}
      <div
        className={`p-6 rounded-xl border-2 neo-shadow ${
          health?.connected
            ? 'bg-emerald-950/20 border-[#10B981] text-emerald-200'
            : health?.configured
            ? 'bg-red-950/20 border-[#FF626B] text-red-200'
            : 'bg-amber-950/20 border-[#FFBE55] text-amber-200'
        }`}
      >
        <div className="flex items-start gap-4">
          {health?.connected ? (
            <div className="w-10 h-10 rounded-sm bg-emerald-950 border-2 border-[#10B981] flex items-center justify-center text-emerald-400 shrink-0 neo-shadow-sm">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          ) : health?.configured ? (
            <div className="w-10 h-10 rounded-sm bg-red-950 border-2 border-[#FF626B] flex items-center justify-center text-red-400 shrink-0 neo-shadow-sm">
              <XCircle className="w-6 h-6" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-sm bg-amber-950 border-2 border-[#FFBE55] flex items-center justify-center text-amber-400 shrink-0 neo-shadow-sm">
              <AlertTriangle className="w-6 h-6" />
            </div>
          )}

          <div className="space-y-1.5 flex-1">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-sm font-black uppercase tracking-wider">
                {health?.connected
                  ? 'Vision Service Operational'
                  : health?.configured
                  ? 'Vision Backend Unreachable'
                  : 'Backend Not Configured'}
              </h3>
              {health?.latencyMs !== undefined && (
                <span className="text-[11px] font-mono text-cyan-300 font-bold tabular-nums">
                  {health.latencyMs}ms latency
                </span>
              )}
            </div>

            <p className="text-xs text-slate-200 leading-relaxed font-sans">
              {health?.connected
                ? `FastAPI vision service verified via GET /api/health. OpenCV ${opencvVersion} supported=${String(
                    opencvSupported
                  )} with YOLOX inference pipeline ready.`
                : health?.configured
                ? `Connection refused or timed out. ${health.error || 'Verify the tunnel or host status.'}`
                : 'No backend target URL is configured.'}
            </p>

            <div className="pt-2 text-[11px] font-mono text-slate-400 flex flex-wrap items-center gap-4">
              <span>
                Last check:{' '}
                <strong className="text-slate-200">
                  {health?.checkedAt ? new Date(health.checkedAt).toLocaleTimeString() : 'Never'}
                </strong>
              </span>
              <span>·</span>
              <span>
                OpenCV Status:{' '}
                <strong className={opencvSupported ? 'text-emerald-400' : 'text-red-400'}>
                  {opencvSupported ? `Ready (v${opencvVersion})` : 'Unsupported'}
                </strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Progressive Disclosure: Advanced Diagnostics Toggle */}
      <div className="border-2 border-slate-800 rounded-xl bg-slate-900 overflow-hidden neo-shadow">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-850 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider">
              Advanced Technical Diagnostics & Endpoints
            </span>
          </div>
          {showAdvanced ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {showAdvanced && (
          <div className="p-4 border-t-2 border-slate-800 space-y-5 bg-slate-950/60">
            {/* Endpoints List */}
            <div className="space-y-2">
              <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                Active FastAPI Endpoints:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded flex justify-between">
                  <span className="text-emerald-400 font-bold">GET /api/health</span>
                  <span className="text-slate-400">Readiness check</span>
                </div>
                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded flex justify-between">
                  <span className="text-cyan-400 font-bold">POST /api/videos</span>
                  <span className="text-slate-400">Video multipart upload</span>
                </div>
                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded flex justify-between">
                  <span className="text-cyan-400 font-bold">POST /api/analyze</span>
                  <span className="text-slate-400">YOLOX + footpoint run</span>
                </div>
                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded flex justify-between">
                  <span className="text-emerald-400 font-bold">GET /api/analyses/&#123;id&#125;</span>
                  <span className="text-slate-400">Status lookup</span>
                </div>
                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded flex justify-between">
                  <span className="text-emerald-400 font-bold">GET /api/analyses/&#123;id&#125;/report</span>
                  <span className="text-slate-400">JSON report</span>
                </div>
                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded flex justify-between">
                  <span className="text-emerald-400 font-bold">GET /api/analyses/&#123;id&#125;/annotated</span>
                  <span className="text-slate-400">MP4 video stream</span>
                </div>
              </div>
            </div>

            {/* Target URL Reference */}
            <div className="p-3 bg-slate-900 border border-slate-800 rounded text-xs font-mono space-y-1">
              <span className="text-[10px] text-slate-500 uppercase font-bold block">
                Configured Backend Base Target
              </span>
              <span className="text-cyan-300 break-all">{configuredBaseUrl}</span>
            </div>

            {/* OpenAPI Specification Introspection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                  OpenAPI Schema Introspection (/openapi.json):
                </span>
                <button
                  type="button"
                  onClick={fetchOpenApi}
                  disabled={isOpenApiLoading || !health?.connected}
                  className="px-2.5 py-1 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded disabled:opacity-40"
                >
                  {isOpenApiLoading ? 'Fetching…' : 'Introspect Routes'}
                </button>
              </div>

              {openApiError && (
                <div className="p-2.5 bg-red-950/40 border border-red-500 rounded text-xs text-red-300 font-mono">
                  {openApiError}
                </div>
              )}

              {openApiSchema ? (
                <div className="max-h-56 overflow-y-auto bg-slate-950 p-3 rounded border border-slate-800 text-[11px] font-mono text-slate-300">
                  <pre>{JSON.stringify(openApiSchema, null, 2)}</pre>
                </div>
              ) : (
                <div className="p-4 bg-slate-900/50 rounded border border-slate-800/80 text-center text-xs text-slate-500 font-mono">
                  Click &quot;Introspect Routes&quot; to inspect the live FastAPI OpenAPI contract definitions.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
