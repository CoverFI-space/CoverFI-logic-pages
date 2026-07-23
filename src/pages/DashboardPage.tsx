import {
  AlertTriangle,
  Activity,
  Calculator,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  KeyRound,
  Mail,
  QrCode,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  WalletCards,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  DashboardLayout,
  DataTable,
  EmptyState,
  FormInput,
  GlassCard,
  PrimaryButton,
  StatCard,
  StatusBadge,
} from "../components/dashboard/DashboardComponents";
import {
  getAppHomeRoute,
  useDepositFree,
} from "../context/AppContext";
import {
  clearStoredSession,
  getStoredSession,
  saveContractUsername,
  updateStoredSession,
  type PrismaSession,
} from "../lib/usernameStore";
import {
  claimProtectionPayoutOnChain,
  createProtectionPositionOnChain,
  getProtectionQuoteOnChain,
  getPayoutAssetBalanceOnChain,
  getWalletUsernameOnChain,
  getUsernameAddressOnChain,
  getReserveClaimDetails,
  getDefaultProtectionAsset,
  getProtectionAssetOptions,
  registerUsernameOnChain,
  recordZkProofOnChain,
  preflightProtectionPositionOnChain,
  createPaymentReceiptOnChain,
  type ReserveClaimDetails,
  settleProtectionPositionOnChain,
  sendUsernamePayment,
  trustPayoutAssetOnChain,
  withdrawProtectionPrincipalOnChain,
} from "../lib/stellarContracts";
import { getApiUrl } from "../lib/api";
import { connectWallet, createBackendWalletSession, signWalletAuthMessage } from "../lib/freighter";
import {
  clearEmbeddedWalletSession,
  createEmailWalletSignatureProof,
} from "../lib/embeddedWallet";
import { publicStatusUrl } from "../lib/links";
import {
  asReceiptData,
  loadPaymentHistoryWithIndex,
  saveLocalPaymentHistory,
} from "../lib/localRecords";
import { getUserKycStatus, startUserKycVerification } from "../lib/diditKyc";
import {
  clearPrivateStorage,
  exportPrivateStorage,
  lockPrivateStorage,
  readPrivateRecord,
  removePrivateRecord,
  unlockPrivateStorage,
  writePrivateRecord,
} from "../lib/encryptedStorage";
import { PrinterReceipt, ReceiptPaper } from "../components/PrinterReceipt";
import type { ReceiptData } from "../components/PrinterReceipt";
import { CoverFiQrCode } from "../components/CoverFiQrCode";
import { AuthenticatorQrCode } from "../components/AuthenticatorQrCode";
import { CodeBoxes } from "../components/CodeBoxes";
import type { ProtectionPosition, UserProfile } from "../context/AppContext";

const feeRates: Record<string, number> = {
  "1": 0.003,
  "7": 0.01,
  "14": 0.015,
  "30": 0.025,
};

const durationChoices = [
  { value: "1", label: "1 day", hint: "0.30% premium" },
  { value: "7", label: "7 days", hint: "1.00% premium" },
  { value: "14", label: "14 days", hint: "1.50% premium" },
  { value: "30", label: "30 days", hint: "2.50% premium" },
];

const protectionDraftStorageKey = "coverfi_protection_draft";
const highValueVerificationUsd = Number(import.meta.env.VITE_HIGH_VALUE_VERIFICATION_USD || 100);
const receiptPrintFeeCftusd = Number(import.meta.env.VITE_RECEIPT_PRINT_FEE_CFTUSD || 0.1);
const walletSignedComplianceVerifierHash =
  "ad7382453e717eec0da14fd84840f2ad1f7468b4fe8fe70d58dc576016112492";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

async function readJsonResponse(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || data?.error?.message || `Request failed with ${response.status}.`);
  }
  return data;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

type WalletProofPayload = {
  message: string;
  digest: string;
  signature: string;
  signer: string;
  scheme: string;
};

async function anchorWalletProofOnChain(input: {
  userAddress: string;
  network: "testnet" | "mainnet";
  circuitId: string;
  proof: WalletProofPayload;
  publicSignals: Record<string, unknown>;
}) {
  return recordZkProofOnChain({
    userAddress: input.userAddress,
    network: input.network,
    circuitIdHash: await sha256Hex(input.circuitId),
    commitmentHash: await sha256Hex(
      `${input.circuitId}:${input.userAddress}:${input.proof.digest}`,
    ),
    publicInputsHash: await sha256Hex(JSON.stringify(input.publicSignals)),
    proofHash: await sha256Hex(JSON.stringify(input.proof)),
    verifierHash: walletSignedComplianceVerifierHash,
  });
}

async function recordReceiptOwnershipProof(input: {
  walletAddress: string;
  network: "testnet" | "mainnet";
  paymentTxHash: string;
  receiptTxHash: string;
  receiptHash: string;
  receiverAddress: string;
}) {
  const purpose = "coverfi.receipt_ownership.v0";
  const issuedAt = new Date().toISOString();
  const message = [
    purpose,
    `network=${input.network}`,
    `wallet=${input.walletAddress}`,
    `paymentTxHash=${input.paymentTxHash}`,
    `receiptTxHash=${input.receiptTxHash}`,
    `receiptHash=${input.receiptHash}`,
    `receiver=${input.receiverAddress}`,
    `issuedAt=${issuedAt}`,
  ].join("\n");
  const digest = await sha256Hex(message);
  const signature = await signWalletAuthMessage(message, input.walletAddress);
  const proof = {
    message,
    digest,
    signature,
    signer: input.walletAddress,
    scheme: "freighter-ed25519-message",
  };

  const response = await fetch(getApiUrl("/api/zk/proofs/record"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subjectRef: input.walletAddress,
      circuitId: purpose,
      proofSystem: "stellar-ed25519",
      proof,
      publicSignals: {
        network: input.network,
        walletAddress: input.walletAddress,
        paymentTxHash: input.paymentTxHash,
        receiptTxHash: input.receiptTxHash,
        receiptHash: input.receiptHash,
      },
    }),
  });
  await readJsonResponse(response);
  return proof;
}

function isStaleOracleText(value: unknown) {
  return String(value || "").toLowerCase().includes("oracle price is stale");
}

function staleOraclePauseMessage() {
  return "Oracle observation is stale. New quotes and positions are paused until an authorized oracle publisher updates the feed.";
}

function usd(value: number) {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function assetSymbolFromLabel(asset: string) {
  return asset.split(/\s+/)[0]?.toUpperCase() || "ASSET";
}

function tokenUnits(value: number) {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US", { maximumFractionDigits: 7 });
}

function tokenUnitsFromStroops(value: string | number | bigint, symbol: string) {
  const units = Number(value) / 10_000_000;
  return `${tokenUnits(units)} ${symbol}`;
}

function tokenQuote(value: number, symbol: string, usdPrice: number) {
  const units = `${tokenUnits(value)} ${symbol}`;
  if (!Number.isFinite(usdPrice) || usdPrice <= 0) return units;
  return `${units} (${usd(value * usdPrice)})`;
}

const coingeckoPriceIds: Record<string, string> = {
  AQUA: "aquarius",
  EURC: "euro-coin",
  PYUSD: "paypal-usd",
  USDC: "usd-coin",
  USDT: "tether",
  XLM: "stellar",
};

function shouldUsePriceBackend() {
  const configured = String(import.meta.env.VITE_API_BASE_URL || "").trim();
  return Boolean(
    configured &&
      !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(configured),
  );
}

async function fetchDirectUsdPrice(asset: string) {
  const symbol = assetSymbolFromLabel(asset);
  const id = coingeckoPriceIds[symbol];

  if (!id) {
    throw new Error(`No direct USD price feed is configured for ${symbol}.`);
  }

  const url = new URL("https://api.coingecko.com/api/v3/simple/price");
  url.searchParams.set("ids", id);
  url.searchParams.set("vs_currencies", "usd");
  url.searchParams.set("include_last_updated_at", "true");
  url.searchParams.set("precision", "full");

  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json().catch(() => null);
  const price = Number(data?.[id]?.usd);

  if (!response.ok || !Number.isFinite(price) || price <= 0) {
    throw new Error(data?.error || `Could not fetch ${symbol} price.`);
  }

  return {
    symbol,
    price,
    provider: "CoinGecko direct",
    lastUpdatedAt: data?.[id]?.last_updated_at
      ? Number(data[id].last_updated_at) * 1000
      : null,
  };
}

async function fetchBackendUsdPrice(asset: string) {
  const response = await fetch(
    getApiUrl(`/api/prices/${encodeURIComponent(asset)}`),
  );
  const data = await response.json().catch(() => null);
  const price = Number(data?.price);

  if (!response.ok || !Number.isFinite(price) || price <= 0) {
    throw new Error(data?.message || "Could not fetch current price.");
  }

  return {
    symbol: String(data.symbol || assetSymbolFromLabel(asset)),
    price,
    provider: String(data.provider || "Live feed"),
    lastUpdatedAt: data.lastUpdatedAt || null,
  };
}

function fallbackUsdPrice(asset: string, errors: unknown[]) {
  const symbol = assetSymbolFromLabel(asset);
  const stableFallbacks = new Set(["EURC", "PYUSD", "USDC", "USDT"]);
  const price = symbol === "XLM"
    ? 0.1
    : stableFallbacks.has(symbol)
      ? 1
      : 0;

  if (!price) {
    const firstError = errors.find((error) => error instanceof Error) as Error | undefined;
    throw new Error(firstError?.message || `Could not fetch ${symbol} price.`);
  }

  return {
    symbol,
    price,
    provider: "Fallback estimate",
    lastUpdatedAt: null,
  };
}

async function fetchUsdPrice(asset: string) {
  const errors: unknown[] = [];

  try {
    return await fetchBackendUsdPrice(asset);
  } catch (error) {
    errors.push(error);
  }

  try {
    return await fetchDirectUsdPrice(asset);
  } catch (error) {
    errors.push(error);
  }

  return fallbackUsdPrice(asset, errors);
}

async function requestTestCftusd(walletAddress: string) {
  const session = getStoredSession();
  const response = await fetch(getApiUrl("/api/onboarding/testnet/cftusd/fund"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CoverFi-Wallet-Address": walletAddress,
      ...(session?.backendSessionToken ? { Authorization: `Bearer ${session.backendSessionToken}` } : {}),
    },
    body: JSON.stringify({ walletAddress, amount: "5" }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || "Could not fund test CFTUSD.");
  }
  return data;
}

type DashboardRiskAsset = {
  symbol: string;
  label: string;
  price: number;
  change24h: number | null;
  peg?: number;
  status: string;
  detail: string;
  tone: "good" | "watch" | "bad";
};

type DashboardRiskData = {
  assets: DashboardRiskAsset[];
  provider: string;
  lastFetchedAt: number;
};

const dashboardRiskFeeds = [
  { symbol: "USDC", label: "USDC", id: "usd-coin", peg: 1 },
  { symbol: "USDT", label: "USDT", id: "tether", peg: 1 },
  { symbol: "PYUSD", label: "PYUSD", id: "paypal-usd", peg: 1 },
  { symbol: "XLM", label: "XLM", id: "stellar" },
];

function riskToneClass(tone: DashboardRiskAsset["tone"]) {
  if (tone === "good") return "border-emerald-200/20 bg-emerald-200/10 text-emerald-100";
  if (tone === "watch") return "border-amber-200/20 bg-amber-200/10 text-amber-100";
  return "border-red-200/20 bg-red-200/10 text-red-100";
}

function evaluateDashboardRisk(feed: (typeof dashboardRiskFeeds)[number], price: number, change24h: number | null): Omit<DashboardRiskAsset, "symbol" | "label" | "price" | "change24h" | "peg"> {
  if (feed.peg) {
    const deviationBps = Math.abs(price - feed.peg) * 10_000;
    if (deviationBps <= 30) {
      return {
        status: "Healthy",
        detail: `${deviationBps.toFixed(1)} bps from peg`,
        tone: "good",
      };
    }
    if (deviationBps <= 100) {
      return {
        status: "Watch",
        detail: `${deviationBps.toFixed(1)} bps from peg`,
        tone: "watch",
      };
    }
    return {
      status: "Off peg",
      detail: `${deviationBps.toFixed(1)} bps from peg`,
      tone: "bad",
    };
  }

  const move = Math.abs(change24h ?? 0);
  if (move <= 3) {
    return { status: "Calm", detail: `${percent(change24h)} 24h`, tone: "good" };
  }
  if (move <= 8) {
    return { status: "Moving", detail: `${percent(change24h)} 24h`, tone: "watch" };
  }
  return { status: "Volatile", detail: `${percent(change24h)} 24h`, tone: "bad" };
}

async function fetchDirectDashboardRisk(): Promise<DashboardRiskData> {
  const url = new URL("https://api.coingecko.com/api/v3/simple/price");
  url.searchParams.set("ids", dashboardRiskFeeds.map((feed) => feed.id).join(","));
  url.searchParams.set("vs_currencies", "usd");
  url.searchParams.set("include_24hr_change", "true");
  url.searchParams.set("include_last_updated_at", "true");
  url.searchParams.set("precision", "full");

  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data) {
    throw new Error(data?.error || "Could not fetch risk data.");
  }

  const assets = dashboardRiskFeeds
    .map((feed) => {
      const record = data?.[feed.id];
      const price = Number(record?.usd);
      if (!Number.isFinite(price) || price <= 0) return null;
      const change24h = Number(record?.usd_24h_change);
      const safeChange24h = Number.isFinite(change24h) ? change24h : null;
      return {
        symbol: feed.symbol,
        label: feed.label,
        price,
        change24h: safeChange24h,
        peg: feed.peg,
        ...evaluateDashboardRisk(feed, price, safeChange24h),
      };
    })
    .filter(Boolean) as DashboardRiskAsset[];

  if (!assets.length) {
    throw new Error("Risk feed returned no usable assets.");
  }

  return {
    assets,
    provider: "CoinGecko direct",
    lastFetchedAt: Date.now(),
  };
}

async function fetchBackendDashboardRisk(): Promise<DashboardRiskData> {
  const assets = await Promise.all(
    dashboardRiskFeeds.map(async (feed) => {
      const response = await fetch(getApiUrl(`/api/prices/${encodeURIComponent(`${feed.symbol} Stellar`)}`));
      const data = await response.json().catch(() => null);
      const price = Number(data?.price);
      if (!response.ok || !Number.isFinite(price) || price <= 0) {
        throw new Error(data?.message || `Could not fetch ${feed.symbol}.`);
      }
      const change24h = Number(data?.change24h);
      const safeChange24h = Number.isFinite(change24h) ? change24h : null;
      return {
        symbol: feed.symbol,
        label: feed.label,
        price,
        change24h: safeChange24h,
        peg: feed.peg,
        ...evaluateDashboardRisk(feed, price, safeChange24h),
      };
    }),
  );

  return {
    assets,
    provider: "CoinGecko",
    lastFetchedAt: Date.now(),
  };
}

async function fetchDashboardRisk(): Promise<DashboardRiskData> {
  if (shouldUsePriceBackend()) {
    try {
      return await fetchBackendDashboardRisk();
    } catch (error) {
      console.error("[CoverFi risk feed]", error);
    }
  }

  return fetchDirectDashboardRisk();
}

