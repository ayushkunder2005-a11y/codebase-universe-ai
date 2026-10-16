import React, { useState, useRef, useEffect } from 'react';
import { api } from '../../api/client';
import { ChatMessage, ChatCitation, GraphNode } from '../../types';
import {
  Sparkles,
  Send,
  Loader2,
  FileText,
  ShieldCheck,
  AlertTriangle,
  X,
  Bot,
  User,
  Cpu,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';

interface AssistantPanelProps {
  projectId: string;
  selectedNode: GraphNode | null;
  onClose: () => void;
  onSelectCitation: (citation: ChatCitation) => void;
}

interface OllamaStatus {
  connected: boolean;
  provider: string;
  base_url: string;
  active_model: string;
  models: string[];
  error?: string;
}

const PRESET_QUERIES = [
  "How does request/data flow through this project?",
  "Which components are tightly coupled?",
  "Are there circular imports or quality risks?",
  "Explain the core responsibility of the selected component."
];

export const AssistantPanel: React.FC<AssistantPanelProps> = ({
  projectId,
  selectedNode,
  onClose,
  onSelectCitation
}) => {
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [switchingModel, setSwitchingModel] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      content: `Hello! I am your Codebase Universe Assistant running on your local Ollama engine.\n\nAll source code reasoning and AST graph inspections are executed directly on your machine with 100% privacy and grounded citations.`,
      timestamp: new Date().toISOString()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch Ollama connection status
  const checkOllama = async () => {
    try {
      const status = await api.getOllamaStatus();
      setOllamaStatus(status);
    } catch {
      setOllamaStatus(null);
    }
  };

  useEffect(() => {
    checkOllama();
  }, []);

  const handleSelectModel = async (model: string) => {
    setSwitchingModel(true);
    try {
      await api.selectOllamaModel(model);
      await checkOllama();
    } catch (err: any) {
      alert(`Could not select model: ${err.message}`);
    } finally {
      setSwitchingModel(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || input;
    if (!textToSend.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      content: textToSend,
      timestamp: new Date().toISOString(),
      relevant_nodes: selectedNode ? [selectedNode.id] : []
    };

    const asstMsgId = (Date.now() + 1).toString();
    const placeholderAsstMsg: ChatMessage = {
      id: asstMsgId,
      sender: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      citations: [],
      relevant_nodes: [],
      answer_source: 'llm'
    };

    setMessages(prev => [...prev, userMsg, placeholderAsstMsg]);
    setInput('');
    setLoading(true);

    try {
      await api.sendChatMessageStream(
        projectId,
        textToSend,
        (token) => {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === asstMsgId ? { ...msg, content: msg.content + token } : msg
            )
          );
        },
        (meta) => {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === asstMsgId
                ? {
                    ...msg,
                    citations: meta.citations,
                    relevant_nodes: meta.relevant_nodes,
                    evidence_status: meta.evidence_status
                  }
                : msg
            )
          );
        },
        undefined,
        selectedNode?.id
      );
    } catch (err: any) {
      setMessages(prev =>
        prev.map(msg =>
          msg.id === asstMsgId
            ? {
                ...msg,
                content: msg.content
                  ? msg.content + `\n\n[Stream disconnected: ${err.message}]`
                  : `Error: ${err.message || 'Failed to reach Ollama AI engine'}. Ensure Ollama is running at localhost:11434.`
              }
            : msg
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-[430px] glass-panel border-l border-slate-800 flex flex-col h-full z-30 transition-all select-text shadow-2xl">
      {/* Header */}
      <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/50">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center space-x-1.5">
              <span>Codebase AI</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                Ollama Engine
              </span>
            </h3>
            <span className="text-[11px] text-slate-400 flex items-center space-x-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>Private Local Inference</span>
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Ollama Engine Connection Bar */}
      <div className="px-3.5 py-2 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2 truncate">
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${ollamaStatus?.connected ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${ollamaStatus?.connected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
          </span>
          <span className="text-slate-300 font-medium truncate">
            {ollamaStatus?.connected ? 'Ollama Online' : 'Ollama Connecting...'}
          </span>
        </div>

        {ollamaStatus?.connected && ollamaStatus.models.length > 0 && (
          <div className="flex items-center space-x-1.5">
            <span className="text-[10px] text-slate-500">Model:</span>
            <select
              value={ollamaStatus.active_model}
              onChange={e => handleSelectModel(e.target.value)}
              disabled={switchingModel}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-[11px] text-emerald-300 font-mono focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {ollamaStatus.models.map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={checkOllama}
          className="p-1 text-slate-500 hover:text-slate-300 rounded hover:bg-slate-900 transition-colors"
          title="Refresh Ollama Connection"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* Selected Node Context Pill */}
      {selectedNode && (
        <div className="px-3.5 py-1.5 bg-slate-900/70 border-b border-slate-800/60 flex items-center justify-between text-xs text-slate-300">
          <span className="truncate flex items-center space-x-1.5">
            <span className="text-slate-500">Focus:</span>
            <strong className="text-sky-300 font-mono truncate">{selectedNode.name}</strong>
          </span>
          <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
            {selectedNode.type}
          </span>
        </div>
      )}

      {/* Message History */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center space-x-1.5 mb-1 text-[11px] text-slate-400">
              {msg.sender === 'assistant' ? (
                <>
                  <Cpu className="w-3 h-3 text-emerald-400" />
                  <span className="font-semibold text-slate-300">Ollama ({ollamaStatus?.active_model || 'llama3.2:1b'})</span>
                  {(msg as any).answer_source === 'static_fallback' && (
                    <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[9px] border border-slate-700">
                      Static Index
                    </span>
                  )}
                </>
              ) : (
                <>
                  <User className="w-3 h-3 text-indigo-400" />
                  <span>You</span>
                </>
              )}
            </div>

            <div
              className={`p-3 rounded-xl max-w-[92%] leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-sky-600 text-white rounded-br-none shadow-md'
                  : 'bg-slate-900/90 text-slate-200 border border-slate-800 rounded-bl-none shadow-lg whitespace-pre-wrap'
              }`}
            >
              {msg.sender === 'assistant' && !msg.content && loading ? (
                <div className="flex items-center space-x-2 text-slate-400 py-0.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                  <span className="text-[11px] text-slate-400 italic">Streaming architecture analysis...</span>
                </div>
              ) : (
                <>
                  {msg.content}
                  {msg.sender === 'assistant' && loading && (
                    <span className="inline-block w-1.5 h-3.5 ml-1 bg-emerald-400 animate-pulse align-middle" />
                  )}
                </>
              )}

              {/* Citations section */}
              {msg.citations && msg.citations.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-slate-800 space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                    Verified Source Citations
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.citations.map((c, idx) => (
                      <button
                        key={idx}
                        onClick={() => onSelectCitation(c)}
                        className="flex items-center space-x-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-750 border border-slate-700/80 text-sky-300 hover:text-sky-200 font-mono text-[11px] transition-colors"
                        title={c.snippet}
                      >
                        <FileText className="w-3 h-3 text-sky-400" />
                        <span>{c.file_path}:{c.line_start || 1}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Preset Suggestions */}
      <div className="px-3 py-2 border-t border-slate-800/80 bg-slate-950/40">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block mb-1">
          Suggested Inquiries
        </span>
        <div className="flex flex-wrap gap-1">
          {PRESET_QUERIES.slice(0, 2).map((q, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(q)}
              className="text-[10px] text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 px-2 py-1 rounded-md transition-colors truncate max-w-full"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Input Box */}
      <div className="p-3 border-t border-slate-800 bg-slate-900/70">
        <form
          onSubmit={e => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center space-x-2"
        >
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={`Ask Ollama about architecture or dependencies...`}
            className="flex-1 bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold rounded-lg transition-colors shrink-0 shadow"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
