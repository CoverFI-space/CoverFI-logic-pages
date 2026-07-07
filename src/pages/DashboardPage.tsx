import {
  AlertTriangle,
  Calculator,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
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
  clearAppProfile,
  getAppHomeRoute,
  useDepositFree,
} from "../context/AppContext";
import {
  clearStoredSession,
  getStoredSession,
  reserveUsername,
} from "../lib/usernameStore";
import {
  createProtectionPositionOnChain,
  getDefaultProtectionAsset,
  getProtectionAssetOptions,
  sendPaymentAndCreateReceipt,
} from "../lib/stellarContracts";
import { getApiUrl } from "../lib/api";
import { PrinterReceipt } from "../components/PrinterReceipt";
import type { ReceiptData } from "../components/PrinterReceipt";
import type { ProtectionPosition, UserProfile } from "../context/AppContext";

const feeRates: Record<string, number> = {
  "1": 0.003,
  "7": 0.008,
  "14": 0.012,
  "30": 0.02,
};

const durationChoices = [
  { value: "1", label: "1 day", hint: "Quick" },
  { value: "7", label: "7 days", hint: "Short" },
  { value: "14", label: "14 days", hint: "Balanced" },
  { value: "30", label: "30 days", hint: "Max" },
];

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function usd(value: number) {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
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
        "Positions",
        "Claims",
        "Pay Username",
        "History",
        "CoverFi AI",
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
}: {
  username: string;
  walletAddress: string;
  onLogout: () => void;
}) {
  const { data, network } = useDepositFree();
  const active = data.positions.filter(
    (position) => position.status === "Active",
  );
  const claimable = data.positions.reduce(
    (sum, position) =>
      position.status === "Triggered" ? sum + position.claimableAmount : sum,
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

  return (
    <AppShell
      username={username}
      walletAddress={walletAddress}
      title={`Welcome back, ${username || "New user"}.`}
      subtitle={`Stablecoin Protection Dashboard connected to ${shortAddress(walletAddress)}.`}
      onLogout={onLogout}>
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
            data.positions.filter((position) => position.status === "Expired")
              .length,
          )}
          icon={<FileText className="h-5 w-5" />}
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <GlassCard>
          <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">
            Active Protection
          </p>
          <div className="mt-5 grid gap-4">
            {active.length ? (
              active.map((position) => (
                <PositionCard key={position.id} position={position} />
              ))
            ) : (
              <EmptyState
                title="No active Protection Positions"
                description="Create a position from Protect to start tracking protected amount, fee, trigger price, and expiry timer."
              />
            )}
          </div>
        </GlassCard>

        <GlassCard>
          <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">
            Stablecoin Risk
          </p>
          <div className="mt-5">
            <EmptyState
              title="No price source connected"
              description="Stablecoin health data will appear here after a real price feed or oracle is connected."
            />
          </div>
        </GlassCard>
      </div>

      {network === "testnet" && (
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
        <StatusBadge status={position.status} />
      </div>
      <div className="mt-5 grid gap-3 text-sm md:grid-cols-3">
        <Info label="Protected Amount" value={usd(position.protectedAmount)} />
        <Info label="Protection Fee" value={usd(position.feePaid)} />
        <Info label="Trigger Price" value={`$${position.triggerPrice}`} />
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
}: {
  username: string;
  walletAddress: string;
  onLogout: () => void;
}) {
  const { createPosition, network } = useDepositFree();
  const [asset, setAsset] = useState(() => getDefaultProtectionAsset("testnet"));
  const [coinPickerOpen, setCoinPickerOpen] = useState(false);
  const [durationPickerOpen, setDurationPickerOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [duration, setDuration] = useState("7");
  const [triggerPrice, setTriggerPrice] = useState("0.98");
  const [currentPrice, setCurrentPrice] = useState("");
  const [priceStatus, setPriceStatus] = useState("");
  const [priceLoading, setPriceLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [priceUpdatedAt, setPriceUpdatedAt] = useState("");
  const [priceProvider, setPriceProvider] = useState("");
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  const protectedAmount = Number(amount) || 0;
  const feePaid = Number((protectedAmount * feeRates[duration]).toFixed(2));
  const livePrice = Number(currentPrice) || 0;
  const selectedDuration =
    durationChoices.find((choice) => choice.value === duration) ??
    durationChoices[1];
  const estimatedPayout = Number(
    (protectedAmount * Math.max(0, 1 - livePrice)).toFixed(2),
  );
  const expiryTime = useMemo(() => {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + Number(duration));
    return expiry.toISOString();
  }, [duration]);

  async function fetchCurrentPrice(nextAsset = asset) {
    setPriceLoading(true);
    setPriceStatus("");

    try {
      const response = await fetch(
        getApiUrl(`/api/prices/${encodeURIComponent(nextAsset)}`),
      );
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.price) {
        throw new Error(data?.message || "Could not fetch current price.");
      }

      setCurrentPrice(String(Number(data.price.toFixed(8))));
      setPriceProvider(data.provider || "Live feed");
      setPriceUpdatedAt(
        data.lastUpdatedAt ? new Date(data.lastUpdatedAt).toLocaleString() : "",
      );
      setPriceStatus(
        `${data.symbol} price fetched from ${data.provider || "live feed"}.`,
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

  useEffect(() => {
    fetchCurrentPrice(asset);
  }, [asset]);

  useEffect(() => {
    const options = getProtectionAssetOptions(network);
    const selected = options.find((option) => option.label === asset);
    if (!selected?.configured) {
      setAsset(getDefaultProtectionAsset(network));
    }
  }, [asset, network]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateLoading(true);
    setPriceStatus(
      "Preparing contract transaction. Freighter will ask you to review and sign.",
    );

    try {
      const receipt = await createProtectionPositionOnChain({
        userAddress: walletAddress,
        network,
        asset,
        protectedAmount,
        durationSeconds: Number(duration) * 86400,
        triggerPrice: Number(triggerPrice),
      });

      createPosition({
        asset,
        protectedAmount,
        feePaid,
        triggerPrice: Number(triggerPrice),
        currentPrice: Number(currentPrice),
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
        txHash: `${receipt.transactionHash.slice(0, 10)}...${receipt.transactionHash.slice(-6)}`,
        date: new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
      });
    } catch (error) {
      setPriceStatus(
        error instanceof Error
          ? error.message
          : "Could not create contract position.",
      );
    } finally {
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
      title="Create Protection Position."
      subtitle="Live price is fetched automatically. Review the trigger, fee, and expiry before creating a local tracking position."
      onLogout={onLogout}>
      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <form
          onSubmit={submit}
          className="rounded-2xl border border-[#E1E0CC]/10 bg-[#E1E0CC]/5 p-5">
          <div className="flex flex-col gap-4 border-b border-[#E1E0CC]/10 pb-5 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">
                Position setup
              </p>
              <h2 className="mt-2 font-serif text-4xl italic text-[#E1E0CC]">
                Protect an asset.
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
              label="Amount to protect"
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

            <FormInput
              label="Trigger price"
              value={triggerPrice}
              onChange={setTriggerPrice}
              type="number"
            />

            <div className="md:col-span-2 rounded-2xl border border-[#E1E0CC]/10 bg-black/30 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">
                    Current USD price
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
                      {priceUpdatedAt ? ` · ${priceUpdatedAt}` : ""}
                    </p>
                  )}
                </div>
                <div className="min-w-56">
                  <FormInput
                    label="Manual fallback"
                    value={currentPrice}
                    onChange={setCurrentPrice}
                    type="number"
                  />
                </div>
              </div>
              {priceStatus && (
                <p
                  className={`mt-4 flex items-center gap-2 text-sm ${livePrice ? "text-[#E1E0CC]/55" : "text-amber-100/75"}`}>
                  {!livePrice && <AlertTriangle className="h-4 w-4" />}
                  {priceStatus}
                </p>
              )}
            </div>
          </div>

          <PrimaryButton
            type="submit"
            disabled={
              !protectedAmount || !currentPrice || priceLoading || createLoading
            }
            className="mt-5 w-full">
            {createLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {createLoading
              ? "Confirming Contract Position"
              : "Create Contract Position"}
          </PrimaryButton>
        </form>

        <aside className="grid gap-5">
          <div className="rounded-2xl border border-[#E1E0CC]/10 bg-black/35 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">
              Live quote
            </p>
            <div className="mt-5 grid gap-3">
              <Info label="Protection fee" value={usd(feePaid)} />
              <Info label="Protected amount" value={usd(protectedAmount)} />
              <Info label="Estimated loss now" value={usd(estimatedPayout)} />
              <Info
                label="Expiry"
                value={new Date(expiryTime).toLocaleString()}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[#E1E0CC]/10 bg-[#E1E0CC]/5 p-5">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-[#E1E0CC]/10 p-3 text-[#E1E0CC]">
                <TrendingDown className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">
                  Trigger logic
                </p>
                <p className="mt-3 text-sm leading-relaxed text-[#E1E0CC]/55">
                  If the verified current price is at or below your trigger
                  before expiry, the position can become claimable in the
                  protection flow.
                </p>
              </div>
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
  const { data, network, updatePositionPrice, revokePosition } =
    useDepositFree();
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const activeCount = data.positions.filter(
    (position) => position.status === "Active",
  ).length;
  const protectedTotal = data.positions.reduce(
    (sum, position) => sum + position.protectedAmount,
    0,
  );
  const chainCount = data.positions.filter(
    (position) => position.transactionHash,
  ).length;

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
                      <StatusBadge status={position.status} />
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
                    <Info label="Trigger" value={`$${position.triggerPrice}`} />
                    <Info label="Current" value={`$${position.currentPrice}`} />
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

                {position.status !== "Claimed" && (
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <input
                      value={prices[position.id] || ""}
                      onChange={(event) =>
                        setPrices((current) => ({
                          ...current,
                          [position.id]: event.target.value,
                        }))
                      }
                      placeholder="Updated current price"
                      className="w-full rounded-xl border border-[#E1E0CC]/12 bg-black/35 px-4 py-3 text-sm text-[#E1E0CC] outline-none placeholder:text-[#E1E0CC]/25"
                    />
                    <PrimaryButton
                      onClick={() =>
                        updatePositionPrice(
                          position.id,
                          Number(prices[position.id]),
                        )
                      }
                      disabled={!prices[position.id]}>
                      Update Price
                    </PrimaryButton>
                    <PrimaryButton
                      variant="outline"
                      onClick={() => setRevokeTarget(position.id)}>
                      Revoke
                    </PrimaryButton>
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
}: {
  username: string;
  walletAddress: string;
  onLogout: () => void;
}) {
  const { claimPosition, data } = useDepositFree();
  const triggered = data.positions.filter(
    (position) => position.status === "Triggered",
  );

  return (
    <AppShell
      username={username}
      walletAddress={walletAddress}
      title="Loss Payout Claims."
      subtitle="Triggered Protection Positions with a calculated Claimable Payout appear here."
      onLogout={onLogout}>
      <GlassCard>
        {triggered.length ? (
          <div className="grid gap-4">
            {triggered.map((position) => (
              <div
                key={position.id}
                className="rounded-2xl border border-[#E1E0CC]/10 p-5">
                <PositionCard position={position} />
                <PrimaryButton
                  className="mt-4"
                  onClick={() => claimPosition(position.id)}>
                  Claim Loss Payout
                </PrimaryButton>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No claimable payouts"
            description="A position must be triggered before a Loss Payout can be claimed."
          />
        )}
      </GlassCard>
    </AppShell>
  );
}

function Profile({
  username,
  walletAddress,
  onLogout,
  onUsernameSaved,
}: {
  username: string;
  walletAddress: string;
  onLogout: () => void;
  onUsernameSaved: (session: {
    username: string;
    walletAddress: string;
  }) => void;
}) {
  const { data, profile, updateProfile, setToast } = useDepositFree();
  const [draft, setDraft] = useState(profile);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameStatus, setUsernameStatus] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const totalFees = data.positions.reduce(
    (sum, position) => sum + position.feePaid,
    0,
  );
  const claimed = data.positions
    .filter((position) => position.status === "Claimed")
    .reduce((sum, position) => sum + position.claimableAmount, 0);
  const usernameError = useMemo(() => {
    if (!usernameDraft) return "";
    if (usernameDraft.trim().length < 3) return "Use at least 3 characters.";
    if (!/^[a-zA-Z0-9_]+$/.test(usernameDraft.trim()))
      return "Use letters, numbers, and underscores only.";
    return "";
  }, [usernameDraft]);

  async function claimUsername(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (username || usernameError || usernameDraft.trim().length < 3) return;

    setUsernameSaving(true);
    setUsernameStatus("");

    try {
      const nextSession = await reserveUsername(usernameDraft, walletAddress);
      onUsernameSaved(nextSession);
      setUsernameDraft("");
      setToast("Username claimed.");
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
      subtitle="Account details tied to your Freighter identity."
      onLogout={onLogout}>
      <section>
        {!username && (
          <form
            onSubmit={claimUsername}
            className="mb-6 rounded-2xl border border-[#E1E0CC]/10 bg-[#E1E0CC]/5 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">
              Claim username
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <label>
                <span className="text-sm text-[#E1E0CC]/60">
                  Choose a unique username for payments and lookups.
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
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <StatCard
            label="Positions Created"
            value={String(data.positions.length)}
          />
          <StatCard label="Fees Tracked" value={usd(totalFees)} />
          <StatCard label="Payouts Claimed" value={usd(claimed)} />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <PrimaryButton onClick={() => updateProfile(draft)}>
            Save profile
          </PrimaryButton>
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
}: {
  username: string;
  walletAddress: string;
  onLogout: () => void;
}) {
  const { network } = useDepositFree();
  const [recipient, setRecipient] = useState("");
  const [result, setResult] = useState<{
    username: string;
    walletAddress: string;
  } | null>(null);
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!recipient.trim() || result) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(getApiUrl(`/api/users/search?q=${encodeURIComponent(recipient.trim())}`));
        const data = await res.json();
        if (data.users) setSuggestions(data.users);
      } catch (e) {}
    }, 300);
    return () => clearTimeout(timer);
  }, [recipient, result]);

  useEffect(() => {
    if (!result) {
      setHistory([]);
      return;
    }
    async function loadHistory() {
      try {
        const res = await fetch(getApiUrl(`/api/payments/${encodeURIComponent(username)}`));
        const data = await res.json();
        if (data.payments) {
          const relevant = data.payments.filter((p: any) => p.participants && p.participants.includes(result!.username.toLowerCase()));
          setHistory(relevant);
        }
      } catch (e) {}
    }
    loadHistory();
  }, [result, username]);

  async function lookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    setStatus("");

    try {
      const response = await fetch(
        getApiUrl(`/api/users/${encodeURIComponent(recipient.trim())}`),
      );
      if (response.status === 404) {
        throw new Error("Username not found. Please check the spelling.");
      }
      const data = await response.json().catch(() => null);

      if (!response.ok || !data) {
        throw new Error(data?.message || "Username lookup failed.");
      }

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
    setStatus("Preparing payment and receipt. Please sign in Freighter...");

    try {
      const parsedAmount = Number(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error("Invalid amount.");
      }

      const txResult = await sendPaymentAndCreateReceipt({
        userAddress: walletAddress,
        network,
        receiverAddress: result.walletAddress,
        amount: parsedAmount,
        asset: "XLM",
        onPaymentSuccess: () => {
          setStatus("Payment confirmed! Please sign the second transaction to generate the receipt.");
        }
      });

      setStatus("Payment successful!");
      
      const finalReceiptData = {
        status: 'Success',
        from: `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
        to: `${result.username} (${result.walletAddress.slice(0, 6)}...${result.walletAddress.slice(-4)})`,
        amount: `${parsedAmount} XLM`,
        fee: `${txResult.feePaid} XLM`,
        txHash: `${txResult.transactionHash.slice(0, 10)}...${txResult.transactionHash.slice(-6)}`,
        date: new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
      };

      try {
        await fetch(getApiUrl('/api/payments/save'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: username,
            recipient: result.username,
            receiptData: finalReceiptData
          })
        });
      } catch (e) {
        console.error("Failed to save receipt to firebase", e);
      }

      setReceiptData(finalReceiptData);
      setAmount("");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Payment failed.",
      );
    } finally {
      setPaymentLoading(false);
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
        subtitle="Look up a registered username and send them XLM directly."
        onLogout={onLogout}>
        <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <form onSubmit={lookup} className="grid gap-4">
            <div className="relative">
              <FormInput
                label="Recipient username"
                value={recipient}
                onChange={(val) => {
                  setRecipient(val);
                  setResult(null);
                }}
              />
              {suggestions.length > 0 && !result && (
                <div className="absolute top-full left-0 right-0 mt-2 z-10 rounded-xl bg-[#111827] border border-[#E1E0CC]/15 shadow-xl max-h-48 overflow-y-auto">
                  {suggestions.map((u, i) => (
                    <button
                      key={i}
                      type="button"
                      className="w-full text-left px-4 py-3 hover:bg-[#E1E0CC]/10 transition-colors text-sm text-[#E1E0CC]/80 flex items-center justify-between"
                      onClick={() => {
                        setRecipient(u.username);
                        setSuggestions([]);
                        setResult(u);
                      }}
                    >
                      <span className="font-bold">{u.username}</span>
                      <span className="text-xs text-[#E1E0CC]/40">{shortAddress(u.walletAddress)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <PrimaryButton type="submit" disabled={!recipient.trim() || loading}>
              <Search className="h-4 w-4" />
              Find username
            </PrimaryButton>
          </form>
          <div className="min-h-44 rounded-2xl bg-[#E1E0CC]/5 p-5">
            {result ? (
              <form onSubmit={handlePay}>
                <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">
                  Recipient found
                </p>
                <h3 className="mt-3 font-serif text-4xl italic">
                  {result.username}
                </h3>
                <p
                  className="mt-4 truncate rounded-xl bg-black/35 px-4 py-3 text-sm text-[#E1E0CC]/70"
                  title={result.walletAddress}>
                  {result.walletAddress}
                </p>
                <div className="mt-5">
                  <FormInput
                    label="Amount (XLM)"
                    value={amount}
                    onChange={setAmount}
                    type="number"
                    step="any"
                  />
                </div>
                <PrimaryButton type="submit" className="mt-5" disabled={paymentLoading || !amount}>
                  <Send className="h-4 w-4" />
                  {paymentLoading ? "Confirming..." : `Pay ${amount ? `${amount} XLM` : "User"}`}
                </PrimaryButton>
              </form>
            ) : (
              <EmptyState
                title="No recipient selected"
                description="Search a registered username to reveal the connected wallet address and send a payment."
              />
            )}
            {status && <p className="mt-4 text-sm text-[#E1E0CC]/60">{status}</p>}
          </div>
        </section>

        {result && history.length > 0 && (
          <section className="mt-10">
            <h3 className="mb-4 font-serif text-2xl italic">Payment History with {result.username}</h3>
            <div className="grid gap-3">
              {history.map((p, i) => (
                <GlassCard key={i} className="flex flex-wrap items-center justify-between gap-4 p-4 text-sm">
                  <div>
                    <p className="text-[#E1E0CC]/80">{p.receiptData.date}</p>
                    <p className="text-xs text-[#E1E0CC]/50 mt-1">{p.receiptData.txHash}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[#22c55e]">{p.receiptData.amount}</p>
                    <p className="text-xs text-[#E1E0CC]/50 mt-1">Fee: {p.receiptData.fee}</p>
                  </div>
                </GlassCard>
              ))}
            </div>
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

type StoredChatMessage = {
  message?: string;
  reply?: string;
  mode?: "chat" | "research";
  model?: string;
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
      const response = await fetch(
        getApiUrl("/api/portfolio/markets?perPage=150"),
      );
      const data = await response.json().catch(() => null);

      if (!response.ok || !Array.isArray(data?.coins)) {
        throw new Error(data?.message || "Could not fetch market data.");
      }

      setCoins(data.coins);
      setProvider(data.provider || "Market feed");
      setLastFetchedAt(data.lastFetchedAt || Date.now());
      setSelectedId((current) => current || data.coins[0]?.id || "");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not fetch market data.",
      );
      setCoins([]);
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

function AiChat({
  username,
  walletAddress,
  onLogout,
}: {
  username: string;
  walletAddress: string;
  onLogout: () => void;
}) {
  const { profile, data, network } = useDepositFree();
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
      profile,
      positions: data.positions.map((position) => ({
        id: position.id,
        asset: position.asset,
        protectedAmount: position.protectedAmount,
        feePaid: position.feePaid,
        triggerPrice: position.triggerPrice,
        currentPrice: position.currentPrice,
        status: position.status,
        claimableAmount: position.claimableAmount,
        expiryTime: position.expiryTime,
        transactionHash: position.transactionHash || null,
      })),
      activity: data.activity.slice(-10),
    }),
    [data.activity, data.positions, network, profile, username, walletAddress],
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
  const activeModel = chatMode === "research" ? researchModel : generalModel;

  useEffect(() => {
    if (!walletAddress) return;

    let ignore = false;

    async function loadChatHistory() {
      try {
        const response = await fetch(
          getApiUrl(`/api/ai/chat/${encodeURIComponent(walletAddress)}`),
        );
        const data = (await response.json().catch(() => null)) as {
          messages?: StoredChatMessage[];
        } | null;

        if (ignore || !response.ok || !data?.messages?.length) return;

        const restored = data.messages.flatMap((item) => {
          const items: ChatMessage[] = [];
          if (item.message) items.push({ sender: "user", text: item.message });
          if (item.reply) items.push({ sender: "assistant", text: item.reply });
          return items;
        });

        setMessages([welcomeMessage, ...restored]);
      } catch {
        // Ignore history load failures and keep the chat usable.
      }
    }

    void loadChatHistory();

    return () => {
      ignore = true;
    };
  }, [username, walletAddress]);

  async function preparePaymentDraft(trimmed: string) {
    const parsed = parsePaymentDraft(trimmed);
    if (!parsed) return false;

    setLoading(true);
    setStatus("Preparing payment draft...");

    try {
      const response = await fetch(
        getApiUrl(`/api/users/${encodeURIComponent(parsed.recipientUsername)}`),
      );
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.walletAddress) {
        setDraft({ ...parsed, status: "not-found" });
        setMessages((items) => [
          ...items,
          {
            sender: "assistant",
            text: `## Payment Draft\n\n**Status:** Recipient not found\n\n- **Recipient username:** @${parsed.recipientUsername}\n- **Amount:** ${formatAssetAmount(parsed.amount, parsed.asset)}\n- **Processing fee:** ${formatAssetAmount(parsed.processingFee, parsed.asset)} (${(parsed.processingFeeRate * 100).toFixed(2)}%)\n- **Total:** ${formatAssetAmount(parsed.totalAmount, parsed.asset)}\n\nAsk them to create a CoverFi username first, then try again.`,
          },
        ]);
        return true;
      }

      const nextDraft: PaymentDraft = {
        ...parsed,
        recipientWallet: data.walletAddress,
        recipientUsername: data.username || parsed.recipientUsername,
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
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not prepare payment draft.",
      );
      return true;
    } finally {
      setLoading(false);
    }
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
    setStatus("");

    try {
      const handledByAgent = await preparePaymentDraft(trimmed);
      if (handledByAgent) return;

      const response = await fetch(getApiUrl("/api/ai/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          walletAddress,
          mode: chatMode,
          model: activeModel,
          accountContext,
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
                Username lookup through Firestore
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
                Ask: “Create a payment of 25 XLM to username with 0.5%
                processing fee.”
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
                <p className="text-xs text-[#E1E0CC]/45">
                  Account context, live prices, and payment drafts
                </p>
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
                Working on it...
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
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(getApiUrl(`/api/payments/${encodeURIComponent(username)}`));
        const data = await res.json();
        if (data.payments) setHistory(data.payments);
      } catch (e) {} finally {
        setLoading(false);
      }
    }
    load();
  }, [username]);

  return (
    <AppShell
      username={username}
      walletAddress={walletAddress}
      title="Payment History."
      subtitle="View all your past payments and receipts securely stored in Firebase."
      onLogout={onLogout}>
      <section>
        {loading ? (
          <p className="text-sm text-[#E1E0CC]/50">Loading history...</p>
        ) : history.length === 0 ? (
          <EmptyState
            title="No payment history"
            description="You haven't made any payments yet. Go to Pay Username to get started."
          />
        ) : (
          <div className="grid gap-4">
            {history.map((p, i) => (
              <GlassCard key={i} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-5">
                <div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status="Confirmed" />
                    <span className="text-sm text-[#E1E0CC]/70">{p.receiptData.date}</span>
                  </div>
                  <p className="mt-3 font-serif text-xl italic text-white">{p.receiptData.to.split(' ')[0]}</p>
                  <a href={stellarExpertTxUrl(p.receiptData.txHash.replace('...', ''), 'testnet')} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-xs text-[#E1E0CC]/40 hover:text-[#E1E0CC]">
                    {p.receiptData.txHash} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-2xl text-[#22c55e]">{p.receiptData.amount}</p>
                  <p className="mt-1 text-xs text-[#E1E0CC]/50">Fee: {p.receiptData.fee}</p>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
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
    clearStoredSession();
    clearAppProfile();
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
        />
        <Toast />
      </>
    );
  if (route === "app/ai-chat")
    return (
      <>
        <AiChat
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
      />
      <Toast />
    </>
  );
}
