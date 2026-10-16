import React, { useState } from 'react';
import { api } from '../../api/client';
import { Project } from '../../types';
import {
  UploadCloud,
  FolderPlus,
  Play,
  Loader2,
  X,
  FileCode,
  AlertCircle
} from 'lucide-react';

interface ImportModalProps {
  onClose: () => void;
  onProjectLoaded: (project: Project) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  onClose,
  onProjectLoaded
}) => {
  const [tab, setTab] = useState<'sample' | 'folder' | 'zip'>('sample');
  const [localPath, setLocalPath] = useState('');
  const [projectName, setProjectName] = useState('');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoadSample = async (type: 'python' | 'typescript') => {
    setLoading(true);
    setError(null);
    try {
      const proj = await api.loadSample(type);
      onProjectLoaded(proj);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to load sample project');
    } finally {
      setLoading(false);
    }
  };

  const handleImportFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localPath.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const proj = await api.createProject(projectName, localPath.trim());
      onProjectLoaded(proj);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to import local folder');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadZip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zipFile) return;
    setLoading(true);
    setError(null);
    try {
      const proj = await api.uploadProjectZip(zipFile, projectName);
      onProjectLoaded(proj);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to upload archive');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="glass-panel w-full max-w-lg rounded-2xl flex flex-col overflow-hidden border border-slate-700/80 shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div>
            <h2 className="text-base font-bold text-white">Import Repository into Universe</h2>
            <p className="text-xs text-slate-400">Index ASTs, build 3D celestial graph, and analyze dependencies</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 text-xs bg-slate-950/60 select-none">
          <button
            onClick={() => setTab('sample')}
            className={`flex-1 py-3 font-semibold transition-colors border-b-2 flex items-center justify-center space-x-1.5 ${
              tab === 'sample' ? 'border-sky-400 text-sky-400 bg-sky-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Pre-built Samples</span>
          </button>
          <button
            onClick={() => setTab('folder')}
            className={`flex-1 py-3 font-semibold transition-colors border-b-2 flex items-center justify-center space-x-1.5 ${
              tab === 'folder' ? 'border-sky-400 text-sky-400 bg-sky-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Local Folder</span>
          </button>
          <button
            onClick={() => setTab('zip')}
            className={`flex-1 py-3 font-semibold transition-colors border-b-2 flex items-center justify-center space-x-1.5 ${
              tab === 'zip' ? 'border-sky-400 text-sky-400 bg-sky-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Upload ZIP</span>
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 text-xs space-y-4">
          {error && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {tab === 'sample' && (
            <div className="space-y-3">
              <p className="text-slate-300 leading-relaxed text-[11px]">
                Instantly load and explore realistic pre-configured repositories featuring real-world dependency graphs, circular imports, and test suites:
              </p>
              <div className="grid grid-cols-1 gap-2.5">
                <button
                  onClick={() => handleLoadSample('python')}
                  disabled={loading}
                  className="p-3.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-left transition-all hover:border-sky-500/50 flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-white">Financial Microservice (Python)</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      JWT authentication, circular imports, high cyclomatic complexity, unit tests.
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase px-2 py-1 rounded bg-sky-950 text-sky-300 border border-sky-800">
                    Python
                  </span>
                </button>

                <button
                  onClick={() => handleLoadSample('typescript')}
                  disabled={loading}
                  className="p-3.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-left transition-all hover:border-indigo-500/50 flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-white">Telemetry Metrics API (TypeScript)</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Class hierarchies, service layers, arrow functions, and test fixtures.
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase px-2 py-1 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                    TypeScript
                  </span>
                </button>
              </div>
            </div>
          )}

          {tab === 'folder' && (
            <form onSubmit={handleImportFolder} className="space-y-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Project Name (Optional)</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  placeholder="e.g. My Backend App"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Local Directory Path</label>
                <input
                  type="text"
                  value={localPath}
                  onChange={e => setLocalPath(e.target.value)}
                  placeholder="e.g. C:\projects\my-repo"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-sky-500 font-mono"
                  required
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Path must be accessible by the local backend server.
                </span>
              </div>
              <button
                type="submit"
                disabled={loading || !localPath.trim()}
                className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 font-bold rounded-lg transition-colors flex items-center justify-center space-x-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{loading ? 'Scanning & Parsing...' : 'Import Directory'}</span>
              </button>
            </form>
          )}

          {tab === 'zip' && (
            <form onSubmit={handleUploadZip} className="space-y-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Project Name (Optional)</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  placeholder="e.g. Archive Service"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">ZIP Archive File</label>
                <input
                  type="file"
                  accept=".zip"
                  onChange={e => setZipFile(e.target.files ? e.target.files[0] : null)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700"
                  required
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Files are safely unzipped with ZipSlip path traversal protection.
                </span>
              </div>
              <button
                type="submit"
                disabled={loading || !zipFile}
                className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 font-bold rounded-lg transition-colors flex items-center justify-center space-x-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{loading ? 'Uploading & Extracting...' : 'Upload & Launch Universe'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
