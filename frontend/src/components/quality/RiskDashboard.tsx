import React, { useState } from 'react';
import { AnalysisReport, AnalysisFinding, FindingSeverity } from '../../types';
import {
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Info,
  RefreshCw,
  Zap,
  ArrowRight,
  X,
  FileCode,
  Layers
} from 'lucide-react';

interface RiskDashboardProps {
  report: AnalysisReport | null;
  onClose: () => void;
  onFocusNode: (nodeIdOrPath: string) => void;
}

export const RiskDashboard: React.FC<RiskDashboardProps> = ({
  report,
  onClose,
  onFocusNode
}) => {
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');

  if (!report) return null;

  const filteredFindings = selectedSeverity === 'all'
    ? report.findings
    : report.findings.filter(f => f.severity === selectedSeverity);

  const getSeverityBadge = (sev: FindingSeverity) => {
    switch (sev) {
      case 'critical':
        return <span className="px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800 text-[10px] font-bold uppercase flex items-center space-x-1"><AlertOctagon className="w-3 h-3"/><span>Critical</span></span>;
      case 'error':
        return <span className="px-2 py-0.5 rounded bg-rose-900/60 text-rose-300 border border-rose-700 text-[10px] font-bold uppercase flex items-center space-x-1"><AlertOctagon className="w-3 h-3"/><span>Error</span></span>;
      case 'warning':
        return <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800 text-[10px] font-bold uppercase flex items-center space-x-1"><AlertTriangle className="w-3 h-3"/><span>Warning</span></span>;
      case 'info':
        return <span className="px-2 py-0.5 rounded bg-sky-950/80 text-sky-300 border border-sky-800 text-[10px] font-bold uppercase flex items-center space-x-1"><Info className="w-3 h-3"/><span>Info</span></span>;
    }
  };

  const healthColor = report.overall_health_score >= 80
    ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
    : report.overall_health_score >= 60
    ? 'text-amber-400 border-amber-500/40 bg-amber-500/10'
    : 'text-rose-400 border-rose-500/40 bg-rose-500/10';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="glass-panel w-full max-w-4xl max-h-[88vh] rounded-2xl flex flex-col overflow-hidden border border-slate-700/80 shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-sky-500/20 text-sky-400 rounded-xl">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Repository Health & Risk Analysis</h2>
              <p className="text-xs text-slate-400">Evidence-based static analysis heuristics & architectural risk scoring</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          {/* Top Score & Metrics Banner */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className={`p-4 rounded-xl border flex flex-col items-center justify-center text-center ${healthColor}`}>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Architecture Health</span>
              <span className="text-4xl font-extrabold">{report.overall_health_score}</span>
              <span className="text-[10px] text-slate-400 mt-1">out of 100</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
              <span className="text-slate-400 text-[11px] font-medium flex items-center space-x-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-rose-400" />
                <span>Circular Dependency Loops</span>
              </span>
              <span className="text-2xl font-bold text-rose-400">{report.circular_dependencies.length}</span>
              <span className="text-[10px] text-slate-500">Must be decoupled</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
              <span className="text-slate-400 text-[11px] font-medium flex items-center space-x-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Total Quality Findings</span>
              </span>
              <span className="text-2xl font-bold text-amber-300">{report.findings.length}</span>
              <span className="text-[10px] text-slate-500">Complexity, coupling & unused</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
              <span className="text-slate-400 text-[11px] font-medium flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                <span>Elevated Risk Components</span>
              </span>
              <span className="text-2xl font-bold text-sky-300">{report.top_risks.length}</span>
              <span className="text-[10px] text-slate-500">High coupling or large blast radius</span>
            </div>
          </div>

          {/* Circular Dependencies Section */}
          {report.circular_dependencies.length > 0 && (
            <div className="space-y-3 bg-rose-950/20 border border-rose-900/40 p-4 rounded-xl">
              <div className="flex items-center space-x-2 text-rose-300 font-semibold text-sm">
                <RefreshCw className="w-4 h-4 text-rose-400 animate-spin" style={{ animationDuration: '6s' }} />
                <span>Circular Dependency Cycles Detected ({report.circular_dependencies.length})</span>
              </div>
              <div className="space-y-2">
                {report.circular_dependencies.map((cycle, idx) => (
                  <div key={idx} className="p-2.5 bg-black/40 rounded-lg border border-rose-900/30 flex items-center flex-wrap gap-2 text-slate-300 font-mono text-[11px]">
                    {cycle.map((file, fIdx) => (
                      <React.Fragment key={fIdx}>
                        <button
                          onClick={() => {
                            onFocusNode(file);
                            onClose();
                          }}
                          className="hover:text-sky-300 hover:underline px-1.5 py-0.5 rounded bg-slate-800/80 text-rose-200"
                        >
                          {file}
                        </button>
                        {fIdx < cycle.length - 1 && <span className="text-rose-500 font-sans font-bold">→</span>}
                      </React.Fragment>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Component Risks */}
          {report.top_risks.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-white text-sm flex items-center space-x-2">
                <Layers className="w-4 h-4 text-sky-400" />
                <span>Top Architectural Risk Components</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {report.top_risks.slice(0, 4).map(risk => (
                  <div key={risk.node_id} className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white truncate max-w-[200px]">{risk.name}</span>
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${risk.risk_score > 50 ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-amber-950 text-amber-300 border border-amber-800'}`}>
                        Risk {risk.risk_score}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">{risk.file_path}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {risk.factors.map((factor, idx) => (
                        <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                          {factor}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        onFocusNode(risk.node_id);
                        onClose();
                      }}
                      className="w-full mt-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] transition-colors"
                    >
                      Locate in Universe
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Findings Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white text-sm">Static Analysis Findings</h3>
              <div className="flex items-center space-x-1.5">
                {['all', 'critical', 'error', 'warning', 'info'].map(sev => (
                  <button
                    key={sev}
                    onClick={() => setSelectedSeverity(sev)}
                    className={`px-2 py-1 rounded text-[10px] uppercase font-bold transition-colors ${
                      selectedSeverity === sev
                        ? 'bg-sky-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {filteredFindings.map(finding => (
                <div
                  key={finding.id}
                  className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-1.5 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {getSeverityBadge(finding.severity)}
                      <span className="font-semibold text-white">{finding.title}</span>
                    </div>
                    {finding.file_path && (
                      <button
                        onClick={() => {
                          onFocusNode(finding.affected_nodes[0] || finding.file_path || '');
                          onClose();
                        }}
                        className="text-[11px] font-mono text-sky-400 hover:underline flex items-center space-x-1"
                      >
                        <span>{finding.file_path}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[11px]">{finding.description}</p>
                  {finding.recommendation && (
                    <div className="text-[11px] text-emerald-400 bg-emerald-950/20 px-2.5 py-1 rounded border border-emerald-900/40">
                      <strong>Recommendation:</strong> {finding.recommendation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
