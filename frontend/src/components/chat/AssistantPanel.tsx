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
  User
} from 'lucide-react';

interface AssistantPanelProps {
  projectId: string;
  selectedNode: GraphNode | null;
  onClose: () => void;
  onSelectCitation: (citation: ChatCitation) => void;
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
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      content: `Hello! I am your Codebase Universe Software Intelligence Assistant. I am directly connected to the AST and dependency graph of this project.\n\nAsk me about architecture, call chains, coupling, or refactoring impact. All my answers are grounded in indexed files with verified citations.`,
      timestamp: new Date().toISOString()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.sendChatMessage(
        projectId,
        textToSend,
        undefined,
        selectedNode?.id
      );

      const asstMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        content: res.reply,
        timestamp: new Date().toISOString(),
        citations: res.citations,
        relevant_nodes: res.relevant_nodes
      };

      setMessages(prev => [...prev, asstMsg]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'assistant',
          content: `Error: ${err.message || 'Failed to reach AI service'}. Please check your connection or LLM settings.`,
          timestamp: new Date().toISOString()
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-[420px] glass-panel border-l border-slate-800 flex flex-col h-full z-30 transition-all select-text shadow-2xl">
      {/* Header */}
      <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/50">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Codebase Intelligence AI</h3>
            <span className="text-[11px] text-emerald-400 flex items-center space-x-1">
              <ShieldCheck className="w-3 h-3" />
              <span>Grounded in AST Index</span>
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

      {/* Selected Node Context Pill */}
      {selectedNode && (
        <div className="px-3 py-1.5 bg-slate-900/70 border-b border-slate-800/60 flex items-center justify-between text-xs text-slate-300">
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
                  <Bot className="w-3 h-3 text-sky-400" />
                  <span>Universe AI</span>
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
              {msg.content}

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

        {loading && (
          <div className="flex items-center space-x-2 p-3 bg-slate-900/70 border border-slate-800 rounded-xl max-w-[80%] text-slate-300">
            <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
            <span>Analyzing indexed graph and inspecting code snippets...</span>
          </div>
        )}

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
            placeholder="Ask about architecture, dependencies, or flow..."
            className="flex-1 bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 font-bold rounded-lg transition-colors shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
