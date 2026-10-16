import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { FileCode, Loader2 } from 'lucide-react';

interface CodeViewerProps {
  projectId: string;
  filePath: string;
  highlightStart?: number;
  highlightEnd?: number;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({
  projectId,
  filePath,
  highlightStart,
  highlightEnd
}) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    api.getFileContent(projectId, filePath)
      .then(res => {
        if (isMounted) {
          setContent(res.content);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          setError(err.message || 'Failed to load file');
          setLoading(false);
        }
      });

    return () => { isMounted = false; };
  }, [projectId, filePath]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-slate-400 space-x-2">
        <Loader2 className="w-5 h-5 animate-spin text-sky-400" />
        <span className="text-xs">Loading source file...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-rose-950/30 border border-rose-800/40 rounded-lg text-rose-300 text-xs">
        {error}
      </div>
    );
  }

  const lines = content.split('\n');

  return (
    <div className="relative font-mono text-xs rounded-lg overflow-hidden border border-slate-800 bg-[#070b12]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/80 border-b border-slate-800 text-[11px] text-slate-400">
        <span className="flex items-center space-x-1.5 truncate">
          <FileCode className="w-3.5 h-3.5 text-sky-400" />
          <span className="truncate">{filePath}</span>
        </span>
        <span>{lines.length} lines</span>
      </div>
      <div className="max-h-[380px] overflow-auto p-2">
        {lines.map((line, idx) => {
          const lineNum = idx + 1;
          const isHighlighted = highlightStart && highlightEnd && lineNum >= highlightStart && lineNum <= highlightEnd;

          return (
            <div
              key={idx}
              className={`flex items-start leading-5 transition-colors ${
                isHighlighted ? 'bg-sky-500/20 text-sky-100 font-medium' : 'hover:bg-slate-800/40 text-slate-300'
              }`}
            >
              <span className="w-9 shrink-0 select-none text-right pr-3 text-slate-600 font-mono text-[11px]">
                {lineNum}
              </span>
              <pre className="overflow-x-auto whitespace-pre font-mono">{line || ' '}</pre>
            </div>
          );
        })}
      </div>
    </div>
  );
};
