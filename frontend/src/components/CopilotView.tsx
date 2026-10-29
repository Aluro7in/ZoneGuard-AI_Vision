import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  Paperclip,
  Trash2,
  Copy,
  Check,
  FileText,
  AlertTriangle,
  Upload,
  X,
  FileJson,
  Shield,
  Layers,
  HelpCircle,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { InvestigationRecord } from '../types/zoneguard';
import { api } from '../services/api';
import { StatusBadge } from './StatusBadge';

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface CopilotViewProps {
  activeInvestigation: InvestigationRecord | null;
  initialReportContext?: unknown;
}

const SUGGESTED_PROMPTS = [
  'Summarize this investigation for an EHS safety manager.',
  'Why was this result classified as REVIEW rather than ALERT?',
  'List the verified visual facts vs. items needing human inspection.',
  'Generate an OSHA-compliant incident summary memo.',
  'Analyze the footpoint occupancy vs. bounding box geometry.',
  'Break down the Agentic Visual Inspection tool trace sequence.',
];

export const CopilotView: React.FC<CopilotViewProps> = ({
  activeInvestigation,
  initialReportContext,
}) => {
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: 'welcome-msg',
      role: 'assistant',
      content:
        `Welcome to **ZoneGuard Copilot**, your specialized industrial visual safety analyst.\n\n` +
        `I am grounded in OpenCV 5.0.0 and YOLOX video inspection reports. I can analyze safety zone breaches, explain ALERT/CLEAR/REVIEW classifications, interpret footpoint ground-plane tracking, and draft defensible incident memos for your EHS team.\n\n` +
        (activeInvestigation
          ? `✓ Active investigation **#${activeInvestigation.investigation_id.slice(0, 12)}…** is loaded in context (${activeInvestigation.decision} — ${activeInvestigation.events.length} event(s)).`
          : `You can upload a ZoneGuard JSON report or ask questions about industrial safety protocols.`),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputPrompt, setInputPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Attached report context: defaults to activeInvestigation if provided
  const [attachedContext, setAttachedContext] = useState<unknown | null>(
    initialReportContext || activeInvestigation?.raw_analysis || activeInvestigation || null
  );

  // Attached file state (e.g. uploaded JSON report)
  const [attachedFile, setAttachedFile] = useState<{
    filename: string;
    mimeType: string;
    content?: string;
    base64?: string;
    sizeKb: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Sync when activeInvestigation changes
  useEffect(() => {
    if (activeInvestigation && !attachedContext) {
      setAttachedContext(activeInvestigation.raw_analysis || activeInvestigation);
    }
  }, [activeInvestigation, attachedContext]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    const sizeKb = Math.round(file.size / 1024);

    if (file.size > 20 * 1024 * 1024) {
      setErrorMsg('File exceeds 20MB limit for Copilot analysis.');
      return;
    }

    if (file.name.endsWith('.json') || file.type === 'application/json') {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          // Validate JSON
          const parsed = JSON.parse(text);
          setAttachedFile({
            filename: file.name,
            mimeType: 'application/json',
            content: text,
            sizeKb,
          });
          setAttachedContext(parsed);
        } catch {
          setErrorMsg('Uploaded file is not valid JSON.');
        }
      };
      reader.readAsText(file);
    } else if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const base64Data = dataUrl.split(',')[1] || '';
        setAttachedFile({
          filename: file.name,
          mimeType: file.type,
          base64: base64Data,
          sizeKb,
        });
      };
      reader.readAsDataURL(file);
    } else {
      // Text or log file
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setAttachedFile({
          filename: file.name,
          mimeType: file.type || 'text/plain',
          content: text,
          sizeKb,
        });
      };
      reader.readAsText(file);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const content = (textToSend || inputPrompt).trim();
    if (!content || isLoading) return;

    setErrorMsg(null);
    setInputPrompt('');

    const userMessage: CopilotMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      // Send conversation history to server-side Gemini route
      const reply = await api.copilotChat({
        messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        reportContext: attachedContext || undefined,
        fileData: attachedFile
          ? {
              filename: attachedFile.filename,
              mimeType: attachedFile.mimeType,
              content: attachedFile.content,
              base64: attachedFile.base64,
            }
          : undefined,
      });

      const assistantMessage: CopilotMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      const errDetail = err instanceof Error ? err.message : 'Unknown error from Copilot';
      setErrorMsg(errDetail);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 'welcome-msg-reset',
        role: 'assistant',
        content: 'Conversation cleared. How can I assist with your safety investigation report today?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setErrorMsg(null);
  };

  const loadActiveInvestigationContext = () => {
    if (activeInvestigation) {
      setAttachedContext(activeInvestigation.raw_analysis || activeInvestigation);
      setErrorMsg(null);
    }
  };

  const removeContext = () => {
    setAttachedContext(null);
    setAttachedFile(null);
  };

  // Render markdown-like elements (bold, bullet points, headers) cleanly without external heavy parser
  const renderFormattedText = (text: string) => {
    const lines = text.split('\n');
    return (
      <div className="space-y-1.5 leading-relaxed text-xs">
        {lines.map((line, lIdx) => {
          if (!line.trim()) {
            return <div key={lIdx} className="h-1.5" />;
          }

          // Headers
          if (line.startsWith('### ')) {
            return (
              <h4 key={lIdx} className="font-bold text-sm text-cyan-400 dark:text-cyan-300 mt-2">
                {line.replace('### ', '')}
              </h4>
            );
          }
          if (line.startsWith('## ')) {
            return (
              <h3 key={lIdx} className="font-bold text-base text-slate-100 dark:text-slate-100 mt-3 border-b border-slate-700/60 pb-1">
                {line.replace('## ', '')}
              </h3>
            );
          }

          // Bullets
          if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
            const raw = line.trim().replace(/^[-*]\s+/, '');
            return (
              <div key={lIdx} className="flex items-start gap-2 pl-2">
                <span className="text-cyan-400 font-bold shrink-0 mt-0.5">•</span>
                <span className="flex-1">{formatInline(raw)}</span>
              </div>
            );
          }

          // Numbered lists
          const numMatch = line.trim().match(/^(\d+)\.\s+(.*)/);
          if (numMatch) {
            return (
              <div key={lIdx} className="flex items-start gap-2 pl-2">
                <span className="text-cyan-400 font-mono font-bold shrink-0">{numMatch[1]}.</span>
                <span className="flex-1">{formatInline(numMatch[2])}</span>
              </div>
            );
          }

          return <p key={lIdx}>{formatInline(line)}</p>;
        })}
      </div>
    );
  };

  const formatInline = (str: string) => {
    // Basic bold **text** replacement
    const parts = str.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-bold text-slate-100 dark:text-slate-100">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 bg-gradient-to-r from-violet-950/40 via-slate-900 to-cyan-950/30 border-2 border-slate-800 dark:border-slate-800 rounded-xl neo-shadow">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-violet-600/20 border-2 border-violet-400 flex items-center justify-center text-violet-400 neo-shadow-sm">
            <Sparkles className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-100 tracking-tight">
                ZoneGuard Copilot
              </h2>
              <span className="text-[10px] font-mono font-bold uppercase bg-violet-950/80 text-violet-300 border border-violet-500/40 px-2 py-0.5 rounded-sm">
                AI Safety Report Analyst
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Defensible incident reasoning, EHS executive summaries, and evidence cross-examination powered by server-side Gemini.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {messages.length > 1 && (
            <button
              type="button"
              onClick={handleClearChat}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Chat</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Context Bar */}
      <div className="p-3.5 bg-slate-900/90 dark:bg-slate-900/90 border-2 border-slate-800 rounded-lg neo-shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono font-bold text-slate-400 uppercase text-[11px]">Context Grounding:</span>
          {attachedContext ? (
            <div className="flex items-center gap-2 bg-slate-950 border border-cyan-500/40 px-2.5 py-1 rounded text-cyan-300 font-mono text-xs">
              <FileJson className="w-3.5 h-3.5 text-cyan-400" />
              <span>
                {activeInvestigation
                  ? `Report: ${activeInvestigation.investigation_id.slice(0, 12)}…`
                  : attachedFile?.filename || 'ZoneGuard Incident Report'}
              </span>
              {activeInvestigation && (
                <StatusBadge decision={activeInvestigation.decision} size="sm" />
              )}
              <button
                type="button"
                onClick={removeContext}
                className="hover:text-red-400 ml-1 p-0.5"
                title="Remove context"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <span className="text-slate-500 font-mono text-xs">
              No active report loaded. General safety inquiry mode.
            </span>
          )}

          {attachedFile && (
            <div className="flex items-center gap-1.5 bg-slate-950 border border-violet-500/40 px-2.5 py-1 rounded text-violet-300 font-mono text-xs">
              <FileText className="w-3.5 h-3.5 text-violet-400" />
              <span className="truncate max-w-[180px]">{attachedFile.filename}</span>
              <span className="text-slate-500">({attachedFile.sizeKb}KB)</span>
              <button
                type="button"
                onClick={() => setAttachedFile(null)}
                className="hover:text-red-400 ml-1"
                title="Remove attachment"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {activeInvestigation && !attachedContext && (
            <button
              type="button"
              onClick={loadActiveInvestigationContext}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/40 rounded transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Load Active Workspace Report</span>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.txt,.log,.png,.jpg,.jpeg"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors"
          >
            <Paperclip className="w-3.5 h-3.5 text-violet-400" />
            <span>Attach Report / Document</span>
          </button>
        </div>
      </div>

      {/* Suggested Prompt Chips */}
      {messages.length <= 2 && (
        <div className="space-y-2">
          <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
            Suggested Investigation Prompts:
          </span>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map((prompt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => void handleSendMessage(prompt)}
                className="px-3 py-1.5 text-xs text-left bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-cyan-300 border border-slate-800 hover:border-cyan-500/50 rounded-lg transition-colors neo-shadow-sm font-sans"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Message Thread Container */}
      <div className="border-2 border-slate-800 rounded-xl bg-slate-900/60 dark:bg-slate-900/60 neo-shadow overflow-hidden flex flex-col min-h-[420px] max-h-[580px]">
        {/* Messages scroll area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.map((msg) => {
            const isAssistant = msg.role === 'assistant';

            return (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-3xl ${
                  isAssistant ? 'mr-auto' : 'ml-auto flex-row-reverse'
                }`}
              >
                {/* Avatar Icon */}
                <div
                  className={`w-7 h-7 rounded-sm flex items-center justify-center shrink-0 border neo-shadow-sm ${
                    isAssistant
                      ? 'bg-violet-950 border-violet-500/50 text-violet-400'
                      : 'bg-cyan-950 border-cyan-500/50 text-cyan-400'
                  }`}
                >
                  {isAssistant ? <Sparkles className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                </div>

                {/* Content Bubble */}
                <div
                  className={`relative p-3.5 rounded-lg border text-xs space-y-1.5 ${
                    isAssistant
                      ? 'bg-slate-950/90 border-slate-800 text-slate-200 neo-shadow-sm w-full'
                      : 'bg-cyan-950/40 border-cyan-500/40 text-cyan-100 neo-shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 pb-1 border-b border-slate-800/60 text-[10px] font-mono text-slate-500">
                    <span className="font-bold uppercase tracking-wider text-slate-400">
                      {isAssistant ? 'ZoneGuard Copilot' : 'Safety Supervisor'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span>{msg.timestamp}</span>
                      {isAssistant && (
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(msg.id, msg.content)}
                          className="hover:text-cyan-400 transition-colors"
                          title="Copy response"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {isAssistant ? (
                    renderFormattedText(msg.content)
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex items-center gap-3 p-3 max-w-xs bg-slate-950/80 border border-violet-500/30 rounded-lg text-xs font-mono text-violet-300 neo-shadow-sm">
              <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
              <span>Analyzing report & formulating visual evidence findings…</span>
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3 bg-red-950/40 border-2 border-red-500/50 rounded-lg text-xs text-red-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="text-red-400 hover:text-white font-mono text-xs"
              >
                Dismiss
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input composer */}
        <div className="p-3 bg-slate-950 border-t-2 border-slate-800">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendMessage();
            }}
            className="flex items-end gap-2"
          >
            <textarea
              ref={textareaRef}
              rows={2}
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSendMessage();
                }
              }}
              placeholder="Ask Copilot about zone breaches, dwell intervals, footpoint metrics, or request an incident report draft… (Shift+Enter for newline)"
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 resize-none font-sans"
            />

            <button
              type="submit"
              disabled={isLoading || !inputPrompt.trim()}
              className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs rounded-lg neo-shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0 h-10"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Send</span>
                  <Send className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