function compactText(value: string, head = 8, tail = 8) {
  if (!value || value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function stellarExpertTxUrl(hash: string, network: "testnet" | "mainnet") {
  return `https://stellar.expert/explorer/${network === "mainnet" ? "public" : "testnet"}/tx/${hash}`;
}

function timeLeft(expiryTime: string) {
  const ms = new Date(expiryTime).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  return `${days}d ${hours}h`;
}

function countdownLabel(ms: number) {
  if (ms <= 0) return "Expired";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function isPastExpiry(position: ProtectionPosition) {
  return new Date(position.expiryTime).getTime() <= Date.now();
}

function displayPositionStatus(position: ProtectionPosition) {
  if (position.status === "Active" && isPastExpiry(position)) return "Ready to settle";
  if (position.status === "AwaitingOracle") return "Awaiting oracle";
  if (position.status === "SettledNoPayout") return "Settled - no payout";
  if (position.status === "PrincipalWithdrawn") return "Principal withdrawn";
  return position.status;
}

function Toast() {
  const { toast, setToast } = useDepositFree();

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [setToast, toast]);

  if (!toast) return null;

  return (
    <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[#E1E0CC]/15 bg-black/85 px-5 py-3 text-sm text-[#E1E0CC] shadow-2xl backdrop-blur-xl">
      {toast}
    </div>
  );
}

function AppShell({
  username,
  walletAddress,
  title,
  subtitle,
  children,
  onLogout,
}: {
  username: string;
  walletAddress: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  onLogout: () => void;
}) {
  const { network, setNetwork } = useDepositFree();

  return (
    <DashboardLayout
      title={title}
      subtitle={subtitle}
      sidebarItems={[
        "Dashboard",
        "Portfolio",
        "Protect",
        "Asset Flow",
        "Positions",
        "Claims",
        "Pay Username",
        "History",
        "QR Service",
        "Protocol Status",
        "Profile",
      ]}
      username={username || "New user"}
      walletAddress={walletAddress}
      network={network}
      onNetworkChange={setNetwork}
      onLogout={onLogout}>
      {children}
    </DashboardLayout>
  );
}

function Dashboard({
  username,
  walletAddress,
  onLogout,
  loginMethod,
  onWalletLinked,
}: {
  username: string;
  walletAddress: string;
  onLogout: () => void;
  loginMethod?: PrismaSession["loginMethod"];
  onWalletLinked: (session: PrismaSession) => void;
}) {
  const { data, network } = useDepositFree();
  const requiresRealWallet = loginMethod === "email";
  const [riskData, setRiskData] = useState<DashboardRiskData | null>(null);
  const [riskLoading, setRiskLoading] = useState(true);
  const [riskStatus, setRiskStatus] = useState("");
  const active = data.positions.filter(
    (position) => displayPositionStatus(position) === "Active",
  );
  const claimable = data.positions.reduce(
    (sum, position) =>
      position.status === "Claimable" && !position.payoutClaimed
        ? sum + position.claimableAmount
        : sum,
    0,
  );
  const totalProtected = data.positions.reduce(
    (sum, position) => sum + position.protectedAmount,
    0,
  );
  const totalFees = data.positions.reduce(
    (sum, position) => sum + position.feePaid,
    0,
  );

  async function loadRiskData() {
    setRiskLoading(true);
    setRiskStatus("");

    try {
      const nextRiskData = await fetchDashboardRisk();
      setRiskData(nextRiskData);
    } catch (error) {
      console.error("[CoverFi dashboard risk]", error);
      setRiskData(null);
      setRiskStatus(
        error instanceof Error ? error.message : "Could not fetch risk data.",
      );
    } finally {
      setRiskLoading(false);
    }
  }

  useEffect(() => {
    loadRiskData();
  }, []);

  return (
    <AppShell
      username={username}
      walletAddress={walletAddress}
      title={`Welcome back, ${username || "New user"}.`}
      subtitle={`Stablecoin Protection Dashboard connected to ${shortAddress(walletAddress)}.`}
      onLogout={onLogout}>
      {requiresRealWallet && (
        <div className="mb-5">
          <WalletUpgradePanel
            title="Connect a wallet to use CoverFi transactions."
            description="Your email login is active. To create protection, claim payouts, withdraw principal, pay usernames, or print paid receipts, connect a Stellar wallet so every transaction is reviewed and signed by your wallet."
            onLinked={onWalletLinked}
          />
        </div>
      )}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total Protected"
          value={usd(totalProtected)}
          icon={<ShieldCheck className="h-5 w-5" />}
        />
        <StatCard
          label="Active Positions"
          value={String(active.length)}
          icon={<Clock3 className="h-5 w-5" />}
        />
        <StatCard
          label="Protection Fees"
          value={usd(totalFees)}
          icon={<CircleDollarSign className="h-5 w-5" />}
        />
        <StatCard
          label="Claimable Payout"
          value={usd(claimable)}
          icon={<TrendingDown className="h-5 w-5" />}
        />
        <StatCard
          label="Expired Positions"
          value={String(
            data.positions.filter(
              (position) =>
                displayPositionStatus(position) === "Ready to settle" ||
                position.status === "AwaitingOracle",
            ).length,
          )}
          icon={<FileText className="h-5 w-5" />}
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <GlassCard className="flex h-[560px] flex-col md:h-[600px]">
          <div className="flex shrink-0 items-center justify-between border-b border-[#E1E0CC]/10 pb-4">
            <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">
              Active Protection
            </p>
            <span className="rounded-full border border-emerald-200/20 bg-emerald-200/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-100/80">{active.length} live</span>
          </div>
          <div className="coverfi-scroll mt-4 grid min-h-0 flex-1 content-start gap-4 overflow-y-auto pr-2">
            {active.length ? (
              active.map((position) => (
                <PositionCard key={position.id} position={position} />
              ))
            ) : (
              <EmptyState
                title="No active Protection Positions"
                description="Create a position from Protect to start tracking protected amount, fee, entry price, and expiry timer."
              />
            )}
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">
              Stablecoin Risk
            </p>
            <button
              type="button"
              onClick={loadRiskData}
              disabled={riskLoading}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#E1E0CC]/15 text-[#E1E0CC]/60 transition-colors hover:bg-[#E1E0CC] hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
              title="Refresh risk data">
              <RefreshCw className={`h-4 w-4 ${riskLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
          {riskLoading ? (
            <div className="mt-5 rounded-2xl border border-[#E1E0CC]/10 bg-black/30 p-5 text-sm text-[#E1E0CC]/55">
              Fetching market health...
            </div>
          ) : riskData?.assets.length ? (
            <div className="mt-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-[0.2em] text-[#E1E0CC]/35">
                <span>{riskData.provider}</span>
                <span>{new Date(riskData.lastFetchedAt).toLocaleTimeString()}</span>
              </div>
              {riskData.assets.map((asset) => (
                <div
                  key={asset.symbol}
                  className="rounded-2xl border border-[#E1E0CC]/10 bg-black/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[#E1E0CC]">
                        {asset.label}
                      </p>
                      <p className="mt-1 text-xs text-[#E1E0CC]/45">
                        {asset.peg ? asset.detail : `${asset.detail} move`}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${riskToneClass(asset.tone)}`}>
                      {asset.status}
                    </span>
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <p className="text-2xl text-[#E1E0CC]">
                      {marketUsd(asset.price)}
                    </p>
                    <p className={`${asset.change24h && asset.change24h < 0 ? "text-red-200" : "text-emerald-200"} text-sm`}>
                      {percent(asset.change24h)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5">
              <EmptyState
                title="Price feed unavailable"
                description={riskStatus || "Could not load CoinGecko market data."}
              />
            </div>
          )}
        </GlassCard>
      </div>

      {network === "testnet" && !requiresRealWallet && (
        <TestnetFaucets walletAddress={walletAddress} />
      )}

      <GlassCard className="mt-5">
        <p className="mb-5 text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">
          Recent Activity
        </p>
        {data.activity.length ? (
          <DataTable
            headers={["Time", "Activity"]}
            rows={data.activity.map((activity) => [
              activity.createdAt,
              activity.label,
            ])}
          />
        ) : (
          <EmptyState
            title="No activity yet"
            description="Actions you perform in this app will appear here."
          />
        )}
      </GlassCard>
    </AppShell>
  );
}

function TestnetFaucets({ walletAddress }: { walletAddress: string }) {
  const friendbotUrl = `https://friendbot.stellar.org?addr=${encodeURIComponent(walletAddress)}`;

  return (
    <section className="mt-5 rounded-2xl bg-[#E1E0CC]/5 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">
            Stellar Testnet Faucets
          </p>
          <h2 className="mt-2 font-serif text-4xl italic">
            Fund this wallet on Testnet.
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-[#E1E0CC]/55">
            These links are shown only while Testnet is selected.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a
            href={friendbotUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-[#E1E0CC] px-5 py-3 text-xs uppercase tracking-widest text-black transition-transform hover:scale-[1.02]">
            Friendbot
            <ExternalLink className="h-4 w-4" />
          </a>
          <a
            href="https://laboratory.stellar.org/#account-creator?network=test"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-[#E1E0CC]/30 px-5 py-3 text-xs uppercase tracking-widest text-[#E1E0CC] transition-colors hover:bg-[#E1E0CC] hover:text-black">
            Laboratory
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

function PositionCard({ position }: { position: ProtectionPosition }) {
  return (
    <div className="rounded-2xl border border-[#E1E0CC]/10 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-serif text-4xl italic text-[#E1E0CC]">
            {position.asset}
          </p>
          <p className="mt-2 text-sm text-[#E1E0CC]/50">{position.id}</p>
        </div>
        <StatusBadge status={displayPositionStatus(position)} />
      </div>
      <div className="mt-5 grid gap-3 text-sm md:grid-cols-3">
        <Info label="Protected Amount" value={usd(position.protectedAmount)} />
        <Info label="Protection Fee" value={usd(position.feePaid)} />
        <Info label="Entry Price" value={`$${position.entryPrice}`} />
        <Info label="Current Price" value={`$${position.currentPrice}`} />
        <Info label="Expiry Timer" value={timeLeft(position.expiryTime)} />
        <Info label="Claimable Payout" value={usd(position.claimableAmount)} />
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#E1E0CC]/10 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-[#E1E0CC]/35">
        {label}
      </p>
      <p className="mt-2 text-[#E1E0CC]">{value}</p>
    </div>
  );
}

function Protect({
  username,
  walletAddress,
  onLogout,
  loginMethod,
  onWalletLinked,
}: {
  username: string;
  walletAddress: string;
  onLogout: () => void;
  loginMethod?: PrismaSession["loginMethod"];
  onWalletLinked: (session: PrismaSession) => void;
}) {
  const { createPosition, network } = useDepositFree();
  const requiresRealWallet = loginMethod === "email";
  const [asset, setAsset] = useState(() => getDefaultProtectionAsset("testnet"));
  const [coinPickerOpen, setCoinPickerOpen] = useState(false);
  const [durationPickerOpen, setDurationPickerOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [duration, setDuration] = useState("7");
  const [currentPrice, setCurrentPrice] = useState("");
  const [priceStatus, setPriceStatus] = useState("");
  const [priceLoading, setPriceLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [priceUpdatedAt, setPriceUpdatedAt] = useState("");
  const [priceProvider, setPriceProvider] = useState("");
  const [contractQuote, setContractQuote] = useState<Awaited<ReturnType<typeof getProtectionQuoteOnChain>> | null>(null);
  const [canCreatePosition, setCanCreatePosition] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteStatus, setQuoteStatus] = useState("");
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const createSubmittingRef = useRef(false);

  const protectedAmount = Number(amount) || 0;
  const feePaid = Number((protectedAmount * feeRates[duration]).toFixed(2));
  const livePrice = Number(currentPrice) || 0;
  const selectedAssetSymbol = assetSymbolFromLabel(asset);
  const minimumProtectedAmount = livePrice > 0
    ? Math.ceil((1 / livePrice) * 100) / 100
    : 0;
  const belowMinimumNotional = selectedAssetSymbol === "XLM" &&
    minimumProtectedAmount > 0 &&
    protectedAmount > 0 &&
    protectedAmount < minimumProtectedAmount;
  const selectedDuration =
    durationChoices.find((choice) => choice.value === duration) ??
    durationChoices[1];
  const currentUsdValue = protectedAmount * livePrice;
  const maxPayoutEstimate = contractQuote?.maximumPayout ?? Number((protectedAmount * 0.1).toFixed(2));
  const protectionFeeEstimate = contractQuote?.totalDue ?? feePaid;
  const expiryTime = useMemo(() => {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + Number(duration));
    return expiry.toISOString();
  }, [duration]);

  async function fetchCurrentPrice(nextAsset = asset) {
    setPriceLoading(true);
    setPriceStatus("");

    try {
      const data = await fetchUsdPrice(nextAsset);
      const nextPrice = Number(data.price);

      setCurrentPrice(String(Number(nextPrice.toFixed(8))));
      setPriceProvider(data.provider || "Live feed");
      setPriceUpdatedAt(
        data.lastUpdatedAt ? new Date(data.lastUpdatedAt).toLocaleString() : "",
      );
      setPriceStatus(
        data.provider === "Fallback estimate"
          ? `${data.symbol} live price feed is unavailable, so the dashboard is showing a fallback estimate. The contract captures the oracle quote when you sign.`
          : `${data.symbol} price fetched from ${data.provider || "live feed"}.`,
      );
    } catch (error) {
      setCurrentPrice("");
      setPriceProvider("");
      setPriceUpdatedAt("");
      setPriceStatus(
        error instanceof Error
          ? error.message
          : "Could not fetch current price.",
      );
    } finally {
      setPriceLoading(false);
    }
  }

  async function ensureTestPremiumTokenReady() {
    if (network !== "testnet") return;

    setPriceStatus("Checking test CFTUSD premium balance.");
    const balance = await getPayoutAssetBalanceOnChain({
      userAddress: walletAddress,
      network,
    });

    if (balance === null) {
      setPriceStatus("Creating the test CFTUSD trustline. Your wallet will ask you to sign.");
      await trustPayoutAssetOnChain({ userAddress: walletAddress, network });
      setPriceStatus("Trustline created. Funding your wallet with test CFTUSD.");
      await requestTestCftusd(walletAddress);
      return;
    }

    if (balance < 1) {
      setPriceStatus("Funding your wallet with test CFTUSD for the protection premium.");
      await requestTestCftusd(walletAddress);
    }
  }

  useEffect(() => {
    fetchCurrentPrice(asset);
  }, [asset]);

  useEffect(() => {
    let cancelled = false;
    void readPrivateRecord<{
      asset?: string;
      amount?: number;
      duration?: string;
    }>(protectionDraftStorageKey)
      .then(async (draft) => {
        if (cancelled || !draft) return;
        if (draft.asset) setAsset(draft.asset);
        if (draft.amount) setAmount(String(draft.amount));
        if (draft.duration) setDuration(draft.duration);
        setPriceStatus("Encrypted protection draft loaded from CoverFi AI. Review every field before signing.");
        await removePrivateRecord(protectionDraftStorageKey);
      })
      .catch(() => {
        // Drafts are optional; a storage failure must not block direct protection creation.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const options = getProtectionAssetOptions(network);
    const selected = options.find((option) => option.label === asset);
    if (!selected?.configured) {
      setAsset(getDefaultProtectionAsset(network));
    }
  }, [asset, network]);

  useEffect(() => {
    let cancelled = false;

    setContractQuote(null);
    setCanCreatePosition(false);
    setQuoteStatus("");

    if (!protectedAmount || protectedAmount <= 0) {
      setQuoteLoading(false);
      return;
    }

    if (belowMinimumNotional) {
      setQuoteLoading(false);
      setCanCreatePosition(false);
      setQuoteStatus(`Minimum protected amount is about ${tokenUnits(minimumProtectedAmount)} ${selectedAssetSymbol} for the 1 CFTUSD contract minimum.`);
      return;
    }

    setQuoteLoading(true);
    const timer = window.setTimeout(() => {
      const quoteInput = {
        userAddress: walletAddress,
        network,
        asset,
        protectedAmount,
        durationSeconds: Number(duration) * 86400,
      };
      const loadQuote = async () => {
        try {
          return await getProtectionQuoteOnChain(quoteInput);
        } catch (error) {
          if (isStaleOracleText(error)) throw new Error(staleOraclePauseMessage());
          throw error;
        }
      };

      void loadQuote()
        .then((quote) => {
          if (cancelled) return;
          setContractQuote(quote);
          setCanCreatePosition(true);
          setQuoteStatus("Protection quote is available.");
          if (quote.entryPrice > 0) {
            setCurrentPrice(String(Number(quote.entryPrice.toFixed(8))));
            setPriceProvider("Soroban oracle");
          }
        })
        .catch((error) => {
          if (cancelled) return;
          const quoteMessage = error instanceof Error
            ? error.message
            : "Contract quote is unavailable for this amount.";
          const runPreflight = async () => {
            try {
              await preflightProtectionPositionOnChain(quoteInput);
            } catch (preflightError) {
              if (isStaleOracleText(preflightError)) {
                throw new Error(staleOraclePauseMessage());
              }
              throw preflightError;
            }
          };
          return runPreflight()
            .then(() => {
              if (cancelled) return;
              setCanCreatePosition(true);
              setQuoteStatus("Quote preview is not available on this deployment, but contract preflight passed.");
            })
            .catch((preflightError) => {
              if (cancelled) return;
              setContractQuote(null);
              setCanCreatePosition(false);
              setQuoteStatus(
                preflightError instanceof Error
                  ? preflightError.message
                : quoteMessage,
              );
            });
        })
        .finally(() => {
          if (!cancelled) setQuoteLoading(false);
        });
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [asset, belowMinimumNotional, duration, minimumProtectedAmount, network, protectedAmount, selectedAssetSymbol, walletAddress]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (createSubmittingRef.current) {
      return;
    }

    createSubmittingRef.current = true;
    setCreateLoading(true);
    setPriceStatus(
      "Checking your protection quote before preparing the transaction.",
    );

    try {
      if (belowMinimumNotional) {
        throw new Error(`Minimum protected amount is about ${tokenUnits(minimumProtectedAmount)} ${selectedAssetSymbol} for the 1 CFTUSD contract minimum.`);
      }

      await ensureTestPremiumTokenReady();
      const createInput = {
        userAddress: walletAddress,
        network,
        asset,
        protectedAmount,
        durationSeconds: Number(duration) * 86400,
      };
      try {
        await preflightProtectionPositionOnChain(createInput);
      } catch (preflightError) {
        if (isStaleOracleText(preflightError)) throw new Error(staleOraclePauseMessage());
        throw preflightError;
      }
      setPriceStatus(
        "Preparing contract transaction. Your selected wallet will ask you to review and sign.",
      );
      let receipt: Awaited<ReturnType<typeof createProtectionPositionOnChain>>;
      try {
        receipt = await createProtectionPositionOnChain(createInput);
      } catch (createError) {
        if (isStaleOracleText(createError)) throw new Error(staleOraclePauseMessage());
        throw createError;
      }
      const displayPrice = Number(currentPrice) || 1;

      createPosition({
        asset,
        protectedAmount,
        feePaid,
        entryPrice: displayPrice,
        currentPrice: displayPrice,
        expiryTime,
        contractPositionId: receipt.contractPositionId,
        transactionHash: receipt.transactionHash,
        assetContractId: receipt.assetContractId,
        payoutAssetContractId: receipt.payoutAssetContractId,
      });

      // Show printer receipt animation
      setReceiptData({
        status: 'Success',
        from: `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
        to: `Protection Contract`,
        amount: `${protectedAmount} ${asset.split(' ')[0]}`,
        fee: `${feePaid} ${asset.split(' ')[0]}`,
        txHash: receipt.transactionHash,
        date: new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
      });
    } catch (error) {
      setPriceStatus(
        error instanceof Error
          ? error.message
          : "Could not create contract position.",
      );
    } finally {
      createSubmittingRef.current = false;
      setCreateLoading(false);
    }
  }

  return (
    <>
      {receiptData && (
        <PrinterReceipt
          receiptData={receiptData}
          onClose={() => setReceiptData(null)}
        />
      )}
    <AppShell
      username={username}
      walletAddress={walletAddress}
      title="Protection checkout."
      subtitle="Review the protection details, quote, and expiry before your wallet signs."
      onLogout={onLogout}>
      {requiresRealWallet ? (
        <WalletUpgradePanel
          title="Connect a wallet before creating protection."
          description="Email login lets you enter CoverFi, but protection positions move assets and must be signed by your own Stellar wallet. Connect a wallet here, then open protection from that public key."
          onLinked={onWalletLinked}
        />
      ) : (
      <>
      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <form
          onSubmit={submit}
          className="rounded-3xl border border-[#E1E0CC]/12 bg-[linear-gradient(145deg,rgba(28,27,34,.96),rgba(9,9,12,.96))] p-5 shadow-[0_20px_70px_rgba(0,0,0,.24)] md:p-6">
          <div className="flex flex-col gap-4 border-b border-[#E1E0CC]/10 pb-5 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">
                Protection request
              </p>
              <h2 className="mt-2 font-serif text-4xl italic text-[#E1E0CC]">
                Review before signing.
              </h2>
            </div>
            <button
              type="button"
              onClick={() => fetchCurrentPrice()}
              disabled={priceLoading || createLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E1E0CC]/20 px-4 py-3 text-xs uppercase tracking-widest text-[#E1E0CC]/70 transition-colors hover:bg-[#E1E0CC] hover:text-black disabled:cursor-not-allowed disabled:opacity-60">
              <RefreshCw
                className={`h-4 w-4 ${priceLoading ? "animate-spin" : ""}`}
              />
              Refresh price
            </button>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <span className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">
                Stablecoin asset
              </span>
              <button
                type="button"
                onClick={() => setCoinPickerOpen(true)}
                className="mt-3 flex w-full items-center justify-between rounded-xl border border-[#E1E0CC]/12 bg-black/35 px-4 py-4 text-left text-sm text-[#E1E0CC] outline-none transition-colors hover:border-[#E1E0CC]/35">
                <span>{asset}</span>
                <span className="text-[#E1E0CC]/40">Change coin</span>
              </button>
            </div>
            <FormInput
              label={`Amount to protect (${selectedAssetSymbol})`}
              value={amount}
              onChange={setAmount}
              type="number"
            />

            <div className="block">
              <span className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">
                Duration
              </span>
              <button
                type="button"
                onClick={() => setDurationPickerOpen(true)}
                className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-[#E1E0CC]/12 bg-black/35 px-4 py-4 text-left text-sm text-[#E1E0CC] outline-none transition-colors hover:border-[#E1E0CC]/35">
                <span className="min-w-0">
                  <span className="block">{selectedDuration.label}</span>
                  <span className="mt-1 block text-[10px] uppercase tracking-[0.2em] text-[#E1E0CC]/40">
                    {selectedDuration.hint}
                  </span>
                </span>
                <span className="shrink-0 text-[#E1E0CC]/40">
                  Change duration
                </span>
              </button>
            </div>

            <div className="md:col-span-2 rounded-2xl border border-[#E1E0CC]/10 bg-black/30 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">
                    Current USD price / {selectedAssetSymbol}
                  </p>
                  <p className="mt-2 text-4xl text-[#E1E0CC]">
                    {priceLoading
                      ? "Fetching..."
                      : livePrice
                        ? `$${livePrice.toFixed(6)}`
                        : "Unavailable"}
                  </p>
                  {priceProvider && (
                    <p className="mt-2 text-sm text-[#E1E0CC]/45">
                      {priceProvider}
                      {priceUpdatedAt ? ` / ${priceUpdatedAt}` : ""}
                    </p>
                  )}
                </div>
              </div>
              {priceStatus && (
                <p
                  className={`mt-4 flex items-center gap-2 text-sm ${livePrice ? "text-[#E1E0CC]/55" : "text-amber-100/75"}`}>
                  {!livePrice && <AlertTriangle className="h-4 w-4" />}
                  {priceStatus}
                </p>
              )}
              {protectedAmount > 0 && quoteStatus && (
                <p
                  className={`mt-3 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
                    canCreatePosition
                      ? "border-emerald-200/15 bg-emerald-200/10 text-emerald-100/80"
                      : "border-amber-200/20 bg-amber-200/10 text-amber-100/85"
                  }`}>
                  {!canCreatePosition && <AlertTriangle className="h-4 w-4 shrink-0" />}
                  {quoteStatus}
                </p>
              )}
            </div>
          </div>

          <PrimaryButton
            type="submit"
            disabled={
              !protectedAmount ||
              priceLoading ||
              quoteLoading ||
              belowMinimumNotional ||
              !canCreatePosition ||
              createLoading
            }
            className="mt-5 w-full">
            {createLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {createLoading
              ? "Confirming Contract Position"
              : quoteLoading
                ? "Checking Reserve"
              : "Create Contract Position"}
          </PrimaryButton>
        </form>

        <aside className="grid gap-5">
          <div className="rounded-3xl border border-[#E1E0CC]/12 bg-[linear-gradient(145deg,rgba(19,19,24,.94),rgba(7,7,9,.95))] p-5 shadow-[0_20px_70px_rgba(0,0,0,.2)] md:p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">
              Live quote
            </p>
            <div className="mt-5 grid gap-3">
              <Info
                label="Protection fee"
                value={tokenQuote(protectionFeeEstimate, selectedAssetSymbol, livePrice)}
              />
              {contractQuote && (
                <>
                  <Info label="Base premium" value={tokenQuote(contractQuote.basePremium, selectedAssetSymbol, livePrice)} />
                  <Info label="Volatility adjustment" value={tokenQuote(contractQuote.volatilitySurcharge, selectedAssetSymbol, livePrice)} />
                  <Info label="Utilization adjustment" value={tokenQuote(contractQuote.utilizationSurcharge, selectedAssetSymbol, livePrice)} />
                  <Info label="Concentration adjustment" value={tokenQuote(contractQuote.concentrationSurcharge, selectedAssetSymbol, livePrice)} />
                </>
              )}
              <Info
                label="Protected amount"
                value={tokenQuote(protectedAmount, selectedAssetSymbol, livePrice)}
              />
              <Info label="Current USD value" value={usd(currentUsdValue)} />
              <Info label="Estimated max payout cap" value={tokenQuote(maxPayoutEstimate, selectedAssetSymbol, livePrice)} />
              <Info
                label="Position check"
                value={
                  quoteLoading
                    ? "Checking"
                    : canCreatePosition
                      ? contractQuote
                        ? `Ready (${(contractQuote.concentrationBps / 100).toFixed(2)}% concentration)`
                        : "Ready"
                      : protectedAmount
                        ? "Blocked"
                        : "Enter amount"
                }
              />
              <Info
                label="Expiry"
                value={new Date(expiryTime).toLocaleString()}
              />
            </div>
          </div>

        </aside>
      </section>
      {coinPickerOpen && (
        <CoinPicker
          selected={asset}
          network={network}
          onClose={() => setCoinPickerOpen(false)}
          onSelect={(coin) => {
            setAsset(coin);
            setCoinPickerOpen(false);
          }}
        />
      )}
      {durationPickerOpen && (
        <DurationPicker
          selected={duration}
          onClose={() => setDurationPickerOpen(false)}
          onSelect={(nextDuration) => {
            setDuration(nextDuration);
            setDurationPickerOpen(false);
          }}
        />
      )}
      </>
      )}
    </AppShell>
    </>
  );
}

function DurationPicker({
  selected,
  onSelect,
  onClose,
}: {
  selected: string;
  onSelect: (duration: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-[#E1E0CC]/15 bg-black p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">
              Protection duration
            </p>
            <h3 className="mt-2 font-serif text-4xl italic text-[#E1E0CC]">
              Choose duration.
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#E1E0CC]/15 p-3 text-[#E1E0CC]/70 hover:bg-[#E1E0CC] hover:text-black"
            aria-label="Close duration picker">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {durationChoices.map((choice) => {
            const active = selected === choice.value;

            return (
              <button
                key={choice.value}
                type="button"
                onClick={() => onSelect(choice.value)}
                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-4 text-left transition-colors ${
                  active
                    ? "border-[#E1E0CC]/60 bg-[#E1E0CC] text-black"
                    : "border-[#E1E0CC]/12 text-[#E1E0CC]/75 hover:border-[#E1E0CC]/35 hover:bg-[#E1E0CC]/10"
                }`}>
                <span>
                  <span className="block text-sm">{choice.label}</span>
                  <span className="mt-1 block text-[10px] uppercase tracking-[0.18em] opacity-60">
                    {choice.hint}
                  </span>
                </span>
                {active && <Check className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CoinPicker({
  selected,
  network,
  onSelect,
  onClose,
}: {
  selected: string;
  network: "testnet" | "mainnet";
  onSelect: (coin: string) => void;
  onClose: () => void;
}) {
  const coins = getProtectionAssetOptions(network);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-[#E1E0CC]/15 bg-black p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">
              Change coin
            </p>
            <h3 className="mt-2 font-serif text-4xl italic text-[#E1E0CC]">
              Select asset.
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-[#E1E0CC]/15 p-3 text-[#E1E0CC]/70 hover:bg-[#E1E0CC] hover:text-black">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 max-h-[55vh] overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            {coins.map((coin) => (
              <button
                key={coin.label}
                onClick={() => coin.configured && onSelect(coin.label)}
                disabled={!coin.configured}
                title={
                  coin.configured
                    ? coin.label
                    : `Add VITE_${coin.symbol}_${network.toUpperCase()}_CONTRACT_ID or VITE_${coin.symbol}_${network.toUpperCase()}_ISSUER in logic-pages/.env to enable this asset.`
                }
                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${selected === coin.label ? "border-[#E1E0CC]/60 bg-[#E1E0CC] text-black" : "border-[#E1E0CC]/12 text-[#E1E0CC]/75 hover:border-[#E1E0CC]/35 hover:bg-[#E1E0CC]/10"}`}>
                <span>
                  <span className="block">{coin.label}</span>
                  {!coin.configured && (
                    <span className="mt-1 block text-[10px] uppercase tracking-[0.18em] opacity-60">
                      Needs contract ID
                    </span>
                  )}
                </span>
                {selected === coin.label && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Positions({
  username,
  walletAddress,
  onLogout,
}: {
  username: string;
  walletAddress: string;
  onLogout: () => void;
}) {
  const { data, network, refreshPositions, setToast } = useDepositFree();
  const [refreshing, setRefreshing] = useState(false);
  const activeCount = data.positions.filter(
    (position) => displayPositionStatus(position) === "Active",
  ).length;
  const protectedTotal = data.positions.reduce(
    (sum, position) => sum + position.protectedAmount,
    0,
  );
  const chainCount = data.positions.filter(
    (position) => position.contractPositionId,
  ).length;

  async function refreshOnChainPositions() {
    setRefreshing(true);
    try {
      await refreshPositions();
      setToast("On-chain positions refreshed.");
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "Could not refresh on-chain positions.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <AppShell
      username={username}
      walletAddress={walletAddress}
      title="Protection Positions."
      subtitle="Track contract-backed protection, wallet debits, and claim state from one place."
      onLogout={onLogout}>
      <section className="grid gap-5 md:grid-cols-3">
        <StatCard
          label="Total Positions"
          value={String(data.positions.length)}
          detail={`${chainCount} submitted on-chain`}
        />
        <StatCard
          label="Active"
          value={String(activeCount)}
          detail="Live protection windows"
        />
        <StatCard
          label="Protected"
          value={usd(protectedTotal)}
          detail={`Connected to ${shortAddress(walletAddress)}`}
        />
      </section>

      <section className="mt-5">
        <div className="mb-4 flex justify-end">
          <PrimaryButton
            variant="outline"
            disabled={refreshing}
            onClick={() => void refreshOnChainPositions()}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh On-chain"}
          </PrimaryButton>
        </div>
        {data.positions.length ? (
          <div className="grid gap-5">
            {data.positions.map((position) => (
              <article
                key={position.id}
                className="rounded-2xl border border-[#E1E0CC]/10 bg-[#E1E0CC]/5 p-5">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="font-serif text-4xl italic text-[#E1E0CC]">
                        {position.asset}
                      </h2>
                      <StatusBadge status={displayPositionStatus(position)} />
                      {position.transactionHash && (
                        <StatusBadge status="On-chain" />
                      )}
                    </div>
                    <p className="mt-3 text-sm text-[#E1E0CC]/45">
                      {position.contractPositionId
                        ? `Contract position #${position.contractPositionId}`
                        : position.id}
                    </p>
                    {position.transactionHash && (
                      <a
                        href={stellarExpertTxUrl(
                          position.transactionHash,
                          network,
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-2 text-sm text-[#E1E0CC]/65 underline-offset-4 transition-colors hover:text-[#E1E0CC] hover:underline">
                        {compactText(position.transactionHash, 12, 12)}
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                  <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:w-[520px]">
                    <Info
                      label="Protected"
                      value={usd(position.protectedAmount)}
                    />
                    <Info label="Fee paid" value={usd(position.feePaid)} />
                    <Info label="Entry" value={`$${position.entryPrice}`} />
                    <Info
                      label="Settlement"
                      value={position.settlementPrice ? `$${position.settlementPrice}` : "Pending"}
                    />
                    <Info
                      label="Expiry"
                      value={timeLeft(position.expiryTime)}
                    />
                    <Info
                      label="Claimable"
                      value={usd(position.claimableAmount)}
                    />
                  </div>
                </div>

                {position.assetContractId && (
                  <div className="mt-5 rounded-2xl bg-black/30 p-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/35">
                      Asset contract
                    </p>
                    <p
                      className="mt-2 truncate text-sm text-[#E1E0CC]/60"
                      title={position.assetContractId}>
                      {position.assetContractId}
                    </p>
                  </div>
                )}

                {!position.contractPositionId && (
                  <div className="mt-4 rounded-xl border border-amber-200/15 bg-amber-200/5 p-4 text-sm leading-relaxed text-amber-100/70">
                    This browser-local legacy record has no V2 contract position ID and cannot be
                    settled or changed by the app.
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-[#E1E0CC]/5 p-8">
            <EmptyState
              title="No Protection Positions"
              description="Create a contract position from Protect. Nothing is prefilled or seeded."
            />
          </div>
        )}
      </section>
    </AppShell>
  );
}

function Claims({
  username,
  walletAddress,
  onLogout,
  loginMethod,
  onWalletLinked,
}: {
  username: string;
  walletAddress: string;
  onLogout: () => void;
  loginMethod?: PrismaSession["loginMethod"];
  onWalletLinked: (session: PrismaSession) => void;
}) {
  const { data, network, profile, updateProfile, refreshPositions, setToast } = useDepositFree();
  const requiresRealWallet = loginMethod === "email";
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [refreshingReserveId, setRefreshingReserveId] = useState<string | null>(null);
  const [kycBusyId, setKycBusyId] = useState<string | null>(null);
  const [claimMessage, setClaimMessage] = useState("");
  const [reserveClaims, setReserveClaims] = useState<Record<string, ReserveClaimDetails>>({});
  const mfaSigned = Boolean(profile.mfaSignedAt && profile.mfaSigner === walletAddress);
  const kycVerified = profile.kycStatus === "verified" || Boolean(profile.kycVerifiedAt);
  const mfaAnchored = Boolean(mfaSigned && profile.mfaProofAnchoredAt && profile.mfaProofTxHash);
  const kycAnchored = Boolean(
    kycVerified &&
      profile.kycProofAnchoredAt &&
      profile.kycProofTxHash &&
      profile.kycProofSigner === walletAddress,
  );
  const settlementReady = data.positions.filter(
    (position) =>
      Boolean(position.contractPositionId) &&
      ((position.status === "Active" && isPastExpiry(position)) ||
        position.status === "AwaitingOracle"),
  );
  const payoutReady = data.positions.filter(
    (position) =>
      Boolean(position.contractPositionId) &&
      position.status === "Claimable" &&
      !position.payoutClaimed,
  );
  const principalReady = data.positions.filter(
    (position) =>
      Boolean(position.contractPositionId) &&
      !position.principalWithdrawn &&
      ["SettledNoPayout", "Claimable", "Claimed"].includes(position.status),
  );
  const totalClaimable = payoutReady.reduce(
    (sum, position) => sum + position.claimableAmount,
    0,
  );
  const completed = data.positions.filter(
    (position) =>
      Boolean(position.contractPositionId) &&
      Boolean(position.principalWithdrawn) &&
      (Boolean(position.payoutClaimed) || position.claimableAmount <= 0),
  );
  const claimRows = data.positions.filter(
    (position) =>
      Boolean(position.contractPositionId) &&
      (isPastExpiry(position) || position.status !== "Active"),
  );

  useEffect(() => {
    if (requiresRealWallet) return;
    const session = getStoredSession();
    if (!session?.backendSessionToken || kycVerified) return;
    void refreshKycStatus().catch(() => undefined);
  }, [walletAddress, requiresRealWallet]);

  function highValueTotalUsd(position: ProtectionPosition) {
    const principalUsd = position.protectedAmount * (position.entryPrice || 0);
    return principalUsd + Math.max(0, position.claimableAmount || 0);
  }

  function highValueGate(position: ProtectionPosition) {
    const totalUsd = highValueTotalUsd(position);
    const required = Number.isFinite(totalUsd) && totalUsd > highValueVerificationUsd;
    return {
      required,
      totalUsd,
      mfaOk: !required || mfaAnchored,
      kycOk: !required || kycAnchored,
    };
  }

  async function anchorVerifiedKycStatus(status: Awaited<ReturnType<typeof getUserKycStatus>>) {
    if (!status.verified || kycAnchored) return null;
    const circuitId = "coverfi.user_kyc.status.v0";
    const issuedAt = new Date().toISOString();
    const message = [
      circuitId,
      `network=${network}`,
      `wallet=${walletAddress}`,
      `session=${status.session?.id || profile.kycSessionId || ""}`,
      `status=${status.status || "verified"}`,
      `issuedAt=${issuedAt}`,
    ].join("\n");
    const digest = await sha256Hex(message);
    const proof = {
      message,
      digest,
      signature: "",
      signer: walletAddress,
      scheme: "stellar-transaction-auth",
    };
    const publicSignals = {
      network,
      walletAddress,
      status: status.status || "verified",
      sessionId: status.session?.id || profile.kycSessionId || "",
      provider: "didit",
    };
    const anchor = await anchorWalletProofOnChain({
      userAddress: walletAddress,
      network,
      circuitId,
      proof,
      publicSignals,
    });
    return { proof, transactionHash: anchor.transactionHash };
  }

  async function refreshKycStatus() {
    const session = getStoredSession();
    if (!session?.backendSessionToken) return;
    const status = await getUserKycStatus({
      walletAddress,
      backendSessionToken: session.backendSessionToken,
    });
    if (status.verified || status.status) {
      updateProfile({
        ...profile,
        kycStatus: status.status || profile.kycStatus,
        kycVerifiedAt: status.verified ? new Date().toISOString() : profile.kycVerifiedAt,
        kycSessionId: status.session?.id || profile.kycSessionId,
      });
      if (status.verified && !kycAnchored) {
        try {
          setClaimMessage("KYC verified. Anchoring wallet proof on-chain...");
          const anchored = await anchorVerifiedKycStatus(status);
          if (anchored) {
            updateProfile({
              ...profile,
              kycStatus: status.status || profile.kycStatus,
              kycVerifiedAt: status.verified ? new Date().toISOString() : profile.kycVerifiedAt,
              kycSessionId: status.session?.id || profile.kycSessionId,
              kycProofDigest: anchored.proof.digest,
              kycProofTxHash: anchored.transactionHash,
              kycProofAnchoredAt: new Date().toISOString(),
              kycProofSigner: walletAddress,
            });
            setClaimMessage("KYC proof anchored on-chain. You can retry the claim or withdrawal.");
          }
        } catch (error) {
          setClaimMessage(error instanceof Error ? error.message : "KYC is verified, but on-chain proof anchoring failed.");
        }
      }
    }
  }

  async function startKyc(position: ProtectionPosition) {
    const session = getStoredSession();
    if (!session?.backendSessionToken) {
      setClaimMessage("Connect your wallet again to create a secure backend session before KYC.");
      return;
    }

    setKycBusyId(position.id);
    setClaimMessage("Opening Didit KYC for this high-value claim action.");
    try {
      const result = await startUserKycVerification({
        walletAddress,
        backendSessionToken: session.backendSessionToken,
        payoutUsd: highValueTotalUsd(position),
        callbackUrl: window.location.href,
        onComplete: () => {
          void refreshKycStatus().catch(() => undefined);
        },
      });
      updateProfile({
        ...profile,
        kycStatus: result.normalizedStatus || "in_progress",
        kycSessionId: result.sessionId,
      });
      setClaimMessage("Didit KYC opened. After approval, refresh this page or try the action again.");
    } catch (error) {
      setClaimMessage(error instanceof Error ? error.message : "Could not start Didit KYC.");
    } finally {
      setKycBusyId(null);
    }
  }

  function requireHighValueChecks(position: ProtectionPosition) {
    const gate = highValueGate(position);
    if (!gate.required) return true;
    if (!gate.mfaOk) {
      setClaimMessage(`This action is above $${highValueVerificationUsd}. Connect MFA in Profile and anchor it on-chain before claiming or withdrawing.`);
      return false;
    }
    if (!gate.kycOk) {
      setClaimMessage(`This action is above $${highValueVerificationUsd}. Complete Didit KYC and anchor it on-chain before claiming or withdrawing.`);
      return false;
    }
    return true;
  }

  async function refreshAfterTransaction(success: string, transactionHash: string) {
    const compactHash = `${transactionHash.slice(0, 12)}...${transactionHash.slice(-8)}`;
    try {
      await refreshPositions();
      setClaimMessage(`${success} Transaction ${compactHash}`);
    } catch {
      setClaimMessage(
        `${success} Transaction ${compactHash}. On-chain refresh failed; use Refresh On-chain to reload status.`,
      );
    }
  }

  async function refreshReserveClaim(position: ProtectionPosition) {
    if (!position.contractPositionId || !position.payoutAssetContractId) {
      setClaimMessage("Reserve details are only available for contract-backed positions with a payout asset.");
      return;
    }

    setRefreshingReserveId(position.id);
    try {
      const details = await getReserveClaimDetails({
        userAddress: walletAddress,
        network,
        contractPositionId: position.contractPositionId,
        payoutAssetContractId: position.payoutAssetContractId,
      });
      setReserveClaims((current) => ({
        ...current,
        [position.id]: details,
      }));
      setClaimMessage("Position-specific reserve payout refreshed.");
    } catch (error) {
      setClaimMessage(
        error instanceof Error
          ? error.message
          : "Could not read the reserved payout.",
      );
    } finally {
      setRefreshingReserveId(null);
    }
  }

  async function settlePosition(position: ProtectionPosition) {
    if (!position.contractPositionId) {
      setClaimMessage("This record does not have a V2 contract position ID.");
      return;
    }

    const action = `settle:${position.id}`;
    setBusyAction(action);
    setClaimMessage("Preparing expiry settlement. Your selected wallet will ask you to sign.");
    try {
      const receipt = await settleProtectionPositionOnChain({
        userAddress: walletAddress,
        network,
        contractPositionId: position.contractPositionId,
      });
      await refreshAfterTransaction("Expiry settlement submitted.", receipt.transactionHash);
      setToast("Expiry settlement submitted.");
    } catch (error) {
      setClaimMessage(
        error instanceof Error
          ? error.message
          : "Could not settle the expired position.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function claimPayout(position: ProtectionPosition) {
    if (!position.contractPositionId) {
      setClaimMessage("This record does not have a V2 contract position ID.");
      return;
    }
    if (!requireHighValueChecks(position)) return;

    const action = `claim:${position.id}`;
    setBusyAction(action);
    setClaimMessage("Preparing CFTUSD payout claim. Your selected wallet will ask you to sign.");
    try {
      const receipt = await claimProtectionPayoutOnChain({
        userAddress: walletAddress,
        network,
        contractPositionId: position.contractPositionId,
      });
      await refreshAfterTransaction("Payout claimed.", receipt.transactionHash);
      setToast("Payout claimed.");
    } catch (error) {
      setClaimMessage(
        error instanceof Error
          ? error.message
          : "Could not claim the payout.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function withdrawPrincipal(position: ProtectionPosition) {
    if (!position.contractPositionId) {
      setClaimMessage("This record does not have a V2 contract position ID.");
      return;
    }
    if (!requireHighValueChecks(position)) return;

    const action = `principal:${position.id}`;
    setBusyAction(action);
    setClaimMessage("Preparing XLM principal withdrawal. Your selected wallet will ask you to sign.");
    try {
      const receipt = await withdrawProtectionPrincipalOnChain({
        userAddress: walletAddress,
        network,
        contractPositionId: position.contractPositionId,
      });
      await refreshAfterTransaction("Protected principal withdrawn.", receipt.transactionHash);
      setToast("Protected principal withdrawn.");
    } catch (error) {
      setClaimMessage(
        error instanceof Error
          ? error.message
          : "Could not withdraw protected principal.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <AppShell
      username={username}
      walletAddress={walletAddress}
      title="Expiry Settlements & Payouts."
      subtitle="Settle expired positions, claim reserved CFTUSD payouts, and withdraw XLM principal."
      onLogout={onLogout}>
      {requiresRealWallet ? (
        <WalletUpgradePanel
          title="Connect a wallet before claim actions."
          description="Email login can show your CoverFi account, but settlement, payout claims, and principal withdrawals are chain transactions. Connect a Stellar wallet so every action is reviewed and signed from your wallet public key."
          onLinked={onWalletLinked}
        />
      ) : (
      <>
      <div className="mb-5 grid gap-5 md:grid-cols-4">
        <StatCard label="Ready to settle" value={String(settlementReady.length)} />
        <StatCard label="Claimable amount" value={usd(totalClaimable)} />
        <StatCard label="Principal ready" value={String(principalReady.length)} />
        <StatCard label="Completed" value={String(completed.length)} />
      </div>
      <div className="mb-5 grid gap-3 text-sm md:grid-cols-4">
        {[
          ["1", "Expire", "Protection remains active until its fixed expiry time."],
          ["2", "Settle", "Anyone may settle using a valid oracle observation at or before expiry."],
          ["3", "Claim", "The owner claims the full position-specific reserved payout, if any."],
          ["4", "Withdraw", "The owner independently withdraws the protected XLM principal."],
        ].map(([step, label, detail]) => (
          <div key={step} className="rounded-xl border border-[#E1E0CC]/10 bg-[#E1E0CC]/5 p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[#E1E0CC] text-xs font-semibold text-black">
                {step}
              </span>
              <span className="font-medium text-[#E1E0CC]">{label}</span>
            </div>
            <p className="mt-2 leading-relaxed text-[#E1E0CC]/50">{detail}</p>
          </div>
        ))}
      </div>
      <GlassCard>
        {claimMessage && (
          <div className="mb-4 rounded-xl border border-[#E1E0CC]/10 bg-black/25 p-4 text-sm leading-relaxed text-[#E1E0CC]/65">
            {claimMessage}
          </div>
        )}
        {claimRows.length ? (
          <div className="grid gap-4">
            {claimRows.map((position) => {
              const reserve = reserveClaims[position.id];
              const payoutSymbol = network === "testnet" ? "CFTUSD" : "USDC";
              const status = displayPositionStatus(position);
              const canSettle =
                (position.status === "Active" && isPastExpiry(position)) ||
                position.status === "AwaitingOracle";
              const canClaim =
                position.status === "Claimable" && !position.payoutClaimed;
              const canWithdrawPrincipal =
                !position.principalWithdrawn &&
                ["SettledNoPayout", "Claimable", "Claimed"].includes(position.status);
              const showReserve = position.claimableAmount > 0 || Boolean(position.payoutClaimed);
              const positionComplete =
                Boolean(position.principalWithdrawn) &&
                (Boolean(position.payoutClaimed) || position.claimableAmount <= 0);
              const gate = highValueGate(position);
              return (
              <div key={position.id} className="rounded-2xl border border-[#E1E0CC]/10 bg-black/25 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusBadge status={status} />
                      {position.contractPositionId && <StatusBadge status="Contract" />}
                      {position.principalWithdrawn && <StatusBadge status="Principal withdrawn" />}
                      <span className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/35">
                        Position {position.id}
                      </span>
                    </div>
                    <h3 className="mt-3 font-serif text-3xl italic text-[#E1E0CC]">
                      {position.asset}
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#E1E0CC]/55">
                      {position.status === "AwaitingOracle"
                        ? "Settlement is waiting for a valid expiry observation. Retry after the oracle publishes an eligible observation."
                        : canSettle
                          ? "This position has expired and is ready for permissionless V2 settlement."
                          : position.status === "Claimable"
                            ? "Settlement reserved the full calculated payout. Payout and principal are owner-only, independent withdrawals."
                            : position.status === "SettledNoPayout"
                              ? "The expiry price produced no payout. The protected principal is ready to withdraw."
                              : "This position has already completed one or both owner withdrawals."}
                    </p>
                    {gate.required && (
                      <div className="mt-4 rounded-2xl border border-amber-200/20 bg-amber-200/10 p-4 text-sm leading-relaxed text-amber-50/80">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-amber-100/55">
                              High-value verification
                            </p>
                            <p className="mt-2">
                              This action is about {usd(gate.totalUsd)} including principal value and reward.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <StatusBadge status={gate.mfaOk ? "MFA ready" : "MFA required"} />
                            <StatusBadge status={gate.kycOk ? "KYC verified" : "KYC required"} />
                          </div>
                        </div>
                        {!gate.kycOk && (
                          <PrimaryButton
                            type="button"
                            variant="outline"
                            className="mt-3"
                            disabled={kycBusyId === position.id}
                            onClick={() => void startKyc(position)}>
                            <ShieldCheck className="h-4 w-4" />
                            {kycBusyId === position.id ? "Opening KYC..." : "Complete Didit KYC"}
                          </PrimaryButton>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap md:justify-end">
                  {canSettle && (
                    <PrimaryButton
                      disabled={busyAction !== null}
                      onClick={() => void settlePosition(position)}>
                      <ReceiptText className="h-4 w-4" />
                      {busyAction === `settle:${position.id}`
                        ? "Settling..."
                        : position.status === "AwaitingOracle"
                          ? "Retry Settlement"
                          : "Settle Position"}
                    </PrimaryButton>
                  )}
                  {canClaim && (
                    <PrimaryButton
                      disabled={busyAction !== null}
                      onClick={() => void claimPayout(position)}>
                      <CircleDollarSign className="h-4 w-4" />
                      {busyAction === `claim:${position.id}` ? "Claiming..." : "Claim Payout"}
                    </PrimaryButton>
                  )}
                  {canWithdrawPrincipal && (
                    <PrimaryButton
                      variant={canClaim ? "outline" : "solid"}
                      disabled={busyAction !== null}
                      onClick={() => void withdrawPrincipal(position)}>
                      <WalletCards className="h-4 w-4" />
                      {busyAction === `principal:${position.id}`
                        ? "Withdrawing..."
                        : "Withdraw Principal"}
                    </PrimaryButton>
                  )}
                  {!canSettle && !canClaim && !canWithdrawPrincipal && (
                    <PrimaryButton variant="outline" disabled>
                      <CheckCircle2 className="h-4 w-4" />
                      {positionComplete ? "Complete" : "No Action Available"}
                    </PrimaryButton>
                  )}
                  </div>
                </div>
                <div className="mt-5 grid gap-3 text-sm md:grid-cols-3">
                  <Info label="Claimable payout" value={usd(position.claimableAmount)} />
                  <Info label="Maximum payout" value={usd(position.maximumPayout || 0)} />
                  <Info label="Protected amount" value={usd(position.protectedAmount)} />
                  <Info label="Protection fee" value={usd(position.feePaid)} />
                  <Info label="Entry price" value={`$${position.entryPrice}`} />
                  <Info
                    label="Settlement price"
                    value={position.settlementPrice ? `$${position.settlementPrice}` : "Pending"}
                  />
                  <Info label="Expiry" value={timeLeft(position.expiryTime)} />
                  <Info
                    label="Payout"
                    value={position.payoutClaimed ? "Claimed" : position.claimableAmount > 0 ? "Available" : "None"}
                  />
                  <Info
                    label="Principal"
                    value={position.principalWithdrawn ? "Withdrawn" : "Held in vault"}
                  />
                </div>
                {showReserve && (
                  <div className="mt-5 rounded-xl border border-[#E1E0CC]/10 bg-[#E1E0CC]/5 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/35">
                          Position-specific reserve payout
                        </p>
                        <p className="mt-2 text-sm leading-relaxed text-[#E1E0CC]/55">
                          V2 reserves the complete calculated payout during settlement. No epoch
                          close or pro-rata allocation is required.
                        </p>
                      </div>
                      <PrimaryButton
                        variant="outline"
                        disabled={refreshingReserveId === position.id}
                        onClick={() => void refreshReserveClaim(position)}>
                        <RefreshCw className={`h-4 w-4 ${refreshingReserveId === position.id ? "animate-spin" : ""}`} />
                        {refreshingReserveId === position.id ? "Refreshing..." : "Refresh Reserve"}
                      </PrimaryButton>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
                      <Info label="Position ID" value={position.contractPositionId || "Unavailable"} />
                      <Info
                        label="Reserved payout"
                        value={reserve ? tokenUnitsFromStroops(reserve.amount, payoutSymbol) : "Refresh needed"}
                      />
                      <Info
                        label="Available to owner"
                        value={reserve ? tokenUnitsFromStroops(reserve.withdrawableAmount, payoutSymbol) : "Refresh needed"}
                      />
                      <Info
                        label="Reserve record"
                        value={reserve ? (reserve.withdrawn ? "Paid" : "Reserved") : "Refresh needed"}
                      />
                      <Info
                        label="Active position lock"
                        value={reserve ? tokenUnitsFromStroops(reserve.positionLockedAmount, payoutSymbol) : "Refresh needed"}
                      />
                      <Info
                        label="Pool reserved claims"
                        value={reserve ? tokenUnitsFromStroops(reserve.poolReservedClaims, payoutSymbol) : "Refresh needed"}
                      />
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No expired V2 positions"
            description="Expired positions requiring settlement, payout claims, or principal withdrawal will appear here."
          />
        )}
      </GlassCard>
      </>
      )}
    </AppShell>
  );
}

function WalletUpgradePanel({
  title,
  description,
  onLinked,
}: {
  title: string;
  description: string;
  onLinked: (session: PrismaSession) => void;
}) {
  const { data, network, profile, updateProfile, setToast } = useDepositFree();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function signEmailWalletBinding(input: {
    email: string;
    walletAddress: string;
  }) {
    const cleanEmail = input.email.trim().toLowerCase();
    if (!cleanEmail) return null;

    const issuedAt = new Date().toISOString();
    const purpose = "coverfi.profile.email.verified.v1";
    const message = [
      purpose,
      `network=${network}`,
      `wallet=${input.walletAddress}`,
      `email=${cleanEmail}`,
      "challenge=email-login-wallet-link",
      `issuedAt=${issuedAt}`,
    ].join("\n");
    const digest = await sha256Hex(message);
    const signature = await signWalletAuthMessage(message, input.walletAddress);
    const proof = {
      message,
      digest,
      signature,
      signer: input.walletAddress,
      scheme: "freighter-ed25519-message",
    };

    const response = await fetch(getApiUrl("/api/zk/proofs/record"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectRef: input.walletAddress,
        circuitId: purpose,
        proofSystem: "stellar-ed25519",
        proof,
        publicSignals: {
          network,
          walletAddress: input.walletAddress,
          email: cleanEmail,
          binding: "email-wallet-link",
        },
      }),
    });
    await readJsonResponse(response);

    const nextProfile = {
      ...profile,
      email: cleanEmail,
      emailVerifiedAt: profile.emailVerifiedAt || issuedAt,
      emailSignedAt: issuedAt,
      emailSigner: input.walletAddress,
      emailProofDigest: digest,
      emailProofScheme: proof.scheme,
    };
    updateProfile(nextProfile);
    await writePrivateRecord("account", {
      profile: nextProfile,
      data,
      network,
    });
    return proof;
  }

  async function connectRealWallet() {
    setBusy(true);
    setStatus("");

    try {
      const previous = getStoredSession();
      const walletAddress = await connectWallet();
      setStatus("Checking username for the connected wallet...");
      const username = await getWalletUsernameOnChain({
        userAddress: walletAddress,
        network,
      }).catch(() => "");

      setStatus("Sign once to create your secure CoverFi session.");
      const backendSession = await createBackendWalletSession(walletAddress);
      await unlockPrivateStorage(walletAddress, backendSession.storageSignature);
      clearEmbeddedWalletSession();

      const nextSession = updateStoredSession({
        username,
        walletAddress,
        loginMethod: "wallet",
        email: previous?.email,
        network,
        backendSessionToken: backendSession.token,
      });

      if (previous?.loginMethod === "email" && previous.email) {
        setStatus("Sign the email-wallet binding with your connected wallet.");
        await signEmailWalletBinding({
          email: previous.email,
          walletAddress,
        });
      }

      onLinked(nextSession);
      setToast("Wallet public key updated.");
      setStatus(previous?.email
        ? "Wallet connected and email address signed by this public key."
        : "Wallet connected. This public key will now be used for signed actions.");
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not connect wallet.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-amber-200/20 bg-amber-200/10 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-amber-100/55">
            Wallet required
          </p>
          <h3 className="mt-2 text-2xl text-amber-50">{title}</h3>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-amber-100/80">
            {description}
          </p>
          <p className="mt-3 text-xs uppercase tracking-[0.2em] text-amber-100/60">
            Supports Stellar wallet picker, including browser, mobile, hardware, and WalletConnect options.
          </p>
        </div>
        <PrimaryButton
          type="button"
          onClick={connectRealWallet}
          disabled={busy}
          className="shrink-0">
          {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />}
          {busy ? "Connecting..." : "Connect wallet"}
        </PrimaryButton>
      </div>
      {status && (
        <p className="mt-4 rounded-xl border border-amber-100/15 bg-black/20 px-4 py-3 text-sm text-amber-50/80">
          {status}
        </p>
      )}
    </div>
  );
}

function Profile({
  username,
  walletAddress,
  onLogout,
  onUsernameSaved,
  loginMethod,
}: {
  username: string;
  walletAddress: string;
  onLogout: () => void;
  onUsernameSaved: (session: PrismaSession) => void;
  loginMethod?: PrismaSession["loginMethod"];
}) {
  const { data, network, profile, updateProfile, setToast } = useDepositFree();
  const [draft, setDraft] = useState(profile);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameStatus, setUsernameStatus] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [privacyStatus, setPrivacyStatus] = useState("");
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [securityEmail, setSecurityEmail] = useState(profile.email || "");
  const [securityOtpId, setSecurityOtpId] = useState("");
  const [securityOtp, setSecurityOtp] = useState("");
  const [securityMfaChallengeId, setSecurityMfaChallengeId] = useState("");
  const [securityMfaCode, setSecurityMfaCode] = useState("");
  const [securityMfaSecret, setSecurityMfaSecret] = useState("");
  const [securityMfaUrl, setSecurityMfaUrl] = useState("");
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityStatus, setSecurityStatus] = useState("");
  const requiresRealWallet = loginMethod === "email";
  const totalFees = data.positions.reduce(
    (sum, position) => sum + position.feePaid,
    0,
  );
  const claimed = data.positions
    .filter((position) => position.payoutClaimed)
    .reduce((sum, position) => sum + position.claimableAmount, 0);
  const usernameError = useMemo(() => {
    if (!usernameDraft) return "";
    if (usernameDraft.trim().length < 3) return "Use at least 3 characters.";
    if (!/^[a-z0-9_]+$/.test(usernameDraft.trim()))
      return "Use lowercase letters, numbers, and underscores only.";
    return "";
  }, [usernameDraft]);
  const backendSupportEnabled = Boolean(
    String(import.meta.env.VITE_API_BASE_URL || "").trim(),
  );
  const verifiedSecurityEmail = Boolean(profile.email && profile.emailVerifiedAt);
  const emailSigned = Boolean(
    profile.emailSignedAt &&
      profile.emailSigner &&
      profile.emailSigner === walletAddress,
  );
  const mfaSigned = Boolean(
    profile.mfaSignedAt &&
      profile.mfaSigner &&
      profile.mfaSigner === walletAddress,
  );
  const kycVerified = profile.kycStatus === "verified" || Boolean(profile.kycVerifiedAt);
  const mfaAnchored = Boolean(mfaSigned && profile.mfaProofAnchoredAt && profile.mfaProofTxHash);
  const kycAnchored = Boolean(
    kycVerified &&
      profile.kycProofAnchoredAt &&
      profile.kycProofTxHash &&
      profile.kycProofSigner === walletAddress,
  );

  useEffect(() => {
    setDraft(profile);
    setSecurityEmail(profile.email || "");
  }, [profile]);

  async function signAccountSecurityProof(input: {
    kind: "email" | "mfa";
    email: string;
    challenge: string;
  }) {
    const purpose =
      input.kind === "mfa"
        ? "coverfi.profile.mfa.enabled.v1"
        : "coverfi.profile.email.verified.v1";
    let proof: WalletProofPayload & { onChainTxHash?: string };

    if (loginMethod === "email") {
      proof = await createEmailWalletSignatureProof({
        walletAddress,
        network,
        purpose,
        challenge: `${input.email}:${input.challenge}`,
      });
    } else {
      const issuedAt = new Date().toISOString();
      const message = [
        purpose,
        `network=${network}`,
        `wallet=${walletAddress}`,
        `email=${input.email}`,
        `challenge=${input.challenge}`,
        `issuedAt=${issuedAt}`,
      ].join("\n");
      const digest = await sha256Hex(message);
      const signature = await signWalletAuthMessage(message, walletAddress);
      proof = {
        message,
        digest,
        signature,
        signer: walletAddress,
        scheme: "freighter-ed25519-message",
      };
    }

    const response = await fetch(getApiUrl("/api/zk/proofs/record"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectRef: walletAddress,
        circuitId: purpose,
        proofSystem: "stellar-ed25519",
        proof,
        publicSignals: {
          network,
          walletAddress,
          email: input.email,
          binding: input.kind,
        },
      }),
    });
    await readJsonResponse(response);
    if (input.kind === "mfa") {
      const anchor = await anchorWalletProofOnChain({
        userAddress: walletAddress,
        network,
        circuitId: purpose,
        proof,
        publicSignals: {
          network,
          walletAddress,
          email: input.email,
          binding: input.kind,
        },
      });
      proof.onChainTxHash = anchor.transactionHash;
    }
    return proof;
  }

  async function sendSecurityEmailOtp() {
    const cleanEmail = securityEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setSecurityStatus("Enter a valid email address first.");
      return;
    }

    setSecurityBusy(true);
    setSecurityStatus("");
    try {
      const response = await fetch(getApiUrl("/api/onboarding/email/start"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const result = await readJsonResponse(response);
      setSecurityOtpId(String(result.otpId || ""));
      setSecurityOtp("");
      setSecurityMfaChallengeId("");
      setSecurityMfaCode("");
      setSecurityMfaSecret("");
      setSecurityMfaUrl("");
      setSecurityStatus("OTP sent. Enter the email code before this address is verified.");
    } catch (error) {
      setSecurityStatus(
        error instanceof Error ? error.message : "Could not send email OTP.",
      );
    } finally {
      setSecurityBusy(false);
    }
  }

  async function verifySecurityEmailOtp() {
    const cleanEmail = securityEmail.trim().toLowerCase();
    if (!securityOtpId || securityOtp.length !== 6) {
      setSecurityStatus("Enter the six-digit OTP from email.");
      return;
    }

    setSecurityBusy(true);
    setSecurityStatus("Verifying email and signing it to this wallet...");
    try {
      const response = await fetch(getApiUrl("/api/onboarding/email/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          otpId: securityOtpId,
          otp: securityOtp,
        }),
      });
      const result = await readJsonResponse(response);

      if (result.mfaRequired) {
        setSecurityMfaChallengeId(String(result.challengeId || ""));
        setSecurityMfaSecret("");
        setSecurityMfaUrl("");
        setSecurityStatus("Email OTP is valid. Enter your authenticator code to finish verification.");
        return;
      }

      const emailProof = await signAccountSecurityProof({
        kind: "email",
        email: cleanEmail,
        challenge: String(result.challengeId || securityOtpId),
      });
      const verifiedAt = new Date().toISOString();
      const nextProfile: UserProfile = {
        ...profile,
        ...draft,
        email: cleanEmail,
        contact: draft.contact || cleanEmail,
        emailVerifiedAt: verifiedAt,
        emailSignedAt: verifiedAt,
        emailSigner: emailProof.signer,
        emailProofDigest: emailProof.digest,
        emailProofScheme: emailProof.scheme,
      };
      updateProfile(nextProfile);
      setDraft(nextProfile);

      if (result.mfaSetupAvailable) {
        setSecurityMfaChallengeId(String(result.challengeId || ""));
        setSecurityMfaSecret(String(result.secret || ""));
        setSecurityMfaUrl(String(result.otpauthUrl || ""));
        setSecurityStatus("Email verified and signed. Scan the QR to connect MFA to this account.");
        return;
      }

      setSecurityOtpId("");
      setSecurityOtp("");
      setSecurityStatus("Email verified and signed to this wallet.");
      setToast("Email verified.");
    } catch (error) {
      setSecurityStatus(
        error instanceof Error ? error.message : "Could not verify email OTP.",
      );
    } finally {
      setSecurityBusy(false);
    }
  }

  async function verifySecurityMfa() {
    const cleanEmail = securityEmail.trim().toLowerCase();
    if (!securityMfaChallengeId || securityMfaCode.length !== 6) {
      setSecurityStatus("Enter the six-digit authenticator code.");
      return;
    }

    setSecurityBusy(true);
    setSecurityStatus("Verifying MFA and signing it to this wallet...");
    try {
      const response = await fetch(getApiUrl("/api/onboarding/email/mfa/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          challengeId: securityMfaChallengeId,
          code: securityMfaCode,
        }),
      });
      const result = await readJsonResponse(response);
      const challenge = String(
        result.mfaEnrollmentProof || result.challengeId || securityMfaChallengeId,
      );
      const mfaProof = await signAccountSecurityProof({
        kind: "mfa",
        email: cleanEmail,
        challenge,
      });
      const verifiedAt = new Date().toISOString();
      const nextProfile: UserProfile = {
        ...profile,
        ...draft,
        email: cleanEmail,
        contact: draft.contact || cleanEmail,
        emailVerifiedAt: profile.emailVerifiedAt || verifiedAt,
        mfaEnabledAt: verifiedAt,
        mfaSignedAt: verifiedAt,
        mfaSigner: mfaProof.signer,
        mfaProofDigest: mfaProof.digest,
        mfaProofScheme: mfaProof.scheme,
        mfaProofTxHash: mfaProof.onChainTxHash || profile.mfaProofTxHash,
        mfaProofAnchoredAt: mfaProof.onChainTxHash ? verifiedAt : profile.mfaProofAnchoredAt,
      };

      if (
        !profile.emailSignedAt ||
        profile.email !== cleanEmail ||
        profile.emailSigner !== walletAddress
      ) {
        const emailProof = await signAccountSecurityProof({
          kind: "email",
          email: cleanEmail,
          challenge,
        });
        nextProfile.emailSignedAt = verifiedAt;
        nextProfile.emailSigner = emailProof.signer;
        nextProfile.emailProofDigest = emailProof.digest;
        nextProfile.emailProofScheme = emailProof.scheme;
      }

      updateProfile(nextProfile);
      setDraft(nextProfile);
      setSecurityOtpId("");
      setSecurityOtp("");
      setSecurityMfaChallengeId("");
      setSecurityMfaCode("");
      setSecurityMfaSecret("");
      setSecurityMfaUrl("");
      setSecurityStatus("MFA is connected, wallet-signed, and saved to this account.");
      setToast("MFA connected.");
    } catch (error) {
      setSecurityStatus(
        error instanceof Error ? error.message : "Could not verify authenticator code.",
      );
    } finally {
      setSecurityBusy(false);
    }
  }

  async function downloadPrivateData() {
    setPrivacyBusy(true);
    setPrivacyStatus("");
    try {
      const exported = await exportPrivateStorage();
      const blob = new Blob([JSON.stringify(exported, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `coverfi-private-export-${walletAddress.slice(-8)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setPrivacyStatus("Decrypted private records exported to this device.");
    } catch (error) {
      setPrivacyStatus(
        error instanceof Error ? error.message : "Could not export private data.",
      );
    } finally {
      setPrivacyBusy(false);
    }
  }

  async function clearLocalPrivateData() {
    if (!window.confirm("Delete all encrypted CoverFi records for this wallet on this device? On-chain records remain.")) {
      return;
    }

    setPrivacyBusy(true);
    setPrivacyStatus("");
    try {
      await clearPrivateStorage();
      setPrivacyStatus("Encrypted browser records cleared. Reloading the app...");
      window.setTimeout(() => window.location.reload(), 400);
    } catch (error) {
      setPrivacyStatus(
        error instanceof Error ? error.message : "Could not clear private data.",
      );
      setPrivacyBusy(false);
    }
  }

  async function claimUsername(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (username || usernameError || usernameDraft.trim().length < 3) return;
    if (requiresRealWallet) {
      setUsernameStatus("Connect a Stellar wallet first. Username registration must be signed by the wallet public key that will own the username.");
      return;
    }

    setUsernameSaving(true);
    setUsernameStatus("");

    try {
      const registered = await registerUsernameOnChain({
        userAddress: walletAddress,
        network,
        username: usernameDraft,
      });
      const nextSession = saveContractUsername(
        registered.username,
        registered.walletAddress,
      );
      onUsernameSaved(nextSession);
      setUsernameDraft("");
      setToast("Username registered on Soroban.");
    } catch (error) {
      setUsernameStatus(
        error instanceof Error ? error.message : "Could not claim username.",
      );
    } finally {
      setUsernameSaving(false);
    }
  }

  return (
    <AppShell
      username={username}
      walletAddress={walletAddress}
      title="Profile."
      subtitle="Account details tied to your active wallet public key."
      onLogout={onLogout}>
      <section>
        {requiresRealWallet && (
          <div className="mb-6">
            <WalletUpgradePanel
              title="Connect a wallet before claiming a username."
              description="Email login creates a temporary browser wallet for onboarding. Username ownership and payments should use your own Stellar wallet public key, so connect a wallet and CoverFi will update this session to that public key."
              onLinked={onUsernameSaved}
            />
          </div>
        )}
        {!username && !requiresRealWallet && (
          <form
            onSubmit={claimUsername}
            className="mb-6 rounded-2xl border border-[#E1E0CC]/10 bg-[#E1E0CC]/5 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">
              Claim username
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <label>
                <span className="text-sm text-[#E1E0CC]/60">
                  Choose a unique lowercase username. Your selected wallet will register
                  it on the Soroban username contract.
                </span>
                <input
                  value={usernameDraft}
                  onChange={(event) => setUsernameDraft(event.target.value)}
                  placeholder="your_name"
                  className="mt-3 w-full rounded-xl border border-[#E1E0CC]/12 bg-black/35 px-4 py-3 text-sm text-[#E1E0CC] outline-none transition-colors placeholder:text-[#E1E0CC]/25 focus:border-[#E1E0CC]/45"
                />
              </label>
              <PrimaryButton
                type="submit"
                disabled={
                  usernameSaving ||
                  !!usernameError ||
                  usernameDraft.trim().length < 3
                }>
                {usernameSaving ? "Claiming..." : "Claim username"}
              </PrimaryButton>
            </div>
            {(usernameError || usernameStatus) && (
              <p className="mt-3 text-sm text-[#E1E0CC]/55">
                {usernameError || usernameStatus}
              </p>
            )}
          </form>
        )}
        <div className="grid gap-5 md:grid-cols-2">
          <FormInput
            label="Username"
            value={username || "Not claimed yet"}
            onChange={() => undefined}
          />
          <FormInput
            label="Wallet address"
            value={walletAddress}
            onChange={() => undefined}
          />
          <FormInput
            label="Full name"
            value={draft.fullName}
            onChange={(value) =>
              setDraft((current) => ({ ...current, fullName: value }))
            }
          />
          <FormInput
            label="City"
            value={draft.city}
            onChange={(value) =>
              setDraft((current) => ({ ...current, city: value }))
            }
          />
          <FormInput
            label="Email or phone"
            value={draft.contact}
            onChange={(value) =>
              setDraft((current) => ({ ...current, contact: value }))
            }
          />
          <FormInput
            label="Account created"
            value={profile.createdAt}
            onChange={() => undefined}
          />
        </div>
        <div className="mt-6 rounded-2xl border border-[#E1E0CC]/10 bg-black/25 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">
                Account security
              </p>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#E1E0CC]/60">
                Verify an email with OTP before it is attached to this wallet.
                MFA is recorded only after the active account signs and anchors
                the binding. Claims above $100 require on-chain MFA and Didit
                KYC proof anchors before payout or principal transactions.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={verifiedSecurityEmail ? "Email verified" : "Email unverified"} />
              <StatusBadge status={emailSigned ? "Email signed" : "Email unsigned"} />
              <StatusBadge status={mfaAnchored ? "MFA anchored" : mfaSigned ? "MFA signed" : "MFA not connected"} />
              <StatusBadge status={kycAnchored ? "KYC anchored" : kycVerified ? "KYC verified" : profile.kycStatus ? `KYC ${profile.kycStatus}` : "KYC not started"} />
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <label className="grid gap-2 text-sm text-[#E1E0CC]/60">
              Verified security email
              <input
                type="email"
                value={securityEmail}
                onChange={(event) => {
                  setSecurityEmail(event.target.value);
                  setSecurityOtpId("");
                  setSecurityOtp("");
                  setSecurityMfaChallengeId("");
                  setSecurityMfaCode("");
                  setSecurityMfaSecret("");
                  setSecurityMfaUrl("");
                  setSecurityStatus("");
                }}
                placeholder="you@example.com"
                className="h-12 rounded-xl border border-[#E1E0CC]/12 bg-black/35 px-4 text-[#E1E0CC] outline-none transition-colors placeholder:text-[#E1E0CC]/25 focus:border-[#E1E0CC]/45"
              />
            </label>
            <PrimaryButton
              type="button"
              variant="outline"
              disabled={securityBusy}
              onClick={() => void sendSecurityEmailOtp()}>
              {securityBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Send OTP
            </PrimaryButton>
          </div>

          {securityOtpId && (
            <div className="mt-5 grid gap-4 rounded-2xl border border-[#E1E0CC]/10 bg-[#E1E0CC]/5 p-4 md:grid-cols-[1fr_auto] md:items-end">
              <CodeBoxes
                label="Email OTP"
                value={securityOtp}
                onChange={setSecurityOtp}
                disabled={securityBusy}
              />
              <PrimaryButton
                type="button"
                disabled={securityBusy || securityOtp.length !== 6}
                onClick={() => void verifySecurityEmailOtp()}>
                {securityBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Verify email
              </PrimaryButton>
            </div>
          )}

          {securityMfaChallengeId && (
            <div className="mt-5 grid gap-5 rounded-2xl border border-[#E1E0CC]/10 bg-[#E1E0CC]/5 p-4 lg:grid-cols-[280px_1fr]">
              {securityMfaSecret ? (
                <AuthenticatorQrCode
                  value={securityMfaUrl}
                  secret={securityMfaSecret}
                  label="Scan Authenticator"
                  size={240}
                />
              ) : (
                <div className="rounded-2xl border border-[#E1E0CC]/10 bg-black/25 p-5">
                  <div className="flex items-center gap-2 text-sm text-[#E1E0CC]">
                    <ShieldCheck className="h-4 w-4" />
                    Existing authenticator
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-[#E1E0CC]/58">
                    This email already has MFA. Enter the code from your
                    authenticator app to finish attaching it to this wallet.
                  </p>
                </div>
              )}
              <div className="grid content-start gap-4">
                <CodeBoxes
                  label="Authenticator code"
                  value={securityMfaCode}
                  onChange={setSecurityMfaCode}
                  disabled={securityBusy}
                />
                <PrimaryButton
                  type="button"
                  disabled={securityBusy || securityMfaCode.length !== 6}
                  onClick={() => void verifySecurityMfa()}>
                  {securityBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Connect MFA
                </PrimaryButton>
              </div>
            </div>
          )}

          <div className="mt-5 grid gap-3 text-sm leading-relaxed text-[#E1E0CC]/58 md:grid-cols-2">
            <p>
              Security email:{" "}
              <span className="text-[#E1E0CC]">
                {profile.email || "Not verified"}
              </span>
            </p>
            <p>
              Signed by:{" "}
              <span className="text-[#E1E0CC]">
                {mfaSigned ? shortAddress(profile.mfaSigner) : emailSigned ? shortAddress(profile.emailSigner) : "Not signed"}
              </span>
            </p>
            <p>
              Email proof:{" "}
              <span className="text-[#E1E0CC]">
                {profile.emailProofDigest ? `${profile.emailProofDigest.slice(0, 12)}...` : "None"}
              </span>
            </p>
            <p>
              MFA proof:{" "}
              <span className="text-[#E1E0CC]">
                {profile.mfaProofDigest ? `${profile.mfaProofDigest.slice(0, 12)}...` : "None"}
              </span>
            </p>
          </div>
          {securityStatus && (
            <p className="mt-4 rounded-xl border border-[#E1E0CC]/10 bg-black/25 px-4 py-3 text-sm text-[#E1E0CC]/70">
              {securityStatus}
            </p>
          )}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <StatCard
            label="Positions Created"
            value={String(data.positions.length)}
          />
          <StatCard label="Fees Tracked" value={usd(totalFees)} />
          <StatCard label="Payouts Claimed" value={usd(claimed)} />
        </div>
        <div className="mt-6 rounded-2xl border border-[#E1E0CC]/10 bg-black/25 p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">
            Data records
          </p>
          <div className="mt-4 grid gap-3 text-sm leading-relaxed text-[#E1E0CC]/60">
            <p>
              Wallet actions and Soroban transactions remain on-chain and cannot
              be deleted by CoverFi.
            </p>
            <p>
              Private profile, receipt, payment-history, draft, and AI records
              are AES-GCM encrypted in IndexedDB. The key is derived from your
              wallet signature and exists only in memory while this app is unlocked.
            </p>
            <p>
              Optional market-data and AI API support is{" "}
              <span className="text-[#E1E0CC]">
                {backendSupportEnabled ? "enabled" : "not configured"}
              </span>
              . The dApp source of truth for usernames, protection positions,
              claims, receipts, and reserve state is Soroban. The backend does
              not receive or persist private browser history.
            </p>
            <p>
              Export and clear controls below apply to encrypted records on this
              device. Public Stellar and Soroban records are immutable and remain
              visible on the network.
            </p>
            {privacyStatus && <p className="text-[#E1E0CC]">{privacyStatus}</p>}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <PrimaryButton onClick={() => updateProfile(draft)}>
            Save profile
          </PrimaryButton>
          <PrimaryButton
            variant="outline"
            disabled={privacyBusy}
            onClick={() => void downloadPrivateData()}>
            Export private data
          </PrimaryButton>
          <PrimaryButton
            variant="outline"
            disabled={privacyBusy}
            onClick={() => void clearLocalPrivateData()}>
            Clear private data
          </PrimaryButton>
          <a
            href={publicStatusUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E1E0CC]/30 px-4 py-3 text-center text-xs uppercase tracking-widest text-[#E1E0CC] transition-colors hover:bg-[#E1E0CC] hover:text-black sm:px-5">
            <Activity className="h-4 w-4" />
            Public status
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <PrimaryButton variant="outline" onClick={onLogout}>
            Logout
          </PrimaryButton>
        </div>
      </section>
    </AppShell>
  );
}

function PayUsername({
  username,
  walletAddress,
  onLogout,
  loginMethod,
  onWalletLinked,
}: {
  username: string;
  walletAddress: string;
  onLogout: () => void;
  loginMethod?: PrismaSession["loginMethod"];
  onWalletLinked: (session: PrismaSession) => void;
}) {
  type PendingReceiptPrint = {
    transactionHash: string;
    recipientUsername: string;
    receiverAddress: string;
    amount: number;
    asset: string;
    createdAt: string;
    expiresAt: number;
  };

  const { network } = useDepositFree();
  const requiresRealWallet = loginMethod === "email";
  const [recipient, setRecipient] = useState("");
  const [result, setResult] = useState<{
    username: string;
    walletAddress: string;
  } | null>(null);
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [pendingReceipt, setPendingReceipt] = useState<PendingReceiptPrint | null>(null);
  const [receiptMsLeft, setReceiptMsLeft] = useState(0);
  const [savedPayments, setSavedPayments] = useState<Awaited<ReturnType<typeof loadPaymentHistoryWithIndex>>>([]);

  useEffect(() => {
    let cancelled = false;
    void loadPaymentHistoryWithIndex(walletAddress, network)
      .then((payments) => {
        if (!cancelled) setSavedPayments(payments);
      })
      .catch(() => {
        if (!cancelled) setSavedPayments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [walletAddress, network]);

  useEffect(() => {
    if (!pendingReceipt) {
      setReceiptMsLeft(0);
      return;
    }

    const update = () => {
      const next = Math.max(0, pendingReceipt.expiresAt - Date.now());
      setReceiptMsLeft(next);
      if (next === 0) {
        setPendingReceipt(null);
        setStatus("Receipt print window expired. The payment is still complete and saved locally.");
      }
    };

    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [pendingReceipt]);
  const recentRecipients = useMemo(() => {
    const seen = new Set<string>();
    return savedPayments
      .filter((payment) => payment.source !== "stellar-index")
      .map((payment) => String(payment.recipient || "").trim())
      .filter((item) => {
        if (!item || seen.has(item.toLowerCase())) return false;
        seen.add(item.toLowerCase());
        return true;
      })
      .slice(0, 4);
  }, [savedPayments]);
  const sharedHistory = useMemo(() => {
    const selected = result?.username?.toLowerCase() || "";
    if (!selected) return [];

    return savedPayments
      .filter((payment) => {
        const recipientName = String(payment.recipient || "").toLowerCase();
        const receipt = asReceiptData(payment);
        return (
          recipientName === selected ||
          receipt?.to.toLowerCase().includes(selected) === true
        );
      })
      .slice(0, 5);
  }, [result?.username, savedPayments]);

  async function lookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    setStatus("");

    try {
      const data = await getUsernameAddressOnChain({
        userAddress: walletAddress,
        network,
        username: recipient,
      });
      setResult(data);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Username lookup failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handlePay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!result?.walletAddress) return;
    setPaymentLoading(true);
    setStatus("Preparing payment and receipt. Review the resolved Stellar address in your selected wallet before signing.");

    try {
      if (requiresRealWallet) {
        throw new Error("Connect a Stellar wallet before sending username payments.");
      }
      if (!username) {
        throw new Error("Claim a CoverFi username before sending username payments.");
      }

      const parsedAmount = Number(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error("Invalid amount.");
      }

      const txResult = await sendUsernamePayment({
        userAddress: walletAddress,
        network,
        receiverAddress: result.walletAddress,
        amount: parsedAmount,
        asset: "XLM",
      });

      setStatus(`Payment done to @${result.username}. You can print a paid receipt for the next 10 minutes.`);
      
      const finalReceiptData: ReceiptData = {
        status: 'Success',
        from: `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
        to: `${result.username} (${result.walletAddress.slice(0, 6)}...${result.walletAddress.slice(-4)})`,
        amount: `${parsedAmount} XLM`,
        fee: "No receipt printed",
        txHash: txResult.transactionHash,
        date: new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
      };

      const saved = await saveLocalPaymentHistory(walletAddress, {
        id: txResult.transactionHash,
        sender: username,
        recipient: result.username,
        receiptData: finalReceiptData,
        createdAt: new Date().toISOString(),
      });
      setSavedPayments(saved);
      setPendingReceipt({
        transactionHash: txResult.transactionHash,
        recipientUsername: result.username,
        receiverAddress: result.walletAddress,
        amount: parsedAmount,
        asset: "XLM",
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + 10 * 60 * 1000,
      });
      setAmount("");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Payment failed.",
      );
    } finally {
      setPaymentLoading(false);
    }
  }

  async function handlePrintReceipt() {
    if (!pendingReceipt) {
      setStatus("No payment receipt is available to print.");
      return;
    }
    if (Date.now() > pendingReceipt.expiresAt) {
      setPendingReceipt(null);
      setStatus("Receipt print window expired. The payment is still complete and saved locally.");
      return;
    }

    setReceiptLoading(true);
    setStatus("Creating paid receipt. Review the receipt fee in your selected wallet.");

    try {
      if (network === "testnet") {
        setStatus("Checking test CFTUSD receipt-fee balance.");
        const balance = await getPayoutAssetBalanceOnChain({
          userAddress: walletAddress,
          network,
        });
        if (balance === null) {
          setStatus("Creating the test CFTUSD trustline for receipt printing.");
          await trustPayoutAssetOnChain({ userAddress: walletAddress, network });
          setStatus("Trustline created. Funding test CFTUSD for the receipt fee.");
          await requestTestCftusd(walletAddress);
        } else if (balance < receiptPrintFeeCftusd) {
          setStatus("Funding test CFTUSD for the receipt fee.");
          await requestTestCftusd(walletAddress);
        }
        setStatus("Creating paid receipt. Review the receipt fee in your selected wallet.");
      }

      const receiptResult = await createPaymentReceiptOnChain({
        userAddress: walletAddress,
        network,
        receiverAddress: pendingReceipt.receiverAddress,
        amount: pendingReceipt.amount,
        asset: pendingReceipt.asset,
        paymentTxHash: pendingReceipt.transactionHash,
      });
      let proofRecorded = false;
      try {
        setStatus("Receipt anchored. Sign once to record the private receipt ownership proof.");
        await recordReceiptOwnershipProof({
          walletAddress,
          network,
          paymentTxHash: pendingReceipt.transactionHash,
          receiptTxHash: receiptResult.receiptTransactionHash,
          receiptHash: receiptResult.receiptHash,
          receiverAddress: pendingReceipt.receiverAddress,
        });
        proofRecorded = true;
      } catch {
        proofRecorded = false;
      }

      const finalReceiptData: ReceiptData = {
        status: "Success",
        from: `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
        to: `${pendingReceipt.recipientUsername} (${pendingReceipt.receiverAddress.slice(0, 6)}...${pendingReceipt.receiverAddress.slice(-4)})`,
        amount: `${pendingReceipt.amount} ${pendingReceipt.asset}`,
        fee: `${receiptResult.feePaid} CFTUSD receipt fee`,
        txHash: pendingReceipt.transactionHash,
        receiptHash: receiptResult.receiptHash,
        date: new Date(pendingReceipt.createdAt).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }),
      };

      const saved = await saveLocalPaymentHistory(walletAddress, {
        id: pendingReceipt.transactionHash,
        sender: username,
        recipient: pendingReceipt.recipientUsername,
        receiptData: finalReceiptData,
        createdAt: pendingReceipt.createdAt,
      });
      setSavedPayments(saved);
      setReceiptData(finalReceiptData);
      setPendingReceipt(null);
      setStatus(
        proofRecorded
          ? "Receipt printed, anchored on-chain, and ownership proof recorded."
          : "Receipt printed and anchored on-chain. Ownership proof was skipped.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not print receipt.");
    } finally {
      setReceiptLoading(false);
    }
  }

  return (
    <>
      {receiptData && (
        <PrinterReceipt
          receiptData={receiptData}
          onClose={() => {
            setReceiptData(null);
            window.location.hash = '#app/dashboard';
          }}
        />
      )}
      <AppShell
        username={username}
        walletAddress={walletAddress}
        title="Pay Username."
        subtitle="Look up a registered username and send XLM from your connected wallet public key."
        onLogout={onLogout}>
        {requiresRealWallet ? (
          <section>
            <WalletUpgradePanel
              title="Connect a wallet before using username payments."
              description="Email login is enough to enter CoverFi, but username payments require a Stellar wallet so the payment is signed by your own wallet public key. Connect a wallet here and CoverFi will update this session to that public key."
              onLinked={onWalletLinked}
            />
          </section>
        ) : (
        <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="xl:col-span-2">
            <form
              onSubmit={lookup}
              className="rounded-3xl border border-[#E1E0CC]/10 bg-[#E1E0CC]/5 p-4 md:p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">
                Search username
              </p>
              <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[#E1E0CC]/12 bg-black/35 p-2 sm:flex-row sm:items-center">
                <div className="flex min-h-14 flex-1 items-center gap-3 rounded-xl px-3">
                  <Search className="h-4 w-4 shrink-0 text-[#E1E0CC]/45" />
                  <input
                    value={recipient}
                    onChange={(event) => {
                      setRecipient(event.target.value);
                      setResult(null);
                    }}
                    placeholder="Search exact username, for example garvit"
                    className="w-full bg-transparent text-base text-[#E1E0CC] outline-none placeholder:text-[#E1E0CC]/25"
                  />
                </div>
                <PrimaryButton
                  type="submit"
                  disabled={!recipient.trim() || loading}
                  className="shrink-0">
                  <Search className="h-4 w-4" />
                  {loading ? "Searching..." : "Search"}
                </PrimaryButton>
              </div>

              <div className="rounded-b-2xl border-x border-b border-[#E1E0CC]/10 bg-black/25 px-4 py-3">
                {result ? (
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 text-left"
                    onClick={() => setRecipient(result.username)}>
                    <span>
                      <span className="block text-sm text-[#E1E0CC]">
                        @{result.username}
                      </span>
                      <span className="mt-1 block max-w-full truncate text-xs text-[#E1E0CC]/45">
                        {result.walletAddress}
                      </span>
                    </span>
                    <StatusBadge status="Resolved" />
                  </button>
                ) : recentRecipients.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-1 text-xs uppercase tracking-[0.2em] text-[#E1E0CC]/35">
                      Recent
                    </span>
                    {recentRecipients.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setRecipient(item)}
                        className="rounded-full border border-[#E1E0CC]/10 px-3 py-1.5 text-xs text-[#E1E0CC]/65 transition-colors hover:border-[#E1E0CC]/35 hover:text-[#E1E0CC]">
                        @{item}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#E1E0CC]/45">
                    Results and recent recipients appear here after lookup.
                  </p>
                )}
              </div>
            </form>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr] xl:col-span-2">
            <div className="grid gap-5">
              <div className="min-h-44 rounded-3xl border border-[#E1E0CC]/10 bg-[#E1E0CC]/5 p-5">
                {result ? (
                  <>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">
                          Selected person
                        </p>
                        <h3 className="mt-3 font-serif text-5xl italic leading-none text-[#E1E0CC]">
                          @{result.username}
                        </h3>
                      </div>
                      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#E1E0CC] text-black">
                        <WalletCards className="h-6 w-6" />
                      </span>
                    </div>
                    <p
                      className="mt-5 break-all rounded-2xl bg-black/35 px-4 py-3 text-sm text-[#E1E0CC]/70"
                      title={result.walletAddress}>
                      {result.walletAddress}
                    </p>
                    <div className="mt-4 rounded-2xl border border-amber-200/20 bg-amber-200/10 px-4 py-3 text-sm leading-relaxed text-amber-100/85">
                      <p className="text-xs uppercase tracking-[0.2em] text-amber-100/55">
                        Wallet confirmation
                      </p>
                      <p className="mt-2">
                        Your wallet must show this exact destination. After Stellar
                        confirms the payment, CoverFi cannot reverse it.
                      </p>
                    </div>
                  </>
                ) : (
                  <EmptyState
                    title="No person selected"
                    description="Search an exact on-chain username first. The resolved person and wallet verification will appear here."
                  />
                )}
              </div>

              <div className="rounded-3xl border border-[#E1E0CC]/10 bg-black/25 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">
                      Shared history
                    </p>
                    <h3 className="mt-2 text-2xl text-[#E1E0CC]">
                      {result ? `With @${result.username}` : "Pick a person"}
                    </h3>
                  </div>
                  <ReceiptText className="h-5 w-5 text-[#E1E0CC]/45" />
                </div>

                {result && sharedHistory.length > 0 ? (
                  <div className="mt-5 grid gap-3">
                    {sharedHistory.map((payment, index) => {
                      const receipt = asReceiptData(payment);
                      if (!receipt) return null;
                      return (
                        <div
                          key={payment.id || `${receipt.txHash}-${index}`}
                          className="rounded-2xl border border-[#E1E0CC]/10 bg-[#E1E0CC]/5 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm text-[#E1E0CC]">
                              {receipt.amount}
                            </p>
                            <StatusBadge status={receipt.status} />
                          </div>
                          <p className="mt-2 text-xs text-[#E1E0CC]/45">
                            {receipt.date || "Saved locally"}
                          </p>
                          {receipt.txHash && (
                            <p className="mt-2 truncate text-xs text-[#E1E0CC]/35">
                              {receipt.txHash}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-5 rounded-2xl border border-dashed border-[#E1E0CC]/12 p-5 text-sm leading-relaxed text-[#E1E0CC]/45">
                    {result
                      ? "No saved payments with this username on this browser yet."
                      : "After you search, saved payments with that user will show here."}
                  </p>
                )}
              </div>
            </div>

            <form
              onSubmit={handlePay}
              className="h-fit rounded-3xl border border-[#E1E0CC]/10 bg-[#E1E0CC]/5 p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">
                Send XLM
              </p>
              <h3 className="mt-3 text-2xl text-[#E1E0CC]">
                {result ? `Pay @${result.username}` : "Resolve username first"}
              </h3>
              <div className="mt-5">
                <FormInput
                  label="Amount (XLM)"
                  value={amount}
                  onChange={setAmount}
                  type="number"
                  step="any"
                />
              </div>
              <PrimaryButton
                type="submit"
                className="mt-5 w-full"
                disabled={paymentLoading || !amount || !result}>
                <Send className="h-4 w-4" />
                {paymentLoading
                  ? "Confirming..."
                  : `Review ${amount ? `${amount} XLM` : "payment"} in wallet`}
              </PrimaryButton>
              <p className="mt-4 text-sm leading-relaxed text-[#E1E0CC]/45">
                Payment sends first. A receipt is optional and only charges if
                you click Print receipt after the payment is done.
              </p>

              {pendingReceipt && (
                <div className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-emerald-100/55">
                        Payment done
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-emerald-50/85">
                        @{pendingReceipt.recipientUsername} received {pendingReceipt.amount} {pendingReceipt.asset}.
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100/20 px-3 py-1 text-xs text-emerald-50/80">
                      <Clock3 className="h-3.5 w-3.5" />
                      {countdownLabel(receiptMsLeft)}
                    </span>
                  </div>
                  <PrimaryButton
                    type="button"
                    className="mt-4 w-full"
                    disabled={receiptLoading || receiptMsLeft <= 0}
                    onClick={() => void handlePrintReceipt()}>
                    <ReceiptText className="h-4 w-4" />
                    {receiptLoading ? "Creating receipt..." : `Print receipt for ${receiptPrintFeeCftusd} CFTUSD`}
                  </PrimaryButton>
                  <p className="mt-3 text-xs leading-relaxed text-emerald-50/55">
                    Receipt printing is a separate paid on-chain receipt. The print option expires 10 minutes after payment.
                  </p>
                </div>
              )}
            </form>
          </div>
          {status && (
            <p className="xl:col-span-2 rounded-2xl border border-[#E1E0CC]/10 bg-black/25 px-5 py-4 text-sm text-[#E1E0CC]/60">
              {status}
            </p>
          )}
        </section>
        )}
      </AppShell>
    </>
  );
}

type ChatMessage = {
  sender: "user" | "assistant";
  text: string;
};

type PaymentDraft = {
  recipientUsername: string;
  recipientWallet?: string;
  asset: string;
  amount: number;
  processingFeeRate: number;
  processingFee: number;
  totalAmount: number;
  status: "ready" | "missing-recipient" | "not-found";
};

type ProtectionDraft = {
  asset: string;
  amount: number;
  duration: string;
};

function formatAssetAmount(value: number, asset: string) {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 7 })} ${asset}`;
}

function renderMarkdownInline(text: string) {
  return text
    .split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code
            key={`${part}-${index}`}
            className="rounded bg-[#E1E0CC]/10 px-1.5 py-0.5 text-[0.92em] text-[#E1E0CC]">
            {part.slice(1, -1)}
          </code>
        );
      }

      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={`${part}-${index}`} className="font-semibold text-[#E1E0CC]">
            {part.slice(2, -2)}
          </strong>
        );
      }

      return <span key={`${part}-${index}`}>{part}</span>;
    });
}

function MarkdownMessage({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        <pre
          key={`code-${index}`}
          className="overflow-x-auto rounded-xl bg-black/45 p-3 text-xs leading-relaxed text-[#E1E0CC]/80">
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (
      line.includes("|") &&
      index + 1 < lines.length &&
      /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1])
    ) {
      const cells = (value: string) => value.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
      const headers = cells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(cells(lines[index]));
        index += 1;
      }
      blocks.push(
        <div key={`table-${index}`} className="overflow-x-auto rounded-xl border border-[#E1E0CC]/10">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-[#E1E0CC]/10 text-[#E1E0CC]"><tr>{headers.map((header, cellIndex) => <th key={`${header}-${cellIndex}`} className="px-3 py-2 font-medium">{renderMarkdownInline(header)}</th>)}</tr></thead>
            <tbody className="divide-y divide-[#E1E0CC]/10">{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, cellIndex) => <td key={cellIndex} className="px-3 py-2 align-top">{renderMarkdownInline(row[cellIndex] || "")}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const size =
        heading[1].length === 1
          ? "text-base"
          : heading[1].length === 2
            ? "text-sm"
            : "text-xs";
      blocks.push(
        <p
          key={`heading-${index}`}
          className={`${size} font-semibold text-[#E1E0CC]`}>
          {renderMarkdownInline(heading[2])}
        </p>,
      );
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line.trim())) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ul key={`ul-${index}`} className="list-disc space-y-1 pl-5">
          {items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{renderMarkdownInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line.trim())) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ol key={`ol-${index}`} className="list-decimal space-y-1 pl-5">
          {items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{renderMarkdownInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    blocks.push(
      <p key={`p-${index}`} className="leading-relaxed">
        {renderMarkdownInline(line)}
      </p>,
    );
    index += 1;
  }

  return <div className="space-y-3">{blocks}</div>;
}

type MarketCoin = {
  id: string;
  symbol: string;
  name: string;
  image: string;
  currentPrice: number | null;
  marketCap: number | null;
  marketCapRank: number | null;
  totalVolume: number | null;
  high24h: number | null;
  low24h: number | null;
  priceChangePercentage24h: number | null;
  priceChangePercentage1h: number | null;
  priceChangePercentage7d: number | null;
  sparkline: number[];
  lastUpdated: string | null;
};

function marketUsd(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  if (value < 1)
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 8 })}`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function compactUsd(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  return `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value)}`;
}

function percent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeMarketCoin(record: any): MarketCoin {
  return {
    id: String(record?.id || ""),
    symbol: String(record?.symbol || "").toUpperCase(),
    name: String(record?.name || ""),
    image: String(record?.image || ""),
    currentPrice: numberOrNull(record?.current_price),
    marketCap: numberOrNull(record?.market_cap),
    marketCapRank: numberOrNull(record?.market_cap_rank),
    totalVolume: numberOrNull(record?.total_volume),
    high24h: numberOrNull(record?.high_24h),
    low24h: numberOrNull(record?.low_24h),
    priceChangePercentage24h: numberOrNull(record?.price_change_percentage_24h),
    priceChangePercentage1h: numberOrNull(record?.price_change_percentage_1h_in_currency),
    priceChangePercentage7d: numberOrNull(record?.price_change_percentage_7d_in_currency),
    sparkline: Array.isArray(record?.sparkline_in_7d?.price)
      ? record.sparkline_in_7d.price.map(Number).filter(Number.isFinite)
      : [],
    lastUpdated: record?.last_updated ? String(record.last_updated) : null,
  };
}

async function fetchDirectPortfolioMarkets() {
  const url = new URL("https://api.coingecko.com/api/v3/coins/markets");
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("order", "market_cap_desc");
  url.searchParams.set("per_page", "150");
  url.searchParams.set("page", "1");
  url.searchParams.set("sparkline", "true");
  url.searchParams.set("price_change_percentage", "1h,24h,7d");
  url.searchParams.set("precision", "full");

  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json().catch(() => null);

  if (!response.ok || !Array.isArray(data)) {
    throw new Error(data?.error || "Could not fetch direct market data.");
  }

  let coins = data
    .map(normalizeMarketCoin)
    .filter((coin) => coin.id && coin.name && coin.symbol);

  if (!coins.some((coin) => coin.id === "stellar")) {
    const stellarUrl = new URL("https://api.coingecko.com/api/v3/coins/markets");
    stellarUrl.searchParams.set("vs_currency", "usd");
    stellarUrl.searchParams.set("ids", "stellar");
    stellarUrl.searchParams.set("sparkline", "true");
    stellarUrl.searchParams.set("price_change_percentage", "1h,24h,7d");
    stellarUrl.searchParams.set("precision", "full");
    const stellarResponse = await fetch(stellarUrl, { cache: "no-store" });
    const stellarData = await stellarResponse.json().catch(() => null);
    if (stellarResponse.ok && Array.isArray(stellarData)) {
      coins = [...stellarData.map(normalizeMarketCoin), ...coins];
    }
  }

  const stellarIndex = coins.findIndex((coin) => coin.id === "stellar");
  if (stellarIndex > 0) {
    const [stellar] = coins.splice(stellarIndex, 1);
    coins.unshift(stellar);
  }

  return {
    coins,
    provider: "CoinGecko direct",
    lastFetchedAt: Date.now(),
  };
}

function shouldUsePortfolioBackend() {
  const configured = String(import.meta.env.VITE_API_BASE_URL || "").trim();
  return Boolean(configured);
}

function fallbackPortfolioMarkets(error: unknown) {
  const message = error instanceof Error ? error.message : "Market feed is unavailable.";
  const now = Date.now();
  const coins: MarketCoin[] = [
    {
      id: "stellar",
      symbol: "XLM",
      name: "Stellar",
      image: "https://assets.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png",
      currentPrice: null,
      marketCap: null,
      marketCapRank: null,
      totalVolume: null,
      high24h: null,
      low24h: null,
      priceChangePercentage24h: null,
      priceChangePercentage1h: null,
      priceChangePercentage7d: null,
      sparkline: [],
      lastUpdated: null,
    },
    {
      id: "usd-coin",
      symbol: "USDC",
      name: "USDC",
      image: "https://assets.coingecko.com/coins/images/6319/large/usdc.png",
      currentPrice: 1,
      marketCap: null,
      marketCapRank: null,
      totalVolume: null,
      high24h: null,
      low24h: null,
      priceChangePercentage24h: null,
      priceChangePercentage1h: null,
      priceChangePercentage7d: null,
      sparkline: [],
      lastUpdated: null,
    },
  ];

  return {
    coins,
    provider: "Fallback market list",
    lastFetchedAt: now,
    status: `${message} Start the backend server to load live markets.`,
  };
}

function SparklineChart({
  points,
  positive,
}: {
  points: number[];
  positive: boolean;
}) {
  if (points.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-[#E1E0CC]/15 text-sm text-[#E1E0CC]/45">
        No graph data returned.
      </div>
    );
  }

  const width = 640;
  const height = 260;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const spread = max - min || 1;
  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((point - min) / spread) * (height - 24) - 12;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  const fillPath = `${path} L ${width} ${height} L 0 ${height} Z`;
  const stroke = positive ? "#86efac" : "#fca5a5";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-64 w-full overflow-visible rounded-2xl bg-black/30">
      <path
        d={fillPath}
        fill={positive ? "rgba(134,239,172,0.10)" : "rgba(252,165,165,0.10)"}
      />
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Portfolio({
  username,
  walletAddress,
  onLogout,
}: {
  username: string;
  walletAddress: string;
  onLogout: () => void;
}) {
  const [coins, setCoins] = useState<MarketCoin[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  async function loadMarkets() {
    setLoading(true);
    setStatus("");

    try {
      let data: {
        coins?: MarketCoin[];
        provider?: string;
        lastFetchedAt?: number;
      };

      if (shouldUsePortfolioBackend()) {
        const response = await fetch(
          getApiUrl("/api/portfolio/markets?perPage=150"),
        );
        data = await response.json().catch(() => null);

        if (!response.ok || !Array.isArray(data?.coins)) {
          throw new Error((data as any)?.message || "Could not fetch market data.");
        }
      } else {
        throw new Error("Backend market proxy is not configured.");
      }

      const nextCoins = data.coins || [];
      setCoins(nextCoins);
      setProvider(data.provider || "Market feed");
      setLastFetchedAt(data.lastFetchedAt || Date.now());
      setSelectedId((current) => current || nextCoins[0]?.id || "");
    } catch (error) {
      const fallback = fallbackPortfolioMarkets(error);
      setStatus(fallback.status);
      setCoins(fallback.coins);
      setProvider(fallback.provider);
      setLastFetchedAt(fallback.lastFetchedAt);
      setSelectedId((current) => current || fallback.coins[0]?.id || "");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMarkets();
  }, []);

  const filteredCoins = coins.filter((coin) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      coin.name.toLowerCase().includes(needle) ||
      coin.symbol.toLowerCase().includes(needle)
    );
  });
  const selected =
    coins.find((coin) => coin.id === selectedId) || coins[0] || null;
  const selectedPositive =
    (selected?.priceChangePercentage7d ??
      selected?.priceChangePercentage24h ??
      0) >= 0;

  return (
    <AppShell
      username={username}
      walletAddress={walletAddress}
      title="Portfolio."
      subtitle="Live coin markets, real logos, and 7-day graphs from the market feed."
      onLogout={onLogout}>
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="rounded-2xl border border-[#E1E0CC]/10 bg-[#E1E0CC]/5 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">
                Market list
              </p>
              <h2 className="mt-2 font-serif text-4xl italic text-[#E1E0CC]">
                {coins.length ? `${coins.length} live coins` : "Live coins"}
              </h2>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#E1E0CC]/35" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search coins"
                  className="w-full rounded-xl border border-[#E1E0CC]/12 bg-black/35 py-3 pl-11 pr-4 text-sm text-[#E1E0CC] outline-none placeholder:text-[#E1E0CC]/25 focus:border-[#E1E0CC]/45 sm:w-64"
                />
              </label>
              <button
                type="button"
                onClick={loadMarkets}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E1E0CC]/20 px-4 py-3 text-xs uppercase tracking-widest text-[#E1E0CC]/70 transition-colors hover:bg-[#E1E0CC] hover:text-black disabled:cursor-not-allowed disabled:opacity-60">
                <RefreshCw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
            </div>
          </div>

          {status && (
            <p className="mt-5 rounded-2xl border border-amber-200/20 bg-amber-200/10 p-4 text-sm text-amber-100/80">
              {status}
            </p>
          )}

          <div className="mt-5">
            {loading ? (
              <div className="grid gap-3">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-20 animate-pulse rounded-2xl bg-black/35"
                  />
                ))}
              </div>
            ) : filteredCoins.length ? (
              <div className="grid gap-3">
                {filteredCoins.map((coin, index) => {
                  const active = selected?.id === coin.id;
                  const isStellar = coin.id === "stellar";

                  return (
                    <button
                      key={coin.id}
                      type="button"
                      onClick={() => setSelectedId(coin.id)}
                      className={`grid gap-4 rounded-2xl border p-4 text-left transition-colors md:grid-cols-[minmax(0,1fr)_120px_120px] md:items-center ${active ? "border-[#E1E0CC]/55 bg-[#E1E0CC] text-black" : "border-[#E1E0CC]/10 bg-black/25 text-[#E1E0CC] hover:border-[#E1E0CC]/35 hover:bg-[#E1E0CC]/10"}`}>
                      <span className="flex min-w-0 items-center gap-3">
                        <span
                          className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl ${active ? "bg-black/10" : "bg-[#E1E0CC]/10"}`}>
                          <img
                            src={coin.image}
                            alt={`${coin.name} logo`}
                            className="h-8 w-8"
                            loading="lazy"
                          />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {coin.name}
                            </span>
                            {isStellar && (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest ${active ? "bg-black/10 text-black" : "bg-[#E1E0CC]/10 text-[#E1E0CC]/55"}`}>
                                Stellar
                              </span>
                            )}
                          </span>
                          <span
                            className={`mt-1 block text-xs uppercase tracking-[0.2em] ${active ? "text-black/55" : "text-[#E1E0CC]/40"}`}>
                            #{coin.marketCapRank || index + 1} {coin.symbol}
                          </span>
                        </span>
                      </span>
                      <span>
                        <span
                          className={`block text-xs uppercase tracking-[0.2em] ${active ? "text-black/45" : "text-[#E1E0CC]/35"}`}>
                          Price
                        </span>
                        <span className="mt-1 block text-sm">
                          {marketUsd(coin.currentPrice)}
                        </span>
                      </span>
                      <span>
                        <span
                          className={`block text-xs uppercase tracking-[0.2em] ${active ? "text-black/45" : "text-[#E1E0CC]/35"}`}>
                          24h
                        </span>
                        <span
                          className={`mt-1 block text-sm ${coin.priceChangePercentage24h && coin.priceChangePercentage24h < 0 ? "text-red-200" : active ? "text-black" : "text-emerald-200"}`}>
                          {percent(coin.priceChangePercentage24h)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="No coins found"
                description="Try another symbol or refresh the market feed."
              />
            )}
          </div>
        </div>

        <aside className="rounded-2xl border border-[#E1E0CC]/10 bg-black/45 p-5 xl:sticky xl:top-6 xl:self-start">
          {selected ? (
            <div>
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#E1E0CC]/10">
                    <img
                      src={selected.image}
                      alt={`${selected.name} logo`}
                      className="h-11 w-11"
                    />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-serif text-4xl italic text-[#E1E0CC]">
                      {selected.name}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">
                      {selected.symbol}
                      {selected.id === "stellar" ? " on Stellar" : ""}
                    </p>
                  </div>
                </div>
                <StatusBadge status={selectedPositive ? "Up" : "Down"} />
              </div>

              <div className="mt-6">
                <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">
                  Live rate
                </p>
                <p className="mt-2 text-5xl text-[#E1E0CC]">
                  {marketUsd(selected.currentPrice)}
                </p>
                <p className="mt-2 text-sm text-[#E1E0CC]/45">
                  {provider}
                  {lastFetchedAt
                    ? ` updated ${new Date(lastFetchedAt).toLocaleTimeString()}`
                    : ""}
                </p>
              </div>

              <div className="mt-6">
                <SparklineChart
                  points={selected.sparkline}
                  positive={selectedPositive}
                />
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <Info
                  label="Market cap"
                  value={compactUsd(selected.marketCap)}
                />
                <Info
                  label="Volume 24h"
                  value={compactUsd(selected.totalVolume)}
                />
                <Info
                  label="1h change"
                  value={percent(selected.priceChangePercentage1h)}
                />
                <Info
                  label="7d change"
                  value={percent(selected.priceChangePercentage7d)}
                />
                <Info label="24h high" value={marketUsd(selected.high24h)} />
                <Info label="24h low" value={marketUsd(selected.low24h)} />
              </div>

              {selected.lastUpdated && (
                <p className="mt-5 text-xs text-[#E1E0CC]/35">
                  Coin timestamp:{" "}
                  {new Date(selected.lastUpdated).toLocaleString()}
                </p>
              )}
            </div>
          ) : (
            <EmptyState
              title="No market selected"
              description="Refresh the feed to load live portfolio markets."
            />
          )}
        </aside>
      </section>
    </AppShell>
  );
}

const agentSuggestions = [
  "Create a payment of 25 XLM to garvit with 0.5% processing fee",
  "Explain how CoverFi stablecoin loss protection works",
  "What should I check before claiming a payout?",
];

const generalModelOptions = ["deepseek-chat", "deepseek-reasoner"];
const researchModelOptions = ["deepseek-research", "deepseek-reasoner"];

function parsePaymentDraft(
  text: string,
): Omit<PaymentDraft, "recipientWallet" | "status"> | null {
  const hasPaymentIntent = /\b(pay|send|transfer|payment)\b/i.test(text);
  if (!hasPaymentIntent) return null;

  const amountMatch =
    text.match(
      /(?:pay|send|transfer|payment(?:\s+of)?)\s+(\d+(?:\.\d+)?)(?:\s*(xlm|usdc|eurc|pyusd|xlc|aqua|yusdc|usdt))?/i,
    ) ||
    text.match(
      /(\d+(?:\.\d+)?)(?:\s*(xlm|usdc|eurc|pyusd|xlc|aqua|yusdc|usdt))?/i,
    );
  const recipientMatch = text.match(/\bto\s+@?([a-zA-Z0-9_]{3,24})\b/i);

  if (!amountMatch || !recipientMatch) return null;

  const amount = Number(amountMatch[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const asset = (amountMatch[2] || "XLM").toUpperCase();
  const feePercent = Number(
    text.match(
      /(?:processing\s*)?fee(?:\s+of|\s+is)?\s*(\d+(?:\.\d+)?)\s*%/i,
    )?.[1] || "0.5",
  );
  const processingFeeRate =
    Number.isFinite(feePercent) && feePercent >= 0 ? feePercent / 100 : 0.005;
  const processingFee = Number((amount * processingFeeRate).toFixed(7));

  return {
    recipientUsername: recipientMatch[1],
    asset,
    amount,
    processingFeeRate,
    processingFee,
    totalAmount: Number((amount + processingFee).toFixed(7)),
  };
}

function parseProtectionDraft(text: string): ProtectionDraft | null {
  const hasProtectionIntent = /\b(protect|cover|protection)\b/i.test(text);
  if (!hasProtectionIntent) return null;

  const amountMatch = text.match(/(?:protect|cover|protection(?:\s+for)?)\s+\$?(\d+(?:\.\d+)?)/i)
    || text.match(/\$?(\d+(?:\.\d+)?)\s*(?:usd|dollars?|usdc|xlm|eurc|pyusd|usdt|aqua)?/i);
  if (!amountMatch) return null;

  const amount = Number(amountMatch[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const assetMatch = text.match(/\b(usdc|xlm|eurc|pyusd|usdt|aqua)\b/i);
  const assetSymbol = (assetMatch?.[1] || (/\b(usd|dollars?)\b/i.test(text) ? "USDC" : "XLM")).toUpperCase();
  const assetMap: Record<string, string> = {
    USDC: "USDC on Stellar",
    XLM: "XLM Stellar",
    EURC: "EURC on Stellar",
    PYUSD: "PYUSD on Stellar",
    USDT: "USDT Stellar",
    AQUA: "AQUA Stellar",
  };

  const daysMatch = text.match(/\b(?:for|duration)\s+(\d{1,2})\s*(?:days?|d)\b/i)
    || text.match(/\b(\d{1,2})\s*(?:days?|d)\b/i);
  const rawDays = daysMatch ? Number(daysMatch[1]) : 7;
  const allowedDurations = durationChoices.map((choice) => choice.value);
  const duration = allowedDurations.includes(String(rawDays)) ? String(rawDays) : "7";

  return {
    asset: assetMap[assetSymbol] || "XLM Stellar",
    amount,
    duration,
  };
}

function AiChat({
  username,
  walletAddress,
  onLogout,
}: {
  username: string;
  walletAddress: string;
  onLogout: () => void;
}) {
  const { data, network } = useDepositFree();
  const pageContext = useMemo(() => {
    const route = window.sessionStorage.getItem("coverfi_ai_page_context") || "#app/dashboard";
    const labels: Record<string, string> = {
      "#app/dashboard": "Dashboard", "#app/portfolio": "Portfolio", "#app/protect": "Protect", "#app/asset-flow": "Asset Flow", "#app/positions": "Positions", "#app/claims": "Claims", "#app/pay-username": "Pay Username", "#app/history": "History", "#app/qr-service": "QR Service", "#app/protocol-status": "Protocol Status", "#app/profile": "Profile",
    };
    return labels[route] || "CoverFi";
  }, []);
  const formRef = useRef<HTMLFormElement>(null);
  const welcomeMessage = useMemo<ChatMessage>(
    () => ({
      sender: "assistant",
      text: `## CoverFi AI\n\nWelcome ${username || "there"}. I can help with your CoverFi account, protection positions, live market prices, research questions, and review-only username payment drafts.\n\n**Note:** I cannot execute payments. You always review and sign from your own wallet.`,
    }),
    [username],
  );
  const accountContext = useMemo(
    () => ({
      username: username || "New user",
      walletAddress,
      network,
      positions: data.positions.map((position) => ({
        id: position.id,
        asset: position.asset,
        protectedAmount: position.protectedAmount,
        feePaid: position.feePaid,
        entryPrice: position.entryPrice,
        currentPrice: position.currentPrice,
        status: position.status,
        claimableAmount: position.claimableAmount,
        expiryTime: position.expiryTime,
        transactionHash: position.transactionHash || null,
      })),
      activity: data.activity.slice(-10),
      currentPage: pageContext,
    }),
    [data.activity, data.positions, network, pageContext, username, walletAddress],
  );
  const [messages, setMessages] = useState<Array<ChatMessage>>([
    welcomeMessage,
  ]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<PaymentDraft | null>(null);
  const [chatMode, setChatMode] = useState<"chat" | "research">("chat");
  const [generalModel, setGeneralModel] = useState(generalModelOptions[0]);
  const [researchModel, setResearchModel] = useState(researchModelOptions[0]);
  const [chatHydrated, setChatHydrated] = useState(false);
  const [researchSources, setResearchSources] = useState<Array<{ label: string; url: string }>>([]);
  const activeModel = chatMode === "research" ? researchModel : generalModel;

  useEffect(() => {
    let cancelled = false;
    setChatHydrated(false);
    void readPrivateRecord<ChatMessage[]>("aiMessages")
      .then((stored) => {
        if (cancelled) return;
        const valid = Array.isArray(stored)
          ? stored
              .filter((item) => item?.sender === "user" || item?.sender === "assistant")
              .map((item) => ({ sender: item.sender, text: String(item.text || "") }))
              .filter((item) => item.text.trim())
          : [];
        setMessages([welcomeMessage, ...valid]);
      })
      .catch(() => {
        if (!cancelled) setMessages([welcomeMessage]);
      })
      .finally(() => {
        if (!cancelled) setChatHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [walletAddress, welcomeMessage]);

  useEffect(() => {
    if (!chatHydrated) return;
    void writePrivateRecord("aiMessages", messages.slice(1).slice(-50));
  }, [chatHydrated, messages, walletAddress]);

  async function preparePaymentDraft(trimmed: string) {
    const parsed = parsePaymentDraft(trimmed);
    if (!parsed) return false;

    setLoading(true);
    setStatus("Preparing payment draft...");

    try {
      const registryEntry = await getUsernameAddressOnChain({
        userAddress: walletAddress,
        network,
        username: parsed.recipientUsername,
      });

      const nextDraft: PaymentDraft = {
        ...parsed,
        recipientWallet: registryEntry.walletAddress,
        recipientUsername: registryEntry.username || parsed.recipientUsername,
        status: "ready",
      };

      setDraft(nextDraft);
      setMessages((items) => [
        ...items,
        {
          sender: "assistant",
          text: `## Payment Draft\n\n**Status:** Ready for wallet review\n\n- **Recipient:** @${nextDraft.recipientUsername}\n- **Recipient wallet:** \`${nextDraft.recipientWallet}\`\n- **Asset:** ${nextDraft.asset}\n- **Amount:** ${formatAssetAmount(nextDraft.amount, nextDraft.asset)}\n- **Processing fee:** ${formatAssetAmount(nextDraft.processingFee, nextDraft.asset)} (${(nextDraft.processingFeeRate * 100).toFixed(2)}%)\n- **Total to send:** ${formatAssetAmount(nextDraft.totalAmount, nextDraft.asset)}\n- **Sender wallet:** \`${walletAddress}\`\n\n### Next Steps\n\n1. Review the wallet address and total.\n2. Copy the draft if you want to keep a private note.\n3. Sign only from your wallet when you are ready.`,
        },
      ]);
      setStatus("");
      return true;
    } catch {
      setDraft({ ...parsed, status: "not-found" });
      setMessages((items) => [
        ...items,
        {
          sender: "assistant",
          text: `## Payment Draft\n\n**Status:** Recipient not found\n\n- **Recipient username:** @${parsed.recipientUsername}\n- **Amount:** ${formatAssetAmount(parsed.amount, parsed.asset)}\n- **Processing fee:** ${formatAssetAmount(parsed.processingFee, parsed.asset)} (${(parsed.processingFeeRate * 100).toFixed(2)}%)\n- **Total:** ${formatAssetAmount(parsed.totalAmount, parsed.asset)}\n\nAsk them to register a CoverFi username on the Soroban username registry, then try again.`,
        },
      ]);
      setStatus("");
      return true;
    } finally {
      setLoading(false);
    }
  }

  async function prepareProtectionDraft(trimmed: string) {
    const parsed = parseProtectionDraft(trimmed);
    if (!parsed) return false;

    await writePrivateRecord(protectionDraftStorageKey, parsed);

    setMessages((items) => [
      ...items,
      {
        sender: "assistant",
        text: `## Protection Draft\n\n**Status:** Ready for review in Protect\n\n- **Asset:** ${parsed.asset}\n- **Amount:** ${usd(parsed.amount)}\n- **Duration:** ${parsed.duration} day${parsed.duration === "1" ? "" : "s"}\n- **Entry price:** Captured from the fresh oracle quote when you sign\n\n### Next Steps\n\n1. Open the Protect page.\n2. Review the asset, amount, duration, fee, and live price.\n3. Sign only from your wallet if everything looks correct.\n\nCoverFi protection is not insurance and payouts are not guaranteed.`,
      },
    ]);
    setStatus("Protection draft created. Open Protect to review it.");
    return true;
  }

  async function copyDraft() {
    if (!draft) return;

    const text = [
      `CoverFi payment draft`,
      `Recipient: @${draft.recipientUsername}`,
      `Wallet: ${draft.recipientWallet || "Not found"}`,
      `Amount: ${formatAssetAmount(draft.amount, draft.asset)}`,
      `Processing fee: ${formatAssetAmount(draft.processingFee, draft.asset)} (${(draft.processingFeeRate * 100).toFixed(2)}%)`,
      `Total: ${formatAssetAmount(draft.totalAmount, draft.asset)}`,
      `Sender wallet: ${walletAddress}`,
    ].join("\n");

    await navigator.clipboard.writeText(text);
    setStatus("Payment draft copied.");
  }

  function useSuggestion(value: string) {
    setMessage(value);
  }

  function submitWithEnter(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    formRef.current?.requestSubmit();
  }

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;

    setMessages((items) => [...items, { sender: "user", text: trimmed }]);
    setMessage("");
    setLoading(true);
    setStatus(chatMode === "research" ? "Researching approved CoverFi sources..." : "Preparing answer...");

    try {
      const handledByAgent = await preparePaymentDraft(trimmed);
      if (handledByAgent) return;

      const handledProtectionDraft = await prepareProtectionDraft(trimmed);
      if (handledProtectionDraft) return;

      const response = await fetch(getApiUrl("/api/ai/chat"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmed,
          mode: chatMode,
          model: activeModel,
          accountContext,
          persistHistory: false,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data) {
        throw new Error(data?.message || "Chat request failed.");
      }

      setMessages((items) => [
        ...items,
        { sender: "assistant", text: data.reply || "No response returned." },
      ]);
      setResearchSources(Array.isArray(data.sources) ? data.sources.filter((source: unknown) => source && typeof source === "object" && typeof (source as { label?: unknown }).label === "string" && typeof (source as { url?: unknown }).url === "string") : []);
      setStatus("");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Chat request failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell
      username={username}
      walletAddress={walletAddress}
      title="CoverFi AI."
      subtitle="Ask about CoverFi, your account, live prices, or draft a username payment with a processing fee."
      onLogout={onLogout}>
      <section className="min-h-[72vh] pb-32 lg:pb-28">
        <aside className="hidden">
          <div className="rounded-2xl border border-[#E1E0CC]/10 bg-[#E1E0CC]/5 p-5">
            <div className="flex items-center gap-3">
              <span className="rounded-2xl bg-[#E1E0CC] p-3 text-black">
                <Wand2 className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">
                  Agent mode
                </p>
                <h2 className="mt-1 text-lg text-[#E1E0CC]">
                  CoverFi AI assistant
                </h2>
              </div>
            </div>
            <div className="mt-5 grid gap-3 text-sm text-[#E1E0CC]/60">
              <div className="flex items-center gap-3 rounded-xl bg-black/25 px-4 py-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-200" />
                Username lookup through Soroban
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-black/25 px-4 py-3">
                <Calculator className="h-4 w-4 text-[#E1E0CC]" />
                Processing fee calculation
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-black/25 px-4 py-3">
                <ShieldCheck className="h-4 w-4 text-[#E1E0CC]" />
                Review-only CoverFi payment drafts
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E1E0CC]/10 bg-black/30 p-5">
            <p className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">
              Try asking
            </p>
            <div className="mt-4 grid gap-2">
              {agentSuggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => useSuggestion(item)}
                  className="rounded-xl border border-[#E1E0CC]/10 px-4 py-3 text-left text-sm text-[#E1E0CC]/65 transition-colors hover:border-[#E1E0CC]/35 hover:bg-[#E1E0CC]/10 hover:text-[#E1E0CC]">
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#E1E0CC]/10 bg-[#E1E0CC]/5 p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">
                Payment draft
              </p>
              <ReceiptText className="h-4 w-4 text-[#E1E0CC]/45" />
            </div>
            {draft ? (
              <div className="mt-5 space-y-3">
                <div className="rounded-2xl bg-black/35 p-4">
                  <p className="text-sm text-[#E1E0CC]/45">Recipient</p>
                  <p className="mt-1 text-xl text-[#E1E0CC]">
                    @{draft.recipientUsername}
                  </p>
                  <p
                    className="mt-2 truncate text-xs text-[#E1E0CC]/45"
                    title={draft.recipientWallet}>
                    {draft.recipientWallet || "Username not found"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Info
                    label="Amount"
                    value={formatAssetAmount(draft.amount, draft.asset)}
                  />
                  <Info
                    label="Fee"
                    value={formatAssetAmount(draft.processingFee, draft.asset)}
                  />
                  <Info
                    label="Rate"
                    value={`${(draft.processingFeeRate * 100).toFixed(2)}%`}
                  />
                  <Info
                    label="Total"
                    value={formatAssetAmount(draft.totalAmount, draft.asset)}
                  />
                </div>
                <PrimaryButton
                  className="w-full"
                  onClick={copyDraft}
                  disabled={draft.status !== "ready"}>
                  <Copy className="h-4 w-4" />
                  Copy draft
                </PrimaryButton>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-[#E1E0CC]/15 p-5 text-sm leading-relaxed text-[#E1E0CC]/45">
                Ask: "Create a payment of 25 XLM to username with 0.5%
                processing fee."
              </div>
            )}
          </div>
        </aside>

        <div className="flex min-h-[72vh] flex-col overflow-hidden">
          <div className="mb-4 flex flex-col gap-4 rounded-2xl border border-[#E1E0CC]/10 bg-[#E1E0CC]/5 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-black/45 p-2 text-[#E1E0CC]">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm text-[#E1E0CC]">CoverFi AI</p>
                <p className="text-xs text-[#E1E0CC]/45">Context: {pageContext}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-[#E1E0CC]/15 bg-black/35 p-1">
                {(["chat", "research"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setChatMode(mode)}
                    className={`rounded-lg px-3 py-2 text-xs uppercase tracking-widest transition-colors ${
                      chatMode === mode
                        ? "bg-[#E1E0CC] text-black"
                        : "text-[#E1E0CC]/55 hover:text-[#E1E0CC]"
                    }`}>
                    {mode === "chat" ? "general" : "research"}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-[#E1E0CC]/15 bg-black/35 px-3 py-2">
                <span className="text-[10px] uppercase tracking-[0.2em] text-[#E1E0CC]/40">
                  Model
                </span>
                <select
                  value={activeModel}
                  onChange={(event) => {
                    if (chatMode === "research") {
                      setResearchModel(event.target.value);
                      return;
                    }

                    setGeneralModel(event.target.value);
                  }}
                  className="bg-transparent pr-8 text-xs text-[#E1E0CC] outline-none">
                  {(chatMode === "research"
                    ? researchModelOptions
                    : generalModelOptions
                  ).map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>
              <StatusBadge status={loading ? "Working" : "Ready"} />
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto pb-5">
            {messages.map((item, index) => (
              <div
                key={`${item.sender}-${index}`}
                className={`flex gap-3 ${item.sender === "user" ? "justify-end" : "justify-start"}`}>
                {item.sender === "assistant" && (
                  <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#E1E0CC] text-black">
                    <img src="/logo.png" alt="CoverFi" className="h-6 w-6 object-contain" />
                  </span>
                )}
                <div
                  className={`max-w-2xl rounded-2xl px-5 py-4 text-sm leading-relaxed shadow-2xl ${item.sender === "user" ? "bg-[#E1E0CC] text-black" : "border border-[#E1E0CC]/10 bg-black/45 text-[#E1E0CC]/75"}`}>
                  {item.sender === "assistant" ? (
                    <MarkdownMessage text={item.text} />
                  ) : (
                    item.text
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-3 text-sm text-[#E1E0CC]/45">
                <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg bg-[#E1E0CC]">
                  <img src="/logo.png" alt="CoverFi" className="h-5 w-5 animate-pulse object-contain" />
                </span>
                {chatMode === "research" ? "Researching approved sources..." : "Preparing final answer..."}
              </div>
            )}
            {!loading && researchSources.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1 text-xs text-[#E1E0CC]/50">
                {researchSources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="rounded-full border border-[#E1E0CC]/15 px-3 py-1.5 hover:border-violet-200 hover:text-violet-100">{source.label}</a>)}
              </div>
            )}
          </div>

          <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#E1E0CC]/10 bg-black/95 px-4 pb-4 pt-3 shadow-[0_-24px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl lg:left-[280px] lg:px-8">
            {status && <p className="mb-3 text-sm text-[#E1E0CC]/60">{status}</p>}
            <form ref={formRef} onSubmit={send}>
              <div className="flex min-h-16 flex-col gap-3 rounded-2xl border border-[#E1E0CC]/12 bg-black p-2 sm:flex-row sm:items-center">
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={submitWithEnter}
                  placeholder="Ask or create a payment draft..."
                  rows={1}
                  className="max-h-[4.5rem] min-h-12 w-full resize-none overflow-hidden bg-transparent px-3 py-3 text-sm leading-6 text-[#E1E0CC] outline-none placeholder:text-[#E1E0CC]/25"
                />
                <PrimaryButton
                  type="submit"
                  disabled={!message.trim() || loading}
                  className="shrink-0 self-center">
                  {loading ? (
                    <Sparkles className="h-4 w-4 animate-pulse" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Send
                </PrimaryButton>
              </div>
            </form>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function History({
  username,
  walletAddress,
  onLogout,
}: {
  username: string;
  walletAddress: string;
  onLogout: () => void;
}) {
  const { network } = useDepositFree();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadPaymentHistoryWithIndex(walletAddress, network)
      .then((records) => {
        if (!cancelled) setHistory(records);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [walletAddress, network]);

  return (
    <AppShell
      username={username}
      walletAddress={walletAddress}
      title="Payment History."
      subtitle="View local receipts plus payments indexed from your Stellar wallet address."
      onLogout={onLogout}>
      <section>
        {loading ? (
          <p className="text-sm text-[#E1E0CC]/50">Loading history...</p>
        ) : history.length === 0 ? (
          <EmptyState
            title="No payment history"
            description="No local receipts or indexed Stellar payments were found for this wallet on the selected network."
          />
        ) : (
          <div className="grid gap-5">
            {history.map((p, i) => {
              const receipt = asReceiptData(p);
              if (!receipt) return null;
              const txUrl = receipt.txHash && /^[a-fA-F0-9]{64}$/.test(receipt.txHash)
                ? stellarExpertTxUrl(receipt.txHash, network)
                : "";

              return (
                <div key={p.id || i} className="grid gap-3 lg:grid-cols-[minmax(0,420px)_1fr] lg:items-start">
                  <ReceiptPaper receiptData={receipt} />
                  <GlassCard className="p-5">
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusBadge status="Confirmed" />
                      <span className="text-sm text-[#E1E0CC]/70">{receipt.date}</span>
                    </div>
                    <p className="mt-4 font-serif text-2xl italic text-white">{receipt.to.split(" ")[0]}</p>
                    <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
                      <Info label="Amount" value={receipt.amount} />
                      <Info label="Fee" value={receipt.fee} />
                    </div>
                    {txUrl && (
                      <a
                        href={txUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[#E1E0CC]/45 hover:text-[#E1E0CC]">
                        View transaction <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </GlassCard>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function QrService({
  username,
  walletAddress,
  onLogout,
}: {
  username: string;
  walletAddress: string;
  onLogout: () => void;
}) {
  const [qrValue, setQrValue] = useState(`https://coverfi.space/app/pay-username`);
  const [qrLabel, setQrLabel] = useState("CoverFi Pay");
  const [copied, setCopied] = useState(false);
  const filename = qrLabel || "coverfi-qr";

  async function copyValue() {
    await navigator.clipboard.writeText(qrValue);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <AppShell
      username={username}
      walletAddress={walletAddress}
      title="QR Service."
      subtitle="Create CoverFi-styled QR codes for MFA setup links, payment pages, support URLs, and partner onboarding."
      onLogout={onLogout}>
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <GlassCard className="p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#E1E0CC] text-black">
              <QrCode className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[#E1E0CC]/40">
                QR generator
              </p>
              <h3 className="mt-1 text-2xl text-[#E1E0CC]">Custom CoverFi QR</h3>
            </div>
          </div>

          <div className="mt-6 grid gap-5">
            <FormInput
              label="Label"
              value={qrLabel}
              onChange={setQrLabel}
              placeholder="CoverFi MFA"
            />
            <label className="block">
              <span className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">
                QR content
              </span>
              <textarea
                value={qrValue}
                onChange={(event) => setQrValue(event.target.value)}
                placeholder="Paste a URL, otpauth:// link, wallet address, or support reference"
                rows={7}
                className="mt-3 w-full resize-none rounded-xl border border-[#E1E0CC]/12 bg-black/35 px-4 py-3 text-sm leading-6 text-[#E1E0CC] outline-none transition-colors placeholder:text-[#E1E0CC]/25 focus:border-[#E1E0CC]/45"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <PrimaryButton
                type="button"
                variant="outline"
                disabled={!qrValue.trim()}
                onClick={() => void copyValue()}>
                <Copy className="h-4 w-4" />
                {copied ? "Copied" : "Copy content"}
              </PrimaryButton>
              <PrimaryButton
                type="button"
                variant="outline"
                onClick={() => {
                  setQrLabel("CoverFi MFA");
                  setQrValue("otpauth://totp/CoverFi:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=CoverFi&algorithm=SHA1&digits=6&period=30");
                }}>
                <ShieldCheck className="h-4 w-4" />
                MFA sample
              </PrimaryButton>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <CoverFiQrCode
            value={qrValue}
            label={qrLabel || "CoverFi QR"}
            caption="Scan test with the target app before publishing."
            filename={filename}
            size={260}
            showDownloads
          />
        </GlassCard>
      </section>
    </AppShell>
  );
}

export default function DashboardPage({ route }: { route: string }) {
  const [session, setSession] = useState(() => getStoredSession());

  useEffect(() => {
    if (session) return;

    const nextRoute = route === "dashboard" ? getAppHomeRoute() : route;
    window.history.replaceState(
      {},
      "",
      `/login?next=${encodeURIComponent(nextRoute)}`,
    );
    window.dispatchEvent(new Event("popstate"));
  }, [route, session]);

  function handleLogout() {
    lockPrivateStorage();
    clearEmbeddedWalletSession();
    clearStoredSession();
    window.history.replaceState({}, "", "/login");
    window.dispatchEvent(new Event("popstate"));
  }

  if (!session) {
    return null;
  }

  if (route === "app/protect")
    return (
      <>
        <Protect
          username={session.username}
          walletAddress={session.walletAddress}
          onLogout={handleLogout}
          loginMethod={session.loginMethod}
          onWalletLinked={setSession}
        />
        <Toast />
      </>
    );
  if (route === "app/portfolio")
    return (
      <>
        <Portfolio
          username={session.username}
          walletAddress={session.walletAddress}
          onLogout={handleLogout}
        />
        <Toast />
      </>
    );
  if (route === "app/positions")
    return (
      <>
        <Positions
          username={session.username}
          walletAddress={session.walletAddress}
          onLogout={handleLogout}
        />
        <Toast />
      </>
    );
  if (route === "app/claims")
    return (
      <>
        <Claims
          username={session.username}
          walletAddress={session.walletAddress}
          onLogout={handleLogout}
          loginMethod={session.loginMethod}
          onWalletLinked={setSession}
        />
        <Toast />
      </>
    );
  if (route === "app/history")
    return (
      <>
        <History
          username={session.username}
          walletAddress={session.walletAddress}
          onLogout={handleLogout}
        />
        <Toast />
      </>
    );
  if (route === "app/pay-username")
    return (
      <>
        <PayUsername
          username={session.username}
          walletAddress={session.walletAddress}
          onLogout={handleLogout}
          loginMethod={session.loginMethod}
          onWalletLinked={setSession}
        />
        <Toast />
      </>
    );
  if (route === "app/qr-service")
    return (
      <>
        <QrService
          username={session.username}
          walletAddress={session.walletAddress}
          onLogout={handleLogout}
        />
        <Toast />
      </>
    );
  if (route === "app/profile")
    return (
      <>
        <Profile
          username={session.username}
          walletAddress={session.walletAddress}
          onLogout={handleLogout}
          onUsernameSaved={setSession}
          loginMethod={session.loginMethod}
        />
        <Toast />
      </>
    );

  return (
    <>
      <Dashboard
        username={session.username}
        walletAddress={session.walletAddress}
        onLogout={handleLogout}
        loginMethod={session.loginMethod}
        onWalletLinked={setSession}
      />
      <Toast />
    </>
  );
}
