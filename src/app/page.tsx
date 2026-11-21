"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Bot,
  User,
  BrainCircuit,
  FileText,
  ChevronDown,
  ChevronRight,
  SendHorizontal,
  Loader2,
} from "lucide-react";

interface Trace {
  type: string;
  title: string;
  detail: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  traces: Trace[];
}

export default function CopilotUI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [openTraces, setOpenTraces] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const toggleTrace = (id: string) => {
    setOpenTraces((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userMsg: Message = {
      id: `usr-${Date.now()}`,
      role: "user",
      content: input,
      traces: [],
    };

    const assistantMsgId = `ast-${Date.now()}`;
    const initialAssistantMsg: Message = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      traces: [],
    };

    setMessages((prev) => [...prev, userMsg, initialAssistantMsg]);
    setInput("");
    setIsStreaming(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userMsg.content }),
      });

      if (!response.body) throw new Error("No stream available");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const matchEvent = block.match(/event: (.*)/);
          const matchData = block.match(/data: (.*)/);

          if (matchEvent && matchData) {
            const eventType = matchEvent[1].trim();
            const payload = JSON.parse(matchData[1].trim());

            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== assistantMsgId) return msg;

                if (eventType === "chunk") {
                  return { ...msg, content: msg.content + payload.text };
                } else if (eventType === "trace") {
                  return { ...msg, traces: [...msg.traces, payload] };
                }
                return msg;
              }),
            );
          }
        }
      }
    } catch (err) {
      console.error("Inference error:", err);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex h-screen w-full flex-col bg-slate-950 text-slate-100 font-sans">
      {/* Top Navbar */}
      <header className="flex h-14 items-center justify-between border-b border-slate-800 bg-slate-900/60 px-6 backdrop-blur">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-emerald-400" />
          <span className="font-semibold text-sm">Financial Copilot</span>
          <span className="rounded bg-emerald-950 px-2 py-0.5 text-[11px] font-medium text-emerald-400 border border-emerald-800">
            Local ChromaDB + Bedrock
          </span>
        </div>
        <div className="text-xs text-slate-400">SOC 2 / ISO 27001 Grounded</div>
      </header>

      {/* Main Chat Canvas */}
      <main className="flex-1 overflow-y-auto px-4 py-6 md:px-20 lg:px-48">
        <div className="space-y-6">
          {messages.length === 0 && (
            <div className="mt-24 text-center text-slate-500">
              <FileText className="mx-auto h-10 w-10 text-slate-700 mb-3" />
              <p className="text-sm font-medium">No active conversation</p>
              <p className="text-xs mt-1 text-slate-600">
                Ask about Acme Logistics Form 10-K, operating income, or
                commercial lending criteria.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 text-sm ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {message.role === "assistant" && (
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-emerald-400">
                  <Bot className="h-4 w-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-xl px-4 py-3 shadow-sm ${
                  message.role === "user"
                    ? "bg-blue-600 text-white"
                    : "border border-slate-800 bg-slate-900/80 text-slate-200"
                }`}
              >
                {/* Collapsible Trace / Retrieval Drawer */}
                {message.traces.length > 0 && (
                  <div className="mb-3 rounded-lg border border-slate-800 bg-slate-950/70 p-2.5">
                    <button
                      onClick={() => toggleTrace(message.id)}
                      className="flex w-full items-center justify-between text-xs font-semibold text-slate-400 hover:text-slate-200"
                    >
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-emerald-400" />
                        Grounded Knowledge Evidence ({
                          message.traces.length
                        }{" "}
                        references)
                      </span>
                      {openTraces[message.id] ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </button>

                    {openTraces[message.id] && (
                      <div className="mt-2.5 space-y-2 border-t border-slate-800/80 pt-2 text-xs">
                        {message.traces.map((trace, idx) => (
                          <div
                            key={idx}
                            className="rounded bg-slate-900/60 p-2"
                          >
                            <span className="font-medium text-slate-300">
                              {trace.title}
                            </span>
                            <pre className="mt-1 whitespace-pre-wrap rounded bg-black/50 p-1.5 font-mono text-[10px] text-slate-400">
                              {trace.detail}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Text Streaming Body */}
                <div className="whitespace-pre-wrap leading-relaxed">
                  {message.content || (
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Retrieving internal filings and analyzing...
                    </span>
                  )}
                </div>
              </div>

              {message.role === "user" && (
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-700 text-white">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Bar */}
      <footer className="border-t border-slate-800 bg-slate-900/60 p-4">
        <form
          onSubmit={handleSend}
          className="mx-auto flex max-w-4xl items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 focus-within:ring-1 focus-within:ring-emerald-500/50"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about Net Operating Income, debt service, or credit policy thresholds..."
            disabled={isStreaming}
            className="flex-1 bg-transparent px-2 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white transition hover:bg-emerald-500 disabled:opacity-40"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizontal className="h-4 w-4" />
            )}
          </button>
        </form>
      </footer>
    </div>
  );
}
