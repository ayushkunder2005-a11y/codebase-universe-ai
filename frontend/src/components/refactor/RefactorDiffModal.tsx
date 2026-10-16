import React, { useState } from 'react';
import { api } from '../../api/client';
import { GraphNode, RefactorProposal, ApplyPatchResult } from '../../types';
import {
  GitPullRequest,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Download,
  X,
  Play
} from 'lucide-react';

interface RefactorDiffModalProps {
  projectId: string;
  node: GraphNode;
  onClose: () => void;
  onSuccess: () => void;
}

const PRESET_INSTRUCTIONS = [
  "Break down complex logic into clean helper functions",
  "Decouple direct dependencies using interface abstractions",
  "Modernize type annotations and comprehensive docstrings",
  "Clean up unused imports and standardize formatting"
];

export const RefactorDiffModal: React.FC<RefactorDiffModalProps> = ({
  projectId,
  node,
  onClose,
  onSuccess
}) => {
  const [instruction, setInstruction] = useState(PRESET_INSTRUCTIONS[0]);
  const [runTests, setRunTests] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [proposal, setProposal] = useState<RefactorProposal | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyPatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateProposal = async () => {
    if (!node.file_path || !instruction.trim() || loading) return;
    setLoading(true);
    setError(null);
    setProposal(null);
    setApplyResult(null);

    try {
      const res = await api.proposeRefactor(
        projectId,
        node.file_path,
        instruction,
        runTests
      );
      setProposal(res);
    } catch (err: any) {
      setError(err.message || 'Failed to generate refactoring proposal');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPatch = async () => {
    if (!proposal || applying) return;
    setApplying(true);
    setError(null);

    try {
      const res = await api.applyRefactorPatch(projectId, proposal.id, true);
      setApplyResult(res);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to apply patch');
    } finally {
      setApplying(false);
    }
  };

  const handleDownloadPatch = () => {
    if (!proposal) return;
    const blob = new Blob([proposal.unified_diff], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `refactor_${node.name}.patch`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="glass-panel w-full max-w-4xl max-h-[90vh] rounded-2xl flex flex-col overflow-hidden border border-slate-700/80 shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-500/20 text-purple-400 rounded-xl">
              <GitPullRequest className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                <span>AI-Assisted Architectural Refactoring</span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-sky-400 font-mono">
                  {node.file_path}
                </span>
              </h2>
              <p className="text-xs text-slate-400">Generate, review unified diffs, and apply patches safely to isolated branches</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {/* Controls Form */}
          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3">
            <label className="block text-xs font-semibold text-slate-300">
              Refactoring Objective / Instruction
            </label>
            <input
              type="text"
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              placeholder="e.g. Extract helper functions, decouple dependencies, add typing..."
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
            <div className="flex flex-wrap gap-1.5">
              {PRESET_INSTRUCTIONS.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => setInstruction(preset)}
                  className="text-[10px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  {preset}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center space-x-2 text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={runTests}
                  onChange={e => setRunTests(e.target.checked)}
                  className="rounded border-slate-700 text-purple-600 focus:ring-0"
                />
                <span>Run automated test suite validation after proposal</span>
              </label>

              <button
                onClick={handleGenerateProposal}
                disabled={loading || !instruction.trim()}
                className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg font-semibold text-xs shadow-md transition-all disabled:opacity-40"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>{loading ? 'Synthesizing Proposal...' : 'Generate Refactor Proposal'}</span>
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-950/30 border border-rose-800/40 rounded-xl text-rose-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {applyResult && (
            <div className="p-4 bg-emerald-950/30 border border-emerald-800/40 rounded-xl text-emerald-300 space-y-1">
              <div className="flex items-center space-x-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Patch Applied Successfully!</span>
              </div>
              <p className="text-[11px] text-emerald-400/90">{applyResult.message}</p>
              {applyResult.git_branch && (
                <div className="text-[11px] font-mono text-white mt-1">
                  Dedicated Branch: <strong className="text-sky-300">{applyResult.git_branch}</strong>
                </div>
              )}
            </div>
          )}

          {/* Unified Diff Viewer */}
          {proposal && !applyResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">{proposal.title}</h3>
                  <p className="text-slate-400 text-[11px]">{proposal.explanation}</p>
                </div>
                <button
                  onClick={handleDownloadPatch}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export .patch</span>
                </button>
              </div>

              {/* Test Status Banner */}
              {proposal.test_validation_status !== 'not_run' && (
                <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-xl text-xs space-y-1">
                  <div className="flex items-center space-x-2 font-semibold">
                    <span className="text-slate-400">Test Execution:</span>
                    <span className={proposal.test_validation_status === 'passed' ? 'text-emerald-400' : 'text-amber-400'}>
                      {proposal.test_validation_status.toUpperCase()}
                    </span>
                  </div>
                  {proposal.test_output && (
                    <pre className="p-2 bg-black/50 rounded font-mono text-[10px] text-slate-300 overflow-x-auto max-h-24">
                      {proposal.test_output}
                    </pre>
                  )}
                </div>
              )}

              {/* Diff Content */}
              <div className="font-mono text-[11px] rounded-xl overflow-hidden border border-slate-800 bg-[#070b12] max-h-[380px] overflow-y-auto">
                <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-slate-400 text-[10px] font-sans font-semibold">
                  Unified Code Diff (Changes previewed before approval)
                </div>
                <div className="p-2 divide-y divide-slate-900">
                  {proposal.unified_diff ? (
                    proposal.unified_diff.split('\n').map((line, idx) => {
                      let colorClass = 'text-slate-400';
                      let bgClass = '';
                      if (line.startsWith('+') && !line.startsWith('+++')) {
                        colorClass = 'text-emerald-300';
                        bgClass = 'bg-emerald-950/30';
                      } else if (line.startsWith('-') && !line.startsWith('---')) {
                        colorClass = 'text-rose-300';
                        bgClass = 'bg-rose-950/30';
                      } else if (line.startsWith('@@')) {
                        colorClass = 'text-sky-400 font-bold';
                        bgClass = 'bg-sky-950/20';
                      }

                      return (
                        <div key={idx} className={`px-2 py-0.5 leading-4 whitespace-pre ${bgClass} ${colorClass}`}>
                          {line || ' '}
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-4 text-slate-500 italic">No modifications detected in proposal.</div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
                >
                  Reject & Cancel
                </button>
                <button
                  onClick={handleApplyPatch}
                  disabled={applying}
                  className="flex items-center space-x-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-lg transition-all disabled:opacity-50"
                >
                  {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>{applying ? 'Applying...' : 'Approve & Apply to Dedicated Git Branch'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
