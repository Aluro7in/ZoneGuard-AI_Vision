import React, { useState } from 'react';
import {
  ArrowDown,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Layers,
  Search,
  Crosshair,
  FileText,
  Video,
} from 'lucide-react';
import { AgentTraceStep } from '../types/zoneguard';

interface AgentTraceViewProps {
  trace: AgentTraceStep[];
}

export const AgentTraceView: React.FC<AgentTraceViewProps> = ({ trace }) => {
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});

  if (!trace || trace.length === 0) {
    return (
      <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-lg text-center text-slate-500 text-xs">
        <span>Investigation trace unavailable.</span>
      </div>
    );
  }

  const toggleStep = (stepNumber: number) => {
    setExpandedSteps((prev) => ({
      ...prev,
      [stepNumber]: !prev[stepNumber],
    }));
  };

  const getToolIcon = (toolName: string) => {
    const lower = toolName.toLowerCase();
    if (lower.includes('yolox') || lower.includes('dnn') || lower.includes('detection')) {
      return <Search className="w-4 h-4 text-cyan-400" />;
    }
    if (lower.includes('footpoint') || lower.includes('occupancy')) {
      return <Crosshair className="w-4 h-4 text-emerald-400" />;
    }
    if (lower.includes('evidence') || lower.includes('extractor') || lower.includes('frame')) {
      return <Layers className="w-4 h-4 text-purple-400" />;
    }
    if (lower.includes('report') || lower.includes('generator')) {
      return <FileText className="w-4 h-4 text-blue-400" />;
    }
    return <Sparkles className="w-4 h-4 text-amber-400" />;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div>
          <h3 className="text-xs font-semibold text-slate-200">
            Agentic Vision Decision Chain
          </h3>
          <p className="text-[11px] text-slate-400">
            Inspection trace detailing how computer vision findings influenced subsequent tool executions
          </p>
        </div>
        <span className="text-[11px] font-mono text-cyan-400 tabular-nums">
          {trace.length} tool executions
        </span>
      </div>

      <div className="space-y-2">
        {trace.map((step, idx) => {
          const isExpanded = expandedSteps[step.step] ?? true;
          const isSuccess = step.status === 'SUCCESS';

          return (
            <div key={step.step} className="relative">
              {/* Card Container */}
              <div
                className={`p-3 bg-slate-900 border rounded-lg transition-colors ${
                  isSuccess ? 'border-slate-800' : 'border-red-900/40 bg-red-950/10'
                }`}
              >
                {/* Header row */}
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleStep(step.step)}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-mono font-bold text-slate-300">
                      {step.step}
                    </span>
                    <div className="p-1 rounded bg-slate-800/80 border border-slate-700/60">
                      {getToolIcon(step.tool)}
                    </div>
                    <div>
                      <span className="font-mono text-xs font-semibold text-slate-200">{step.tool}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[11px] font-mono text-slate-400 tabular-nums">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {step.duration_ms}ms
                    </span>

                    {isSuccess ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                        <CheckCircle2 className="w-3 h-3" />
                        SUCCESS
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-red-400 bg-red-950/40 border border-red-500/30 px-1.5 py-0.5 rounded">
                        <XCircle className="w-3 h-3" />
                        FAILED
                      </span>
                    )}

                    <button
                      type="button"
                      className="text-slate-500 hover:text-slate-300 transition-colors"
                      aria-label={isExpanded ? 'Collapse step' : 'Expand step'}
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-2.5 text-xs">
                    {/* Tool Input Summary */}
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                        Input Parameters
                      </span>
                      <p className="font-mono text-[11px] text-slate-300 bg-slate-950 p-2 rounded border border-slate-800/80 mt-0.5">
                        {step.input_summary}
                      </p>
                    </div>

                    {/* Tool Result Summary */}
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                        Visual Finding Output
                      </span>
                      <p className="font-mono text-[11px] text-slate-200 bg-slate-950 p-2 rounded border border-slate-800/80 mt-0.5">
                        {step.result_summary}
                      </p>
                    </div>

                    {/* Influence Explanation: Core Value Prop */}
                    <div className="p-2.5 rounded bg-cyan-950/30 border border-cyan-500/30 text-cyan-200">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono font-semibold text-cyan-400 uppercase tracking-wider mb-1">
                        <Sparkles className="w-3 h-3" />
                        <span>Investigation Consequence</span>
                      </div>
                      <p className="text-xs leading-relaxed text-cyan-100/90 font-sans">
                        {step.influence_explanation}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Connecting Down Arrow between steps */}
              {idx < trace.length - 1 && (
                <div className="flex justify-center my-1">
                  <ArrowDown className="w-3.5 h-3.5 text-slate-600" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
