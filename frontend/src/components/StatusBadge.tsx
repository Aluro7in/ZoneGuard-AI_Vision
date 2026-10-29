import React from 'react';
import { AlertTriangle, CheckCircle2, Eye, Loader2, XCircle } from 'lucide-react';
import { InvestigationDecision, InvestigationStatus } from '../types/zoneguard';

interface StatusBadgeProps {
  decision?: InvestigationDecision;
  status?: InvestigationStatus;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ decision, status, size = 'md' }) => {
  // If actively processing
  if (status && status !== 'COMPLETED') {
    if (status === 'UPLOADING' || status === 'ANALYZING' || status === 'QUEUED') {
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-mono font-bold tracking-wider rounded-sm border-2 border-cyan-400 bg-cyan-950/60 text-cyan-300 dark:bg-cyan-950/80 dark:text-cyan-300 neo-shadow-sm ${
            size === 'lg' ? 'px-3 py-1.5 text-xs' : size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
          }`}
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
          <span>{status}</span>
        </span>
      );
    }
    if (status === 'ERROR') {
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-mono font-bold tracking-wider rounded-sm border-2 border-red-500 bg-red-950/60 text-red-300 dark:bg-red-950/80 dark:text-red-300 neo-shadow-sm ${
            size === 'lg' ? 'px-3 py-1.5 text-xs' : size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
          }`}
        >
          <XCircle className="w-3.5 h-3.5 text-red-400" />
          <span>FAILED</span>
        </span>
      );
    }
  }

  // Final investigation decisions
  switch (decision) {
    case 'ALERT':
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-mono font-black tracking-wider rounded-sm border-2 border-[#FF626B] bg-[#FF626B]/20 text-[#FF626B] dark:bg-[#FF626B]/25 dark:text-[#FF626B] neo-shadow-sm ${
            size === 'lg' ? 'px-3 py-1.5 text-sm' : size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
          }`}
        >
          <AlertTriangle className={size === 'lg' ? 'w-4 h-4 text-[#FF626B]' : 'w-3.5 h-3.5 text-[#FF626B]'} />
          <span>ALERT</span>
        </span>
      );
    case 'CLEAR':
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-mono font-black tracking-wider rounded-sm border-2 border-[#10B981] bg-[#10B981]/20 text-emerald-600 dark:text-[#10B981] dark:bg-[#10B981]/25 neo-shadow-sm ${
            size === 'lg' ? 'px-3 py-1.5 text-sm' : size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
          }`}
        >
          <CheckCircle2 className={size === 'lg' ? 'w-4 h-4 text-emerald-500' : 'w-3.5 h-3.5 text-emerald-500'} />
          <span>CLEAR</span>
        </span>
      );
    case 'REVIEW':
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-mono font-black tracking-wider rounded-sm border-2 border-[#FFBE55] bg-[#FFBE55]/20 text-amber-600 dark:text-[#FFBE55] dark:bg-[#FFBE55]/25 neo-shadow-sm ${
            size === 'lg' ? 'px-3 py-1.5 text-sm' : size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
          }`}
        >
          <Eye className={size === 'lg' ? 'w-4 h-4 text-amber-500' : 'w-3.5 h-3.5 text-amber-500'} />
          <span>REVIEW</span>
        </span>
      );
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-mono font-bold tracking-wider rounded-sm border-2 border-slate-600 bg-slate-800 text-slate-300 neo-shadow-sm ${
            size === 'lg' ? 'px-3 py-1.5 text-xs' : size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
          }`}
        >
          <span>PENDING</span>
        </span>
      );
  }
};
