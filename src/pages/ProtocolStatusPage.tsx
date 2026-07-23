import { useEffect, useMemo, useRef, useState } from "react";
import { BellRing, CheckCircle2, CircleAlert, Clock3, Database, Radio, RefreshCw } from "lucide-react";
import { DashboardLayout, GlassCard, PrimaryButton, StatusBadge } from "../components/dashboard/DashboardComponents";
import { useDepositFree } from "../context/AppContext";
import { getApiUrl } from "../lib/api";

type StatusRecord = Record<string, unknown>;
type ProtocolAlert = { id: string; title: string; href: string; tone: "attention" | "ready" };
const sidebarItems = ["Dashboard", "Portfolio", "Protect", "Asset Flow", "Positions", "Claims", "Pay Username", "History", "QR Service", "Protocol Status", "Profile"];

function asRecord(value: unknown): StatusRecord | null { return value && typeof value === "object" && !Array.isArray(value) ? value as StatusRecord : null; }
function text(value: unknown, fallback = "Unavailable") { return value === null || value === undefined || value === "" ? fallback : String(value).slice(0, 180); }
function numberValue(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function atomic(value: unknown) { const parsed = numberValue(value); return parsed === null ? text(value) : parsed.toLocaleString(); }
function bps(value: unknown) { const parsed = numberValue(value); return parsed === null ? "Unavailable" : `${(parsed / 100).toFixed(2)}%`; }
function age(value: unknown) { const seconds = numberValue(value); if (seconds === null || seconds < 0) return "Unavailable"; return seconds < 60 ? `${Math.floor(seconds)} sec` : seconds < 3600 ? `${Math.floor(seconds / 60)} min` : `${(seconds / 3600).toFixed(1)} hr`; }
function safeExternalUrl(value: unknown) { try { const url = new URL(String(value || "")); return url.protocol === "https:" ? url.toString() : ""; } catch { return ""; } }
async function fixedJson(path: string, signal: AbortSignal): Promise<StatusRecord | null> { const response = await fetch(getApiUrl(path), { signal, headers: { Accept: "application/json" } }); return response.ok ? asRecord(await response.json()) : null; }

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-[#E1E0CC]/10 bg-black/25 p-4"><p className="text-[10px] uppercase tracking-[0.22em] text-[#E1E0CC]/40">{label}</p><p className="mt-3 break-words font-serif text-2xl italic text-[#E1E0CC]">{value}</p></div>;
}

export default function ProtocolStatusPage({ username, walletAddress, onLogout }: { username: string; walletAddress: string; onLogout: () => void }) {
  const { data, network, setNetwork } = useDepositFree();
  const [reserve, setReserve] = useState<StatusRecord | null>(null);
  const [oracle, setOracle] = useState<StatusRecord | null>(null);
  const [operations, setOperations] = useState<StatusRecord | null>(null);
  const [updatedAt, setUpdatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const notifiedRef = useRef(new Set<string>());

  async function loadStatus(signal?: AbortSignal) {
    const controller = signal ? null : new AbortController();
    const activeSignal = signal || controller!.signal;
    setLoading(true);
    try {
      const [nextReserve, nextOracle, nextOperations] = await Promise.all([fixedJson("/api/status/reserve", activeSignal), fixedJson("/api/status/oracle", activeSignal), fixedJson("/api/status/atlassian", activeSignal)]);
      setReserve(nextReserve); setOracle(nextOracle); setOperations(nextOperations); setUpdatedAt(new Date().toLocaleString());
    } catch { if (!activeSignal.aborted) { setReserve(null); setOracle(null); setOperations(null); } } finally { if (!activeSignal.aborted) setLoading(false); }
  }
  useEffect(() => { const controller = new AbortController(); void loadStatus(controller.signal); const timer = window.setInterval(() => void loadStatus(), 60_000); return () => { controller.abort(); window.clearInterval(timer); }; }, [network]);

  const pool = asRecord(reserve?.pool);
  const alerts = useMemo<ProtocolAlert[]>(() => {
    const next: ProtocolAlert[] = []; const now = Date.now();
    data.positions.forEach((position) => {
      const expiry = new Date(position.expiryTime).getTime();
      if (position.status === "Claimable" && !position.payoutClaimed) next.push({ id: `claim-${position.id}`, title: "Payout ready", href: "#app/claims", tone: "ready" });
      else if (position.status === "AwaitingOracle") next.push({ id: `oracle-position-${position.id}`, title: "Position awaiting oracle", href: "#app/positions", tone: "attention" });
      else if (position.status === "Active" && expiry > now && expiry - now <= 86_400_000) next.push({ id: `expiry-${position.id}`, title: "Position expires within 24 hours", href: "#app/positions", tone: "attention" });
    });
    if (oracle?.status === "stale" || oracle?.status === "missing") next.push({ id: "oracle-feed", title: "Oracle feed needs attention", href: "#app/protect", tone: "attention" });
    if ((numberValue(reserve?.utilizationBps) || 0) >= 7_500) next.push({ id: "reserve-capacity", title: "Reserve utilization is elevated", href: "#app/protect", tone: "attention" });
    return next;
  }, [data.positions, oracle?.status, reserve?.utilizationBps]);
  useEffect(() => { if (notificationPermission !== "granted" || !alerts.length || typeof Notification === "undefined") return; const next = alerts.find((alert) => !notifiedRef.current.has(alert.id)); if (next) { notifiedRef.current.add(next.id); new Notification("CoverFi alert", { body: "Open CoverFi to review a position or protocol status." }); } }, [alerts, notificationPermission]);
  async function enableNotifications() { if (typeof Notification !== "undefined") setNotificationPermission(await Notification.requestPermission()); }

  const incidents = Array.isArray(operations?.incidents) ? operations!.incidents.slice(0, 5) : [];
  const maintenance = Array.isArray(operations?.scheduledMaintenances) ? operations!.scheduledMaintenances.slice(0, 5) : [];
  const statusUrl = safeExternalUrl(asRecord(operations?.page)?.url);

  return <DashboardLayout title="Protocol status" subtitle="Live reserve, oracle, and operations." sidebarItems={sidebarItems} username={username || "New user"} walletAddress={walletAddress} network={network} onNetworkChange={setNetwork} onLogout={onLogout}>
    <section className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
      <GlassCard><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.28em] text-[#E1E0CC]/40">Reserve pool</p><h2 className="mt-3 font-serif text-3xl italic text-[#E1E0CC]">Live contract values</h2></div><StatusBadge status={text(reserve?.status)} /></div><div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Total assets" value={atomic(pool?.total_assets)} /><Metric label="Locked liabilities" value={atomic(pool?.locked_liabilities)} /><Metric label="Available liquidity" value={atomic(reserve?.availableLiquidity)} /><Metric label="Utilization" value={bps(reserve?.utilizationBps)} /></div><div className="mt-3 grid gap-3 sm:grid-cols-3"><Metric label="Reserved claims" value={atomic(pool?.reserved_claims)} /><Metric label="Unearned premiums" value={atomic(pool?.unearned_premiums)} /><Metric label="Provider NAV" value={atomic(reserve?.providerNav)} /></div></GlassCard>
      <GlassCard><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.28em] text-[#E1E0CC]/40">Oracle</p><h2 className="mt-3 font-serif text-3xl italic text-[#E1E0CC]">Current observation</h2></div><StatusBadge status={text(oracle?.status)} /></div><div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><Metric label="Price (oracle scale)" value={atomic(oracle?.price)} /><Metric label="Observation age" value={age(oracle?.ageSeconds)} /><Metric label="Freshness window" value={age(oracle?.maxAgeSeconds)} /></div><div className="mt-5 flex items-center gap-2 text-xs text-[#E1E0CC]/50"><Radio className="h-4 w-4 text-violet-200" /> {text(oracle?.source)}</div></GlassCard>
    </section>
    <section className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <GlassCard><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.28em] text-[#E1E0CC]/40">Alerts</p><h2 className="mt-3 font-serif text-3xl italic text-[#E1E0CC]">Action queue</h2></div><PrimaryButton onClick={enableNotifications} disabled={notificationPermission === "granted" || notificationPermission === "unsupported"} variant="outline"><BellRing className="h-4 w-4" />{notificationPermission === "granted" ? "Enabled" : notificationPermission === "unsupported" ? "Unsupported" : "Enable alerts"}</PrimaryButton></div><div className="mt-5 space-y-2">{alerts.length ? alerts.map((alert) => <a key={alert.id} href={alert.href} className="flex items-center gap-3 rounded-xl border border-[#E1E0CC]/10 bg-black/25 p-3 text-sm text-[#E1E0CC]/75 hover:border-[#E1E0CC]/30">{alert.tone === "ready" ? <CheckCircle2 className="h-4 w-4 text-emerald-200" /> : <CircleAlert className="h-4 w-4 text-amber-100" />} {alert.title}</a>) : <p className="rounded-xl border border-dashed border-[#E1E0CC]/15 p-4 text-sm text-[#E1E0CC]/45">No active alerts.</p>}</div></GlassCard>
      <GlassCard><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.28em] text-[#E1E0CC]/40">Operations</p><h2 className="mt-3 font-serif text-3xl italic text-[#E1E0CC]">Status page</h2></div><StatusBadge status={text(operations?.status)} /></div><div className="mt-5 space-y-2">{incidents.concat(maintenance).length ? incidents.concat(maintenance).map((entry, index) => { const item = asRecord(entry); return <div key={`${text(item?.id, "status")}-${index}`} className="rounded-xl border border-[#E1E0CC]/10 bg-black/25 p-3"><p className="text-sm text-[#E1E0CC]">{text(item?.name || item?.title)}</p><p className="mt-1 text-xs text-[#E1E0CC]/45">{text(item?.status || item?.scheduled_for || item?.scheduledFor)}</p></div>; }) : <p className="rounded-xl border border-dashed border-[#E1E0CC]/15 p-4 text-sm text-[#E1E0CC]/45">No incidents or maintenance returned.</p>}</div>{statusUrl && <a href={statusUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex text-xs uppercase tracking-widest text-violet-200">Open status page</a>}<div className="mt-5 flex items-center gap-2 text-xs text-[#E1E0CC]/40"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Updated {updatedAt || "—"}</div></GlassCard>
    </section>
  </DashboardLayout>;
}
