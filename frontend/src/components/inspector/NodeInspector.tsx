import React, { useState } from 'react';
import { GraphNode, CodeGraph, NodeType } from '../../types';
import { CodeViewer } from './CodeViewer';
import {
  FileCode,
  Folder,
  Box,
  Terminal,
  Activity,
  Layers,
  Sparkles,
  ArrowRight,
  X,
  ShieldAlert,
  GitPullRequest
} from 'lucide-react';

interface NodeInspectorProps {
  projectId: string;
  node: GraphNode | null;
  graph: CodeGraph | null;
  onClose: () => void;
  onSelectNode: (node: GraphNode) => void;
  onTriggerImpact: (node: GraphNode) => void;
  onTriggerRefactor: (node: GraphNode) => void;
  onAskAboutNode: (node: GraphNode) => void;
}

export const NodeInspector: React.FC<NodeInspectorProps> = ({
  projectId,
  node,
  graph,
  onClose,
  onSelectNode,
  onTriggerImpact,
  onTriggerRefactor,
  onAskAboutNode
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'code'>('overview');

  if (!node) return null;

  const nodeMap = new Map<string, GraphNode>();
  if (graph) {
    graph.nodes.forEach(n => nodeMap.set(n.id, n));
  }

  // Find incoming & outgoing nodes
  const incomingNodes: GraphNode[] = [];
  const outgoingNodes: GraphNode[] = [];

  if (graph) {
    graph.edges.forEach(e => {
      if (e.target === node.id) {
        const src = nodeMap.get(e.source);
        if (src) incomingNodes.push(src);
      }
      if (e.source === node.id) {
        const tgt = nodeMap.get(e.target);
        if (tgt) outgoingNodes.push(tgt);
      }
    });
  }

  const getNodeIcon = (type: NodeType) => {
    switch (type) {
      case 'directory': return <Folder className="w-5 h-5 text-indigo-400" />;
      case 'file': return <FileCode className="w-5 h-5 text-sky-400" />;
      case 'class': return <Box className="w-5 h-5 text-purple-400" />;
      case 'function': return <Terminal className="w-5 h-5 text-emerald-400" />;
    }
  };

  return (
    <div className="w-96 glass-panel border-l border-slate-800 flex flex-col h-full z-30 transition-all select-text shadow-2xl">
      {/* Header */}
      <div className="p-4 border-b border-slate-800/80 flex items-start justify-between bg-slate-900/40">
        <div className="flex items-start space-x-3 truncate">
          <div className="p-2 rounded-lg bg-slate-800/60 shrink-0">
            {getNodeIcon(node.type)}
          </div>
          <div className="truncate">
            <h2 className="text-base font-semibold text-white truncate">{node.name}</h2>
            <div className="flex items-center space-x-2 mt-1">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                {node.type}
              </span>
              {node.language && (
                <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-sky-950/70 text-sky-300 border border-sky-800/50">
                  {node.language}
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800/60 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 text-xs bg-slate-950/50 select-none">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-2.5 font-medium transition-colors border-b-2 ${
            activeTab === 'overview'
              ? 'border-sky-400 text-sky-400 bg-sky-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Overview & Relations
        </button>
        {node.file_path && (
          <button
            onClick={() => setActiveTab('code')}
            className={`flex-1 py-2.5 font-medium transition-colors border-b-2 ${
              activeTab === 'code'
                ? 'border-sky-400 text-sky-400 bg-sky-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Source Code
          </button>
        )}
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'overview' ? (
          <>
            {/* File Path */}
            {node.file_path && (
              <div className="text-xs bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60 font-mono text-slate-300 break-all">
                <span className="text-slate-500 block text-[10px] uppercase font-sans font-semibold mb-1">Path</span>
                {node.file_path}
                {node.line_start && (
                  <span className="text-sky-400 ml-1">:{node.line_start}-{node.line_end}</span>
                )}
              </div>
            )}

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800/60">
                <span className="text-slate-400 text-[11px] block">Lines of Code</span>
                <span className="text-lg font-bold text-sky-300">{node.metrics?.loc ?? 0}</span>
              </div>
              <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800/60">
                <span className="text-slate-400 text-[11px] block">Complexity</span>
                <span className="text-lg font-bold text-amber-300">{node.metrics?.complexity ?? 1}</span>
              </div>
              <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800/60">
                <span className="text-slate-400 text-[11px] block">In-Degree (Used by)</span>
                <span className="text-lg font-bold text-emerald-300">{node.metrics?.in_degree ?? 0}</span>
              </div>
              <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800/60">
                <span className="text-slate-400 text-[11px] block">Out-Degree (Uses)</span>
                <span className="text-lg font-bold text-purple-300">{node.metrics?.out_degree ?? 0}</span>
              </div>
            </div>

            {/* Risk Factor Banner */}
            {(node.metrics?.risk_score ?? 0) > 35 && (
              <div className="p-3 bg-rose-950/20 border border-rose-800/40 rounded-lg text-xs flex items-center space-x-2 text-rose-300">
                <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
                <div>
                  <div className="font-semibold">Elevated Architectural Risk: {node.metrics?.risk_score ?? 0}/100</div>
                  <div className="text-[11px] text-rose-400/80 mt-0.5">High coupling or control flow complexity. Review impact before changing.</div>
                </div>
              </div>
            )}

            {/* Docstring */}
            {node.metadata?.docstring && (
              <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800 text-xs">
                <span className="text-slate-500 block text-[10px] uppercase font-semibold mb-1">Docstring</span>
                <p className="text-slate-300 italic whitespace-pre-line text-[11px]">{node.metadata.docstring}</p>
              </div>
            )}

            {/* Function Parameters */}
            {node.metadata?.parameters && node.metadata.parameters.length > 0 && (
              <div className="text-xs">
                <span className="text-slate-500 block text-[10px] uppercase font-semibold mb-1.5">Parameters</span>
                <div className="flex flex-wrap gap-1">
                  {node.metadata.parameters.map((p: string, idx: number) => (
                    <span key={idx} className="px-2 py-0.5 bg-slate-800 rounded font-mono text-slate-300 text-[11px]">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Relations: Incoming */}
            <div className="space-y-1.5 text-xs">
              <span className="text-slate-400 text-[11px] font-semibold flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                <span>Referenced By ({incomingNodes.length})</span>
              </span>
              {incomingNodes.length > 0 ? (
                <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                  {incomingNodes.map(inNode => (
                    <button
                      key={inNode.id}
                      onClick={() => onSelectNode(inNode)}
                      className="w-full text-left p-1.5 rounded bg-slate-900/60 hover:bg-slate-800 border border-slate-800/50 flex items-center justify-between text-slate-300 hover:text-white transition-colors"
                    >
                      <span className="truncate font-mono text-[11px]">{inNode.name}</span>
                      <ArrowRight className="w-3 h-3 text-slate-500" />
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-slate-500 text-[11px] italic block">No incoming references</span>
              )}
            </div>

            {/* Relations: Outgoing */}
            <div className="space-y-1.5 text-xs">
              <span className="text-slate-400 text-[11px] font-semibold flex items-center space-x-1.5">
                <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                <span>Depends On ({outgoingNodes.length})</span>
              </span>
              {outgoingNodes.length > 0 ? (
                <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                  {outgoingNodes.map(outNode => (
                    <button
                      key={outNode.id}
                      onClick={() => onSelectNode(outNode)}
                      className="w-full text-left p-1.5 rounded bg-slate-900/60 hover:bg-slate-800 border border-slate-800/50 flex items-center justify-between text-slate-300 hover:text-white transition-colors"
                    >
                      <span className="truncate font-mono text-[11px]">{outNode.name}</span>
                      <ArrowRight className="w-3 h-3 text-slate-500" />
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-slate-500 text-[11px] italic block">No outgoing dependencies</span>
              )}
            </div>
          </>
        ) : (
          /* Code View Tab */
          node.file_path && (
            <CodeViewer
              projectId={projectId}
              filePath={node.file_path}
              highlightStart={node.line_start}
              highlightEnd={node.line_end}
            />
          )
        )}
      </div>

      {/* Action Toolbar */}
      <div className="p-3 border-t border-slate-800 bg-slate-900/60 space-y-2 select-none">
        <button
          onClick={() => onTriggerImpact(node)}
          className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-gradient-to-r from-rose-600/80 to-rose-700/80 hover:from-rose-600 hover:to-rose-700 text-white rounded-lg text-xs font-semibold shadow transition-all"
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Analyze Change Blast Radius</span>
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onTriggerRefactor(node)}
            className="flex items-center justify-center space-x-1.5 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
          >
            <GitPullRequest className="w-3.5 h-3.5 text-purple-400" />
            <span>Refactor</span>
          </button>
          <button
            onClick={() => onAskAboutNode(node)}
            className="flex items-center justify-center space-x-1.5 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span>Ask AI</span>
          </button>
        </div>
      </div>
    </div>
  );
};
