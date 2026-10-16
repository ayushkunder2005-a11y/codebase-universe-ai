import React from 'react';
import { ImpactAnalysisResult } from '../../types';
import {
  Activity,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  X,
  ArrowRight,
  Flame
} from 'lucide-react';

interface ImpactAnalysisModalProps {
  impact: ImpactAnalysisResult | null;
  onClose: () => void;
  onHighlightBlastInUniverse: (nodeIds: string[]) => void;
  onFocusNode: (nodeId: string) => void;
}

export const ImpactAnalysisModal: React.FC<ImpactAnalysisModalProps> = ({
  impact,
  onClose,
  onHighlightBlastInUniverse,
  onFocusNode
}) => {
  if (!impact) return null;

  const blastIds = impact.total_blast_radius.map(n => n.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="glass-panel w-full max-w-3xl max-h-[85vh] rounded-2xl flex flex-col overflow-hidden border border-slate-700/80 shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-rose-500/20 text-rose-400 rounded-xl">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                <span>Change Impact & Blast Radius</span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-sky-400 font-mono font-normal">
                  {impact.target_name}
                </span>
              </h2>
              <p className="text-xs text-slate-400">Predicted ripple effects across downstream modules and test suites</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {/* Assessment Banner */}
          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-300">Architectural Blast Assessment</span>
              <span className={`px-2.5 py-0.5 rounded font-bold uppercase text-[11px] ${
                impact.risk_assessment.includes('HIGH') || impact.risk_assessment.includes('CRITICAL')
                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                  : 'bg-amber-950 text-amber-300 border border-amber-800'
              }`}>
                {impact.risk_assessment}
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">{impact.potential_impact_summary}</p>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-xl">
              <span className="text-slate-400 text-[10px] block uppercase font-medium">Downstream Blast Radius</span>
              <span className="text-2xl font-bold text-rose-400">{impact.total_blast_radius.length}</span>
              <span className="text-[10px] text-slate-500 block">affected components</span>
            </div>
            <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-xl">
              <span className="text-slate-400 text-[10px] block uppercase font-medium">Direct Dependencies</span>
              <span className="text-2xl font-bold text-purple-300">{impact.direct_dependencies.length}</span>
              <span className="text-[10px] text-slate-500 block">required modules</span>
            </div>
            <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-xl">
              <span className="text-slate-400 text-[10px] block uppercase font-medium">Associated Test Suites</span>
              <span className="text-2xl font-bold text-emerald-400">{impact.related_tests.length}</span>
              <span className="text-[10px] text-slate-500 block">regression targets</span>
            </div>
          </div>

          {/* Suggested Test Execution */}
          {impact.suggested_test_commands.length > 0 && (
            <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-xs">
                <Terminal className="w-4 h-4" />
                <span>Recommended Verification Commands</span>
              </div>
              <div className="space-y-1.5 font-mono text-[11px]">
                {impact.suggested_test_commands.map((cmd, idx) => (
                  <div key={idx} className="p-2 bg-slate-900 rounded border border-slate-800 text-slate-200 select-all">
                    {cmd}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Downstream Blast Radius List */}
          <div className="space-y-2">
            <h3 className="font-semibold text-white text-xs flex items-center space-x-1.5">
              <Layers className="w-4 h-4 text-rose-400" />
              <span>Downstream Affected Components ({impact.total_blast_radius.length})</span>
            </h3>
            {impact.total_blast_radius.length > 0 ? (
              <div className="max-h-48 overflow-y-auto space-y-1 bg-slate-900/40 p-2 rounded-xl border border-slate-800">
                {impact.total_blast_radius.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded bg-slate-900/80 hover:bg-slate-800 border border-slate-800/60 flex items-center justify-between"
                  >
                    <div className="truncate">
                      <span className="font-semibold text-slate-200">{item.name}</span>
                      {item.file_path && <span className="text-slate-500 text-[11px] ml-2 font-mono">{item.file_path}</span>}
                    </div>
                    <button
                      onClick={() => {
                        onFocusNode(item.id);
                        onClose();
                      }}
                      className="text-sky-400 hover:text-sky-300 px-2 py-0.5 rounded bg-slate-800 text-[10px]"
                    >
                      Inspect
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-slate-500 italic block">No downstream dependents affected. Safe isolated change.</span>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <button
            onClick={() => {
              onHighlightBlastInUniverse([impact.target_node_id, ...blastIds]);
              onClose();
            }}
            className="flex items-center space-x-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold text-xs shadow-lg transition-all"
          >
            <Flame className="w-4 h-4" />
            <span>Highlight Blast Radius in 3D Universe</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
