import React, { useState, useEffect, useCallback } from 'react';
import { api } from './api/client';
import {
  Project,
  CodeGraph,
  GraphNode,
  AnalysisReport,
  ImpactAnalysisResult,
  ChatCitation
} from './types';
import { Navbar } from './components/ui/Navbar';
import { ProjectTree } from './components/sidebar/ProjectTree';
import { UniverseCanvas } from './components/universe/UniverseCanvas';
import { Graph2DView } from './components/graph2d/Graph2DView';
import { NodeInspector } from './components/inspector/NodeInspector';
import { AssistantPanel } from './components/chat/AssistantPanel';
import { RiskDashboard } from './components/quality/RiskDashboard';
import { ImpactAnalysisModal } from './components/quality/ImpactAnalysisModal';
import { RefactorDiffModal } from './components/refactor/RefactorDiffModal';
import { ImportModal } from './components/sidebar/ImportModal';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Loader2, AlertCircle, Compass } from 'lucide-react';

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [graph, setGraph] = useState<CodeGraph | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisReport | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  // View & UI states
  const [activeView, setActiveView] = useState<'3d' | '2d'>('3d');
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [blastRadiusIds, setBlastRadiusIds] = useState<Set<string>>(new Set());

  // Modals
  const [showImportModal, setShowImportModal] = useState(false);
  const [showRiskDashboard, setShowRiskDashboard] = useState(false);
  const [impactResult, setImpactResult] = useState<ImpactAnalysisResult | null>(null);
  const [refactorTargetNode, setRefactorTargetNode] = useState<GraphNode | null>(null);
  const [assistantInitialPrompt, setAssistantInitialPrompt] = useState<string | undefined>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load projects list on mount
  const refreshProjects = useCallback(async () => {
    try {
      const projs = await api.listProjects();
      setProjects(projs);
      if (projs.length > 0 && !activeProject) {
        setActiveProject(projs[0]);
      } else if (projs.length === 0) {
        // Auto load sample python
        api.loadSample('python').then(sample => {
          setProjects([sample]);
          setActiveProject(sample);
        }).catch(() => {});
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect to backend');
    } finally {
      setLoading(false);
    }
  }, [activeProject]);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  // Load Graph & Analysis when activeProject or filter changes
  useEffect(() => {
    if (!activeProject) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setSelectedNode(null);
    setBlastRadiusIds(new Set());

    const params: { node_types?: string; languages?: string } = {};
    if (filterType === 'file') params.node_types = 'file,directory';
    else if (filterType === 'class') params.node_types = 'class,file,directory';
    else if (filterType === 'function') params.node_types = 'function,file,directory';
    else if (filterType === 'python') params.languages = 'python';
    else if (filterType === 'typescript') params.languages = 'typescript';

    Promise.allSettled([
      api.getGraph(activeProject.id, params),
      api.getAnalysis(activeProject.id)
    ]).then(([graphResult, analysisResult]) => {
      if (!isMounted) return;

      if (graphResult.status === 'fulfilled') {
        setGraph(graphResult.value);
      } else {
        setGraph(null);
      }

      if (analysisResult.status === 'fulfilled') {
        setAnalysis(analysisResult.value);
      } else {
        setAnalysis(null);
      }

      setLoading(false);
    });

    return () => { isMounted = false; };
  }, [activeProject, filterType]);

  // Handle Citation click in Assistant
  const handleSelectCitation = (citation: ChatCitation) => {
    if (!graph) return;
    const match = graph.nodes.find(n => n.file_path === citation.file_path);
    if (match) {
      setSelectedNode(match);
    }
  };

  // Trigger Change Impact Analysis
  const handleTriggerImpact = async (node: GraphNode) => {
    if (!activeProject) return;
    try {
      const res = await api.getImpactAnalysis(activeProject.id, node.id);
      setImpactResult(res);
    } catch (err: any) {
      alert(`Impact analysis failed: ${err.message}`);
    }
  };

  // Re-index project
  const handleReindex = async () => {
    if (!activeProject) return;
    try {
      await api.reindexProject(activeProject.id);
      alert('Reindexing triggered. The universe graph will update shortly.');
      refreshProjects();
    } catch (err: any) {
      alert(`Reindex failed: ${err.message}`);
    }
  };

  // Delete project
  const handleDeleteProject = async () => {
    if (!activeProject || !confirm(`Delete project "${activeProject.name}"?`)) return;
    try {
      await api.deleteProject(activeProject.id);
      setActiveProject(null);
      refreshProjects();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-[#07090e] text-slate-200">
      {/* Top Navbar */}
      <Navbar
        activeProject={activeProject}
        activeView={activeView}
        isAssistantOpen={isAssistantOpen}
        filterType={filterType}
        onToggleView={setActiveView}
        onToggleAssistant={() => setIsAssistantOpen(prev => !prev)}
        onOpenRiskDashboard={() => setShowRiskDashboard(true)}
        onChangeFilter={setFilterType}
      />

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar: Project & Tree */}
        <ProjectTree
          projects={projects}
          activeProject={activeProject}
          graph={graph}
          selectedNode={selectedNode}
          onSelectProject={setActiveProject}
          onSelectNode={setSelectedNode}
          onOpenImportModal={() => setShowImportModal(true)}
          onReindex={handleReindex}
          onDeleteProject={handleDeleteProject}
          onOpenRiskDashboard={() => setShowRiskDashboard(true)}
        />

        {/* Center: 3D Universe or 2D Architecture */}
        <main className="flex-1 relative overflow-hidden bg-[#07090e]">
          {loading ? (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center space-y-3 bg-[#07090e]/90 backdrop-blur-sm">
              <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
              <div className="text-sm font-medium text-slate-300">Rendering Codebase Universe...</div>
              <p className="text-xs text-slate-500">Calculating celestial coordinates and constellation links</p>
            </div>
          ) : error ? (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center space-y-4 p-6 text-center">
              <AlertCircle className="w-10 h-10 text-rose-500" />
              <h3 className="text-base font-bold text-white">Universe Initialization Required</h3>
              <p className="text-xs text-slate-400 max-w-md">{error}</p>
              <button
                onClick={() => setShowImportModal(true)}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-lg text-xs"
              >
                Import Repository
              </button>
            </div>
          ) : activeView === '3d' ? (
            <ErrorBoundary fallbackTitle="3D Celestial Universe">
              <UniverseCanvas
                graph={graph}
                selectedNode={selectedNode}
                blastRadiusIds={blastRadiusIds}
                onSelectNode={setSelectedNode}
              />
            </ErrorBoundary>
          ) : (
            <Graph2DView
              graph={graph}
              selectedNode={selectedNode}
              blastRadiusIds={blastRadiusIds}
              onSelectNode={setSelectedNode}
            />
          )}

          {/* Blast Radius Active Banner */}
          {blastRadiusIds.size > 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 glass-panel px-4 py-2 rounded-xl border border-rose-500/50 flex items-center space-x-3 shadow-xl">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></div>
              <span className="text-xs text-rose-200">
                Visualizing Downstream Blast Radius: <strong>{blastRadiusIds.size} components affected</strong>
              </span>
              <button
                onClick={() => setBlastRadiusIds(new Set())}
                className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-rose-950 text-rose-300 hover:bg-rose-900 border border-rose-700"
              >
                Clear
              </button>
            </div>
          )}
        </main>

        {/* Right Drawer: Contextual Node Inspector */}
        {selectedNode && activeProject && (
          <NodeInspector
            projectId={activeProject.id}
            node={selectedNode}
            graph={graph}
            onClose={() => setSelectedNode(null)}
            onSelectNode={setSelectedNode}
            onTriggerImpact={handleTriggerImpact}
            onTriggerRefactor={node => setRefactorTargetNode(node)}
            onAskAboutNode={node => {
              setAssistantInitialPrompt(`Explain the role, architecture, and callers of ${node.name} (${node.file_path || node.id})`);
              setIsAssistantOpen(true);
            }}
          />
        )}

        {/* Right Drawer: AI Assistant */}
        {isAssistantOpen && activeProject && (
          <AssistantPanel
            projectId={activeProject.id}
            selectedNode={selectedNode}
            initialPrompt={assistantInitialPrompt}
            onClose={() => {
              setIsAssistantOpen(false);
              setAssistantInitialPrompt(undefined);
            }}
            onSelectCitation={handleSelectCitation}
          />
        )}
      </div>

      {/* Modals */}
      {showImportModal && (
        <ImportModal
          onClose={() => setShowImportModal(false)}
          onProjectLoaded={proj => {
            setActiveProject(proj);
            refreshProjects();
          }}
        />
      )}

      {showRiskDashboard && (
        <RiskDashboard
          report={analysis}
          onClose={() => setShowRiskDashboard(false)}
          onFocusNode={nodeIdOrPath => {
            if (!graph) return;
            const target = graph.nodes.find(n => n.id === nodeIdOrPath || n.file_path === nodeIdOrPath);
            if (target) setSelectedNode(target);
          }}
        />
      )}

      {impactResult && (
        <ImpactAnalysisModal
          impact={impactResult}
          onClose={() => setImpactResult(null)}
          onHighlightBlastInUniverse={nodeIds => setBlastRadiusIds(new Set(nodeIds))}
          onFocusNode={nid => {
            if (!graph) return;
            const match = graph.nodes.find(n => n.id === nid);
            if (match) setSelectedNode(match);
          }}
        />
      )}

      {refactorTargetNode && activeProject && (
        <RefactorDiffModal
          projectId={activeProject.id}
          node={refactorTargetNode}
          onClose={() => setRefactorTargetNode(null)}
          onSuccess={() => {
            refreshProjects();
          }}
        />
      )}
    </div>
  );
}

export default App;
