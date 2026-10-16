import React, { useState, useMemo } from 'react';
import { Project, CodeGraph, GraphNode } from '../../types';
import {
  Folder,
  FolderOpen,
  FileCode,
  Box,
  Terminal,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Activity,
  Layers,
  ChevronRight,
  ChevronDown,
  Database
} from 'lucide-react';

interface ProjectTreeProps {
  projects: Project[];
  activeProject: Project | null;
  graph: CodeGraph | null;
  selectedNode: GraphNode | null;
  onSelectProject: (p: Project) => void;
  onSelectNode: (node: GraphNode) => void;
  onOpenImportModal: () => void;
  onReindex: () => void;
  onDeleteProject: () => void;
  onOpenRiskDashboard: () => void;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'dir' | 'file';
  node?: GraphNode;
  children: TreeNode[];
}

export const ProjectTree: React.FC<ProjectTreeProps> = ({
  projects,
  activeProject,
  graph,
  selectedNode,
  onSelectProject,
  onSelectNode,
  onOpenImportModal,
  onReindex,
  onDeleteProject,
  onOpenRiskDashboard
}) => {
  const [search, setSearch] = useState('');
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());

  const toggleDir = (path: string) => {
    setCollapsedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  // Build tree structure from graph file nodes
  const treeData = useMemo(() => {
    if (!graph) return [];

    const root: TreeNode = { name: 'root', path: '', type: 'dir', children: [] };
    const fileNodes = graph.nodes.filter(n => n.type === 'file' && n.file_path);

    fileNodes.forEach(n => {
      const parts = (n.file_path || '').split('/');
      let curr = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isFile = i === parts.length - 1;
        const currentPath = parts.slice(0, i + 1).join('/');

        let found = curr.children.find(c => c.name === part);
        if (!found) {
          found = {
            name: part,
            path: currentPath,
            type: isFile ? 'file' : 'dir',
            node: isFile ? n : undefined,
            children: []
          };
          curr.children.push(found);
        }
        curr = found;
      }
    });

    // Sort: directories first, then alphabetical
    const sortTree = (node: TreeNode) => {
      node.children.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      node.children.forEach(sortTree);
    };

    sortTree(root);
    return root.children;
  }, [graph]);

  // Render tree node recursive
  const renderTreeNode = (item: TreeNode, depth: number = 0) => {
    const isCollapsed = collapsedDirs.has(item.path);
    const isSelected = item.node && selectedNode?.id === item.node.id;

    if (search.trim()) {
      const match = item.name.toLowerCase().includes(search.toLowerCase());
      const childMatch = item.children.some(c => c.name.toLowerCase().includes(search.toLowerCase()));
      if (!match && !childMatch) return null;
    }

    if (item.type === 'dir') {
      return (
        <div key={item.path} className="select-none">
          <div
            onClick={() => toggleDir(item.path)}
            style={{ paddingLeft: `${depth * 14 + 10}px` }}
            className="flex items-center space-x-1.5 py-1 text-xs text-slate-300 hover:text-white hover:bg-slate-800/50 rounded cursor-pointer transition-colors"
          >
            {isCollapsed ? (
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            )}
            {isCollapsed ? (
              <Folder className="w-4 h-4 text-indigo-400 shrink-0" />
            ) : (
              <FolderOpen className="w-4 h-4 text-indigo-300 shrink-0" />
            )}
            <span className="truncate">{item.name}</span>
          </div>

          {!isCollapsed && (
            <div>
              {item.children.map(child => renderTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        key={item.path}
        onClick={() => item.node && onSelectNode(item.node)}
        style={{ paddingLeft: `${depth * 14 + 18}px` }}
        className={`flex items-center space-x-1.5 py-1 text-xs rounded cursor-pointer transition-colors ${
          isSelected
            ? 'bg-sky-500/20 text-sky-300 font-semibold border-l-2 border-sky-400'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
        }`}
      >
        <FileCode className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-sky-400' : 'text-slate-500'}`} />
        <span className="truncate">{item.name}</span>
      </div>
    );
  };

  return (
    <div className="w-72 glass-panel border-r border-slate-800 flex flex-col h-full z-20 select-none">
      {/* Top Project Selector */}
      <div className="p-3 border-b border-slate-800/80 bg-slate-900/60 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center space-x-1">
            <Database className="w-3 h-3 text-sky-400" />
            <span>Active Repository</span>
          </span>
          <button
            onClick={onOpenImportModal}
            className="flex items-center space-x-1 text-[11px] text-sky-400 hover:text-sky-300 transition-colors"
            title="Import Repository"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Import</span>
          </button>
        </div>

        <select
          value={activeProject?.id || ''}
          onChange={e => {
            const p = projects.find(proj => proj.id === e.target.value);
            if (p) onSelectProject(p);
          }}
          className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors truncate"
        >
          {projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {activeProject && (
          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
            <span className="flex items-center space-x-1.5">
              <span className={`w-2 h-2 rounded-full ${activeProject.status === 'ready' ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'}`} />
              <span className="capitalize">{activeProject.status}</span>
            </span>
            <div className="flex items-center space-x-2">
              <button
                onClick={onReindex}
                className="hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
                title="Re-index AST & Build Graph"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onDeleteProject}
                className="hover:text-rose-400 p-1 rounded hover:bg-slate-800 transition-colors"
                title="Delete Repository"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick Metrics Bar */}
      {activeProject?.stats && (
        <div className="px-3 py-2 bg-slate-950/40 border-b border-slate-800/80 grid grid-cols-3 gap-1 text-center text-[10px]">
          <div>
            <span className="text-slate-500 block">Files</span>
            <strong className="text-slate-200">{activeProject.stats.total_files}</strong>
          </div>
          <div>
            <span className="text-slate-500 block">Total LOC</span>
            <strong className="text-sky-300">{activeProject.stats.total_lines_of_code}</strong>
          </div>
          <div>
            <span className="text-slate-500 block">Avg Cmplx</span>
            <strong className="text-amber-300">{activeProject.stats.average_complexity}</strong>
          </div>
        </div>
      )}

      {/* Search Input */}
      <div className="p-2.5 border-b border-slate-800/80">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search files & modules..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {treeData.length > 0 ? (
          treeData.map(node => renderTreeNode(node))
        ) : (
          <div className="p-4 text-center text-slate-500 text-xs">
            {graph ? 'No files match search query.' : 'Loading tree...'}
          </div>
        )}
      </div>

      {/* Bottom Health Shortcut */}
      <div className="p-3 border-t border-slate-800 bg-slate-900/60">
        <button
          onClick={onOpenRiskDashboard}
          className="w-full flex items-center justify-between px-3 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-xl text-xs font-medium border border-slate-700/80 transition-colors"
        >
          <span className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-rose-400" />
            <span>Architecture Risk Report</span>
          </span>
          <span className="text-slate-400 text-[10px]">View</span>
        </button>
      </div>
    </div>
  );
};
