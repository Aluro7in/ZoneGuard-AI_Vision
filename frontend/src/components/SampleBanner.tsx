import React from 'react';
import { Info, X } from 'lucide-react';

interface SampleBannerProps {
  onDismiss?: () => void;
  label?: string;
}

export const SampleBanner: React.FC<SampleBannerProps> = ({
  onDismiss,
  label = 'Isolated reference dataset for UI demonstration — not a live backend analysis run.',
}) => {
  return (
    <div className="bg-amber-950/40 border-b border-amber-500/30 px-4 py-2.5 text-xs text-amber-200">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="font-semibold text-amber-300 uppercase tracking-wider font-mono">
            Sample Walkthrough Mode:
          </span>
          <span className="text-amber-200/90">{label}</span>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-amber-300 hover:text-amber-100 p-1 transition-colors"
            title="Exit sample walkthrough"
            aria-label="Dismiss sample banner"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
