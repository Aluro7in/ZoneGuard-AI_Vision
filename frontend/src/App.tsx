/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Navbar, NavTab } from './components/Navbar';
import { OverviewView } from './components/OverviewView';
import { NewInvestigationView } from './components/NewInvestigationView';
import { WorkspaceView } from './components/WorkspaceView';
import { CopilotView } from './components/CopilotView';
import { DiagnosticsView } from './components/DiagnosticsView';
import { ThemeProvider } from './context/ThemeContext';
import {
  BackendHealthState,
  BackendVideoUploadResponse,
  InvestigationRecord,
  SafetyZone,
} from './types/zoneguard';
import { api } from './services/api';
import { Shield, AlertCircle } from 'lucide-react';

function AppContent() {
  const [currentTab, setCurrentTab] = useState<NavTab>('overview');
  const [health, setHealth] = useState<BackendHealthState | null>(null);
  const [isHealthRefreshing, setIsHealthRefreshing] = useState(false);

  // Investigation state
  const [currentInvestigation, setCurrentInvestigation] = useState<InvestigationRecord | null>(null);
  const [recentInvestigations, setRecentInvestigations] = useState<InvestigationRecord[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStageText, setAnalysisStageText] = useState<string>('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Run backend health check via GET /api/health
  const refreshHealth = useCallback(async () => {
    setIsHealthRefreshing(true);
    setGlobalError(null);
    try {
      const state = await api.checkHealth();
      setHealth(state);
    } catch (err: unknown) {
      setHealth({
        configured: false,
        connected: false,
        status: 'unreachable',
        error: err instanceof Error ? err.message : 'Failed to reach server proxy',
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setIsHealthRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshHealth();
  }, [refreshHealth]);

  // Retrieve an existing analysis from FastAPI via GET /api/analyses/{analysis_id} and /report
  const handleLookupAnalysis = async (analysisId: string) => {
    setIsLookingUp(true);
    setGlobalError(null);
    try {
      const record = await api.getInvestigation(analysisId);
      setCurrentInvestigation(record);
      setRecentInvestigations((prev) => {
        const filtered = prev.filter((r) => r.investigation_id !== record.investigation_id);
        return [record, ...filtered];
      });
      setCurrentTab('workspace');
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to load analysis from backend');
    } finally {
      setIsLookingUp(false);
    }
  };

  // Start real investigation via POST /api/videos and POST /api/analyze
  const handleStartAnalysis = async (
    videoFile: File,
    zones: SafetyZone[],
    options?: {
      existingUpload?: BackendVideoUploadResponse;
      localVideoUrl?: string;
      max_frames?: number;
    }
  ) => {
    setIsAnalyzing(true);
    setAnalysisStageText('Uploading footage to vision pipeline…');
    setGlobalError(null);
    try {
      const record = await api.startInvestigation(videoFile, zones, {
        ...options,
        onStageChange: (_stage, detail) => {
          if (detail) setAnalysisStageText(detail);
        },
      });
      setCurrentInvestigation(record);
      setRecentInvestigations((prev) => {
        const filtered = prev.filter((r) => r.investigation_id !== record.investigation_id);
        return [record, ...filtered];
      });
      setCurrentTab('workspace');
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : 'Investigation launch failed');
    } finally {
      setIsAnalyzing(false);
      setAnalysisStageText('');
    }
  };

  const handleOpenCopilotFromWorkspace = (record: InvestigationRecord) => {
    setCurrentInvestigation(record);
    setCurrentTab('copilot');
  };

  return (
    <div className="min-h-screen flex flex-col font-sans transition-colors duration-150">
      {/* Top Bar Navigation */}
      <Navbar
        currentTab={currentTab}
        onTabChange={(tab) => {
          setGlobalError(null);
          setCurrentTab(tab);
        }}
        health={health}
        onStartNewClick={() => {
          setGlobalError(null);
          setCurrentTab('new-investigation');
        }}
      />

      {/* Global error banner if present */}
      {globalError && (
        <div className="bg-red-950/70 border-b-2 border-red-500 px-4 py-2.5 text-xs text-red-200">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{globalError}</span>
            </div>
            <button
              onClick={() => setGlobalError(null)}
              className="text-red-300 hover:text-white font-mono text-xs font-bold"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 px-4 sm:px-6 py-6 max-w-7xl w-full mx-auto">
        {currentTab === 'overview' && (
          <OverviewView
            health={health}
            onStartNew={() => setCurrentTab('new-investigation')}
            onOpenDiagnostics={() => setCurrentTab('diagnostics')}
            onLookupAnalysis={handleLookupAnalysis}
            isLookingUp={isLookingUp}
            recentInvestigations={recentInvestigations}
            onSelectInvestigation={(rec) => {
              setCurrentInvestigation(rec);
              setCurrentTab('workspace');
            }}
          />
        )}

        {currentTab === 'new-investigation' && (
          <NewInvestigationView
            health={health}
            onStartAnalysis={handleStartAnalysis}
            isAnalyzing={isAnalyzing}
            analysisStageText={analysisStageText}
            onOpenDiagnostics={() => setCurrentTab('diagnostics')}
          />
        )}

        {currentTab === 'workspace' && (
          currentInvestigation ? (
            <WorkspaceView
              investigation={currentInvestigation}
              onUpdateInvestigation={(updated) => {
                setCurrentInvestigation(updated);
                setRecentInvestigations((prev) =>
                  prev.map((r) => (r.investigation_id === updated.investigation_id ? updated : r))
                );
              }}
              onExitSample={() => {
                setCurrentInvestigation(null);
                setCurrentTab('overview');
              }}
              onNewInvestigationClick={() => setCurrentTab('new-investigation')}
              onOpenCopilotWithInvestigation={handleOpenCopilotFromWorkspace}
            />
          ) : (
            <div className="p-12 text-center bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-800 rounded-xl neo-shadow space-y-3 max-w-xl mx-auto transition-colors">
              <Shield className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No Active Investigation Loaded</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Upload workplace footage and mark polygon exclusion zones to launch a live investigation, or retrieve an existing analysis by ID from Overview.
              </p>
              <div className="pt-2 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setCurrentTab('new-investigation')}
                  className="px-4 py-2 text-xs font-black uppercase text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-sm border-2 border-slate-900 neo-shadow-sm transition-all"
                >
                  Start New Investigation
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTab('overview')}
                  className="px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border-2 border-slate-300 dark:border-slate-700 rounded-sm transition-colors"
                >
                  Lookup by Analysis ID
                </button>
              </div>
            </div>
          )
        )}

        {currentTab === 'copilot' && (
          <CopilotView
            activeInvestigation={currentInvestigation}
          />
        )}

        {currentTab === 'diagnostics' && (
          <DiagnosticsView
            health={health}
            onRefreshHealth={refreshHealth}
            isRefreshing={isHealthRefreshing}
          />
        )}
      </main>

      {/* Clean Industrial Footer */}
      <footer className="border-t-2 border-slate-200 dark:border-slate-800 px-6 py-4 text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-[#0B0D12] transition-colors">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-black text-slate-900 dark:text-slate-100 font-sans tracking-tight">ZoneGuard</span>
            <span>·</span>
            <span>Agentic Visual Safety Inspector</span>
            <span>·</span>
            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
              OpenCV {health?.opencv?.version || '5.0.0'} DNN & YOLOX Vision
            </span>
          </div>

          <div className="flex items-center gap-4 text-[11px] font-mono text-slate-600 dark:text-slate-400">
            <span>
              Engine:{' '}
              {health?.connected ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">Online</span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 font-bold">Offline</span>
              )}
            </span>
            <span>·</span>
            <span>Defensible Visual Evidence Chain</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
