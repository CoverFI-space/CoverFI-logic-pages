import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bot, Send, Sparkles, X } from "lucide-react";
import { useDepositFree } from "../../context/AppContext";
import { getApiUrl } from "../../lib/api";

type Message = { role: "user" | "assistant"; text: string };

function Inline({ value }: { value: string }) {
  return <>{value.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => part.startsWith("`") ? <code key={index} className="rounded bg-white/10 px-1 py-0.5 text-[.9em]">{part.slice(1, -1)}</code> : part.startsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : <span key={index}>{part}</span>)}</>;
}

function Markdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/); const blocks: ReactNode[] = []; let index = 0;
  const cells = (value: string) => value.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    if (line.includes("|") && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1])) {
      const headers = cells(line); index += 2; const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) { rows.push(cells(lines[index])); index += 1; }
      blocks.push(<div key={`table-${index}`} className="overflow-x-auto rounded-lg border border-white/10"><table className="min-w-full text-left text-xs"><thead className="bg-white/10"><tr>{headers.map((header, key) => <th key={key} className="px-2 py-2"><Inline value={header} /></th>)}</tr></thead><tbody className="divide-y divide-white/10">{rows.map((row, rowKey) => <tr key={rowKey}>{headers.map((_, key) => <td key={key} className="px-2 py-2"><Inline value={row[key] || ""} /></td>)}</tr>)}</tbody></table></div>); continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) { blocks.push(<p key={index} className="font-semibold text-[#E1E0CC]"><Inline value={heading[2]} /></p>); index += 1; continue; }
    if (/^[-*]\s+/.test(line.trim())) { const items: string[] = []; while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) { items.push(lines[index].trim().replace(/^[-*]\s+/, "")); index += 1; } blocks.push(<ul key={index} className="list-disc space-y-1 pl-4">{items.map((item, key) => <li key={key}><Inline value={item} /></li>)}</ul>); continue; }
    blocks.push(<p key={index} className="whitespace-pre-wrap leading-relaxed"><Inline value={line} /></p>); index += 1;
  }
  return <div className="space-y-2.5">{blocks}</div>;
}

export default function CofiAiPanel({ open, onClose, username, walletAddress }: { open: boolean; onClose: () => void; username: string; walletAddress: string }) {
  const { data, network } = useDepositFree();
  const [mode, setMode] = useState<"chat" | "research">("chat");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", text: "## CoFi AI\n\nHow can I help with CoverFi? I can use your current page and account context, or research approved CoverFi sources." }]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const pageContext = useMemo(() => {
    const hash = window.location.hash || "#app/dashboard";
    return hash.replace("#app/", "").replace(/-/g, " ") || "dashboard";
  }, [open]);

  useEffect(() => {
    if (open) messageEndRef.current?.scrollIntoView({ behavior: loading ? "smooth" : "auto", block: "end" });
  }, [loading, messages, open]);
  if (!open) return null;
  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const trimmed = message.trim(); if (!trimmed || loading) return;
    setMessages((items) => [...items, { role: "user", text: trimmed }]); setMessage(""); setLoading(true);
    try {
      const response = await fetch(getApiUrl("/api/ai/chat"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: trimmed, walletAddress, mode, accountContext: { username, walletAddress, network, currentPage: pageContext, positions: data.positions.map((position) => ({ asset: position.asset, status: position.status, protectedAmount: position.protectedAmount, expiryTime: position.expiryTime })), activity: data.activity.slice(-8) } }) });
      const result = await response.json().catch(() => null); if (!response.ok) throw new Error(result?.message || "CoFi AI is unavailable.");
      setMessages((items) => [...items, { role: "assistant", text: String(result?.reply || "No response returned.") }]);
    } catch (error) { setMessages((items) => [...items, { role: "assistant", text: `**Unable to respond:** ${error instanceof Error ? error.message : "Please try again."}` }]); } finally { setLoading(false); }
  }

  return <>
    <button type="button" aria-label="Close CoFi AI" onClick={onClose} className="fixed inset-0 z-[60] cursor-default bg-black/45 backdrop-blur-[1px]" />
    <aside className="fixed inset-y-0 right-0 z-[61] flex w-full max-w-[440px] flex-col border-l border-violet-200/20 bg-[#0a090e]/95 shadow-[-28px_0_80px_rgba(0,0,0,.5)] backdrop-blur-2xl" aria-label="CoFi AI customer support">
      <header className="flex shrink-0 items-center justify-between border-b border-[#E1E0CC]/10 px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-100 text-black"><Bot className="h-5 w-5" /></span><div><p className="text-sm text-[#E1E0CC]">CoFi AI</p><p className="text-xs text-[#E1E0CC]/45">Support · {pageContext}</p></div></div><button type="button" onClick={onClose} className="rounded-xl border border-[#E1E0CC]/15 p-2 text-[#E1E0CC]/65 hover:bg-[#E1E0CC] hover:text-black" aria-label="Close"><X className="h-4 w-4" /></button></header>
      <div className="flex shrink-0 items-center justify-between border-b border-[#E1E0CC]/10 px-5 py-3"><div className="inline-flex rounded-xl border border-[#E1E0CC]/15 bg-black/30 p-1"><button type="button" onClick={() => setMode("chat")} className={`rounded-lg px-3 py-1.5 text-[10px] uppercase tracking-widest ${mode === "chat" ? "bg-[#E1E0CC] text-black" : "text-[#E1E0CC]/50"}`}>Support</button><button type="button" onClick={() => setMode("research")} className={`rounded-lg px-3 py-1.5 text-[10px] uppercase tracking-widest ${mode === "research" ? "bg-[#E1E0CC] text-black" : "text-[#E1E0CC]/50"}`}>Research</button></div><span className="text-[10px] uppercase tracking-widest text-[#E1E0CC]/40">{loading ? "Working" : "Ready"}</span></div>
      <div className="cofi-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">{messages.map((item, index) => <div key={index} className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${item.role === "user" ? "bg-[#E1E0CC] text-black" : "border border-[#E1E0CC]/10 bg-white/[.04] text-[#E1E0CC]/75"}`}>{item.role === "assistant" ? <Markdown text={item.text} /> : item.text}</div></div>)}{loading && <div className="flex items-center gap-2 text-xs text-[#E1E0CC]/50"><Sparkles className="h-4 w-4 animate-pulse text-violet-200" />{mode === "research" ? "Researching approved CoverFi sources…" : "Preparing final answer…"}</div>}<div ref={messageEndRef} /></div>
      <form onSubmit={send} className="shrink-0 border-t border-[#E1E0CC]/10 p-4"><div className="rounded-2xl border border-[#E1E0CC]/12 bg-black/45 p-2"><textarea ref={inputRef} value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={2} placeholder="Ask CoFi AI…" className="min-h-14 w-full resize-none bg-transparent px-2 py-2 text-sm text-[#E1E0CC] outline-none placeholder:text-[#E1E0CC]/30" /><div className="flex justify-end"><button type="submit" disabled={!message.trim() || loading} className="inline-flex items-center gap-2 rounded-xl bg-[#E1E0CC] px-4 py-2 text-xs uppercase tracking-widest text-black disabled:opacity-45"><Send className="h-3.5 w-3.5" />Send</button></div></div></form>
    </aside>
  </>;
}
