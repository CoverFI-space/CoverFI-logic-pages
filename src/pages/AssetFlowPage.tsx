import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Database,
  Fingerprint,
  LockKeyhole,
  Network,
  ShieldCheck,
  Sparkles,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { DashboardLayout } from "../components/dashboard/DashboardComponents";
import { useDepositFree } from "../context/AppContext";
import AssetFlowActions, { type FlowNodeState } from "./AssetFlowActions";
import "./AssetFlowPage.css";

type FlowKind = "protect" | "username";
type FlowNode = {
  id: string;
  title: string;
  eyebrow: string;
  x: number;
  y: number;
  icon: typeof ShieldCheck;
  accent: "mint" | "violet" | "gold" | "blue";
};

const protectNodes: FlowNode[] = [
  { id: "wallet", title: "Your wallet", eyebrow: "You approve", x: 64, y: 286, icon: WalletCards, accent: "mint" },
  { id: "engine", title: "Protection Engine", eyebrow: "Creates position", x: 324, y: 286, icon: Network, accent: "violet" },
  { id: "principal-vault", title: "Protected Balance Vault", eyebrow: "Your principal", x: 626, y: 100, icon: LockKeyhole, accent: "blue" },
  { id: "reserve-vault", title: "Reserve Vault", eyebrow: "Premium + payout capacity", x: 626, y: 470, icon: Database, accent: "gold" },
  { id: "settlement", title: "Settlement", eyebrow: "At expiry", x: 970, y: 286, icon: CheckCircle2, accent: "mint" },
];

const usernameNodes: FlowNode[] = [
  { id: "username-wallet", title: "Your wallet", eyebrow: "You approve", x: 64, y: 286, icon: WalletCards, accent: "mint" },
  { id: "registry", title: "Username Registry", eyebrow: "Name record", x: 324, y: 286, icon: Fingerprint, accent: "violet" },
  { id: "fee-routing", title: "Fee routing", eyebrow: "Registration only", x: 622, y: 100, icon: CircleDollarSign, accent: "gold" },
  { id: "lookup", title: "Recipient lookup", eyebrow: "Before payment", x: 622, y: 470, icon: UserRound, accent: "blue" },
  { id: "payment", title: "Signed payment", eyebrow: "You confirm", x: 970, y: 286, icon: ArrowRight, accent: "mint" },
];

function FlowNodeCard({ node, state, onActivate }: { node: FlowNode; state: FlowNodeState; onActivate: () => void }) {
  const Icon = node.icon;
  return (
    <div role="button" tabIndex={0} data-flow-node aria-label={`${node.title}: ${state}. Open the form below`} onClick={onActivate} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onActivate(); } }} className={`flow-node flow-node-${node.accent} flow-node-state-${state.toLowerCase()}`} style={{ left: node.x, top: node.y }}>
      <span className="flow-node-icon"><Icon size={21} strokeWidth={1.9} /></span>
      <span className="flow-node-copy"><span className="flow-node-eyebrow">{node.eyebrow}</span><strong>{node.title}</strong></span>
      <span className="flow-node-select">{state}</span>
    </div>
  );
}

function FixedConnectors({ flow }: { flow: FlowKind }) {
  const paths = flow === "protect"
    ? ["M270 343 H324", "M536 343 C578 343 568 179 626 179", "M536 343 C578 343 568 549 626 549", "M882 179 C932 179 916 343 970 343", "M882 549 C932 549 916 343 970 343"]
    : ["M270 343 H324", "M536 343 C578 343 568 179 622 179", "M536 343 C578 343 568 549 622 549", "M878 179 C932 179 916 343 970 343", "M878 549 C932 549 916 343 970 343"];
  return <svg className="flow-connectors" viewBox="0 0 1230 720" aria-hidden="true"><defs><linearGradient id="flow-line" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#60e6cf" stopOpacity="0.84" /><stop offset="1" stopColor="#b49cff" stopOpacity="0.64" /></linearGradient><marker id="flow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#b8a8fa" /></marker></defs>{paths.map((path) => <path key={path} d={path} markerEnd="url(#flow-arrow)" />)}</svg>;
}

export default function AssetFlowPage({ username, walletAddress, onLogout }: { username: string; walletAddress: string; onLogout: () => void }) {
  const { network, setNetwork } = useDepositFree();
  const [flow, setFlow] = useState<FlowKind>("protect");
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.74);
  const [isPanning, setIsPanning] = useState(false);
  const [nodeStates, setNodeStates] = useState<Record<string, FlowNodeState>>({});
  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const nodes = flow === "protect" ? protectNodes : usernameNodes;

  useEffect(() => { setOffset({ x: 0, y: 0 }); setZoom(0.74); setNodeStates({}); }, [flow]);

  function startPan(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button, [data-flow-node]")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
    setIsPanning(true);
  }
  function movePan(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    setOffset({ x: Math.max(-180, Math.min(180, dragRef.current.offsetX + event.clientX - dragRef.current.x)), y: Math.max(-80, Math.min(100, dragRef.current.offsetY + event.clientY - dragRef.current.y)) });
  }
  function endPan() { dragRef.current = null; setIsPanning(false); }
  function openFlowForm() { actionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }

  return (
    <DashboardLayout
      title="Asset flow"
      subtitle="A fixed, zoomed-out map of each signed flow. Node badges reflect the live step created by the form below; arrows and routing cannot be changed."
      sidebarItems={["Dashboard", "Portfolio", "Protect", "Asset Flow", "Positions", "Claims", "Pay Username", "History", "Profile"]}
      username={username || "New user"} walletAddress={walletAddress} network={network} onNetworkChange={setNetwork} onLogout={onLogout}
    >
      <div className="flow-topbar">
        <div className="flow-switcher" role="tablist" aria-label="Asset flow type">
          <button type="button" role="tab" aria-selected={flow === "protect"} onClick={() => setFlow("protect")}>Protect / deposit</button>
          <button type="button" role="tab" aria-selected={flow === "username"} onClick={() => setFlow("username")}>Usernames & payments</button>
        </div>
        <div className="flow-lock-note"><LockKeyhole size={15} /> Fixed protocol flow · arrows cannot be changed</div>
      </div>
      <div className="flow-layout">
        <section className={`flow-canvas ${isPanning ? "flow-canvas-panning" : ""}`} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan} aria-label="Read-only contract asset flow canvas">
          <div className="flow-canvas-grid" />
          <div className="flow-canvas-hint"><Sparkles size={15} /> Zoomed out · drag to explore</div>
          <div className="flow-zoom-controls"><button type="button" onClick={() => setZoom((value) => Math.max(0.55, Number((value - 0.08).toFixed(2))))} aria-label="Zoom out canvas">−</button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((value) => Math.min(0.9, Number((value + 0.08).toFixed(2))))} aria-label="Zoom in canvas">+</button></div>
          <div className="flow-surface" style={{ transform: `translate(calc(-50% + ${offset.x}px), ${offset.y}px) scale(${zoom})` }}>
            <FixedConnectors flow={flow} />
            {nodes.map((node) => <FlowNodeCard key={node.id} node={node} state={nodeStates[node.id] || (node.id.includes("wallet") ? "Ready" : "Idle")} onActivate={openFlowForm} />)}
          </div>
        </section>
      </div>
      <div ref={actionsRef} className="scroll-mt-6"><AssetFlowActions flow={flow} username={username} walletAddress={walletAddress} onNodeStates={setNodeStates} /></div>
    </DashboardLayout>
  );
}
