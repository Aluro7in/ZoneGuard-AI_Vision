import React from 'react';
import { Shield, Plus, Sun, Moon, Sparkles } from 'lucide-react';
import { BackendHealthState } from '../types/zoneguard';
import { useTheme } from '../context/ThemeContext';

export type NavTab = 'overview' | 'new-investigation' | 'workspace' | 'copilot' | 'diagnostics';

interface NavbarProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  health: BackendHealthState | null;
  onStartNewClick: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onTabChange,
  health,
  onStartNewClick,
}) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 py-3 border-b-2 border-slate-800 dark:border-slate-800 bg-[#0B0D12]/95 dark:bg-[#0B0D12]/95 text-slate-100 sticky top-0 z-40 backdrop-blur-md">
      {/* Brand Wordmark & System Status */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => onTabChange('overview')}
          className="flex items-center gap-2.5 text-slate-100 hover:text-white transition-colors whitespace-nowrap shrink-0 text-left group"
        >
          <div className="w-8 h-8 rounded-sm bg-cyan-950 border-2 border-cyan-400 flex items-center justify-center text-cyan-400 neo-shadow-sm group-hover:translate-x-0.5 group-hover:translate-y-0.5 transition-transform">
            <Shield className="w-4 h-4 stroke-[2.4]" />
          </div>
          <span className="text-base font-black tracking-tight font-sans text-slate-100">
            ZoneGuard
          </span>
        </button>

        {/* Compact, clean status indicator (no repetitive URLs) */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-sm text-[11px] font-mono">
          <span
            className={`w-2 h-2 rounded-full ${
              health?.connected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
          <span className="text-slate-300">
            {health?.connected ? 'System Operational' : 'Offline / Checking'}
          </span>
        </div>
      </div>

      {/* Primary Navigation Links */}
      <nav className="hidden md:flex items-center gap-1 sm:gap-2 text-xs font-semibold">
        <button
          type="button"
          onClick={() => onTabChange('overview')}
          className={`px-3 py-1.5 rounded-sm transition-all whitespace-nowrap ${
            currentTab === 'overview'
              ? 'bg-slate-800 text-cyan-300 border-b-2 border-cyan-400 font-bold'
              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900'
          }`}
        >
          Overview
        </button>

        <button
          type="button"
          onClick={() => onTabChange('new-investigation')}
          className={`px-3 py-1.5 rounded-sm transition-all whitespace-nowrap ${
            currentTab === 'new-investigation'
              ? 'bg-slate-800 text-cyan-300 border-b-2 border-cyan-400 font-bold'
              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900'
          }`}
        >
          New Investigation
        </button>

        <button
          type="button"
          onClick={() => onTabChange('workspace')}
          className={`px-3 py-1.5 rounded-sm transition-all whitespace-nowrap ${
            currentTab === 'workspace'
              ? 'bg-slate-800 text-cyan-300 border-b-2 border-cyan-400 font-bold'
              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900'
          }`}
        >
          Workspace
        </button>

        <button
          type="button"
          onClick={() => onTabChange('copilot')}
          className={`px-3 py-1.5 rounded-sm transition-all whitespace-nowrap flex items-center gap-1.5 ${
            currentTab === 'copilot'
              ? 'bg-violet-950/80 text-violet-300 border-b-2 border-violet-400 font-bold'
              : 'text-violet-400/90 hover:text-violet-300 hover:bg-slate-900'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-violet-400" />
          <span>AI Copilot</span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange('diagnostics')}
          className={`px-3 py-1.5 rounded-sm transition-all whitespace-nowrap ${
            currentTab === 'diagnostics'
              ? 'bg-slate-800 text-cyan-300 border-b-2 border-cyan-400 font-bold'
              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900'
          }`}
        >
          Diagnostics
        </button>
      </nav>

      {/* Controls: Theme Toggle & Primary CTA */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="p-2 rounded-sm border-2 border-slate-700 hover:border-slate-500 bg-slate-900 text-slate-300 hover:text-white transition-colors neo-shadow-sm"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-cyan-400" />
          )}
        </button>

        <button
          type="button"
          onClick={onStartNewClick}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-sm transition-all whitespace-nowrap shrink-0 border-2 border-slate-900 neo-shadow-sm active:translate-x-0.5 active:translate-y-0.5"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>New Investigation</span>
        </button>
      </div>
    </header>
  );
};
