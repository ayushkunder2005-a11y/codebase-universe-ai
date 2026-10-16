import React from 'react';
import { Project } from '../../types';
import {
  Globe,
  Network,
  Sparkles,
  Activity,
  Filter,
  Layers,
  Cpu
} from 'lucide-react';

interface NavbarProps {
  activeProject: Project | null;
  activeView: '3d' | '2d';
  isAssistantOpen: boolean;
  filterType: string;
  onToggleView: (view: '3d' | '2d') => void;
  onToggleAssistant: () => void;
  onOpenRiskDashboard: () => void;
  onChangeFilter: (type: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeProject,
  activeView,
  isAssistantOpen,
  filterType,
  onToggleView,
  onToggleAssistant,
  onOpenRiskDashboard,
  onChangeFilter
}) => {
  return (
    <header className="h-14 glass-panel border-b border-slate-800 px-4 flex items-center justify-between z-30 select-none">
      {/* Brand & Project Info */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-lg glow-cyan">
            <Globe className="w-5 h-5" />
          </div>
          <span className="font-bold text-sm tracking-wide bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Codebase Universe AI
          </span>
        </div>

        {activeProject && (
          <div className="hidden sm:flex items-center space-x-2 border-l border-slate-800 pl-3 text-xs text-slate-400">
            <span>Project:</span>
            <span className="text-white font-medium truncate max-w-xs">{activeProject.name}</span>
          </div>
        )}
      </div>

      {/* Middle: 3D / 2D View Switcher */}
      <div className="flex items-center space-x-1 p-1 bg-slate-950/80 rounded-xl border border-slate-800 text-xs">
        <button
          onClick={() => onToggleView('3d')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
            activeView === '3d'
              ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>3D Universe</span>
        </button>

        <button
          onClick={() => onToggleView('2d')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
            activeView === '2d'
              ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Network className="w-3.5 h-3.5" />
          <span>2D Architecture</span>
        </button>
      </div>

      {/* Right Controls: Filters, Risk Report, AI Chat */}
      <div className="flex items-center space-x-2 text-xs">
        {/* Filter Dropdown */}
        <div className="flex items-center space-x-1 bg-slate-900/80 px-2 py-1 rounded-lg border border-slate-800 text-slate-300">
          <Filter className="w-3 h-3 text-slate-500" />
          <select
            value={filterType}
            onChange={e => onChangeFilter(e.target.value)}
            className="bg-transparent border-0 text-[11px] text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="all">All Components</option>
            <option value="file">Files Only</option>
            <option value="class">Classes Only</option>
            <option value="function">Functions Only</option>
            <option value="python">Python Files</option>
            <option value="typescript">TypeScript Files</option>
          </select>
        </div>

        {/* Quality & Risks Button */}
        <button
          onClick={onOpenRiskDashboard}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-200 hover:text-white transition-colors"
        >
          <Activity className="w-3.5 h-3.5 text-rose-400" />
          <span>Risk Report</span>
        </button>

        {/* AI Assistant Button */}
        <button
          onClick={onToggleAssistant}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
            isAssistantOpen
              ? 'bg-sky-500 text-slate-950 shadow-md font-bold'
              : 'bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-sky-400'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI Assistant</span>
        </button>
      </div>
    </header>
  );
};
