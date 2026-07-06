import { AlertTriangle, Bot, Calculator, Check, CheckCircle2, CircleDollarSign, Clock3, Copy, ExternalLink, FileText, ReceiptText, RefreshCw, Search, Send, ShieldCheck, Sparkles, TrendingDown, WalletCards, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DashboardLayout, DataTable, EmptyState, FormInput, GlassCard, PrimaryButton, StatCard, StatusBadge } from '../components/dashboard/DashboardComponents';
import { clearAppProfile, useDepositFree } from '../context/AppContext';
import { clearStoredSession, getStoredSession } from '../lib/usernameStore';
import type { ProtectionPosition, UserProfile } from '../context/AppContext';

const feeRates: Record<string, number> = {
  '1': 0.003,
  '7': 0.008,
  '14': 0.012,
  '30': 0.02,
};

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function usd(value: number) {
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function timeLeft(expiryTime: string) {
  const ms = new Date(expiryTime).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  return `${days}d ${hours}h`;
}

function Toast() {
  const { toast, setToast } = useDepositFree();

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [setToast, toast]);

  if (!toast) return null;

  return (
    <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[#E1E0CC]/15 bg-black/85 px-5 py-3 text-sm text-[#E1E0CC] shadow-2xl backdrop-blur-xl">
      {toast}
    </div>
  );
}

function AppShell({ username, walletAddress, title, subtitle, children, onLogout }: { username: string; walletAddress: string; title: string; subtitle: string; children: ReactNode; onLogout: () => void }) {
  const { network, setNetwork } = useDepositFree();

  return (
    <DashboardLayout
      title={title}
      subtitle={subtitle}
      sidebarItems={['Dashboard', 'Protect', 'Positions', 'Claims', 'Pay Username', 'AI Chat', 'Profile']}
      username={username}
      walletAddress={walletAddress}
      network={network}
      onNetworkChange={setNetwork}
      onLogout={onLogout}
    >
      {children}
    </DashboardLayout>
  );
}

function Dashboard({ username, walletAddress, onLogout }: { username: string; walletAddress: string; onLogout: () => void }) {
  const { data, network } = useDepositFree();
  const active = data.positions.filter((position) => position.status === 'Active');
  const claimable = data.positions.reduce((sum, position) => position.status === 'Triggered' ? sum + position.claimableAmount : sum, 0);
  const totalProtected = data.positions.reduce((sum, position) => sum + position.protectedAmount, 0);
  const totalFees = data.positions.reduce((sum, position) => sum + position.feePaid, 0);

  return (
    <AppShell username={username} walletAddress={walletAddress} title={`Welcome back, ${username}.`} subtitle={`Stablecoin Protection Dashboard connected to ${shortAddress(walletAddress)}.`} onLogout={onLogout}>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total Protected" value={usd(totalProtected)} icon={<ShieldCheck className="h-5 w-5" />} />
        <StatCard label="Active Positions" value={String(active.length)} icon={<Clock3 className="h-5 w-5" />} />
        <StatCard label="Protection Fees" value={usd(totalFees)} icon={<CircleDollarSign className="h-5 w-5" />} />
        <StatCard label="Claimable Payout" value={usd(claimable)} icon={<TrendingDown className="h-5 w-5" />} />
        <StatCard label="Expired Positions" value={String(data.positions.filter((position) => position.status === 'Expired').length)} icon={<FileText className="h-5 w-5" />} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <GlassCard>
          <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">Active Protection</p>
          <div className="mt-5 grid gap-4">
            {active.length ? active.map((position) => <PositionCard key={position.id} position={position} />) : <EmptyState title="No active Protection Positions" description="Create a position from Protect to start tracking protected amount, fee, trigger price, and expiry timer." />}
          </div>
        </GlassCard>

        <GlassCard>
          <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">Stablecoin Risk</p>
          <div className="mt-5">
            <EmptyState title="No price source connected" description="Stablecoin health data will appear here after a real price feed or oracle is connected." />
          </div>
        </GlassCard>
      </div>

      {network === 'testnet' && <TestnetFaucets walletAddress={walletAddress} />}

      <GlassCard className="mt-5">
        <p className="mb-5 text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">Recent Activity</p>
        {data.activity.length ? (
          <DataTable headers={['Time', 'Activity']} rows={data.activity.map((activity) => [activity.createdAt, activity.label])} />
        ) : (
          <EmptyState title="No activity yet" description="Actions you perform in this app will appear here." />
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
          <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">Stellar Testnet Faucets</p>
          <h2 className="mt-2 font-serif text-4xl italic">Fund this wallet on Testnet.</h2>
          <p className="mt-3 max-w-2xl text-sm text-[#E1E0CC]/55">These links are shown only while Testnet is selected.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href={friendbotUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-[#E1E0CC] px-5 py-3 text-xs uppercase tracking-widest text-black transition-transform hover:scale-[1.02]">
            Friendbot
            <ExternalLink className="h-4 w-4" />
          </a>
          <a href="https://laboratory.stellar.org/#account-creator?network=test" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-[#E1E0CC]/30 px-5 py-3 text-xs uppercase tracking-widest text-[#E1E0CC] transition-colors hover:bg-[#E1E0CC] hover:text-black">
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
          <p className="font-serif text-4xl italic text-[#E1E0CC]">{position.asset}</p>
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
      <p className="text-xs uppercase tracking-[0.2em] text-[#E1E0CC]/35">{label}</p>
      <p className="mt-2 text-[#E1E0CC]">{value}</p>
    </div>
  );
}

function Protect({ username, walletAddress, onLogout }: { username: string; walletAddress: string; onLogout: () => void }) {
  const { createPosition } = useDepositFree();
  const [asset, setAsset] = useState('USDC');
  const [coinPickerOpen, setCoinPickerOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState('7');
  const [triggerPrice, setTriggerPrice] = useState('0.98');
  const [currentPrice, setCurrentPrice] = useState('');
  const [priceStatus, setPriceStatus] = useState('');
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceUpdatedAt, setPriceUpdatedAt] = useState('');
  const [priceProvider, setPriceProvider] = useState('');

  const protectedAmount = Number(amount) || 0;
  const feePaid = Number((protectedAmount * feeRates[duration]).toFixed(2));
  const livePrice = Number(currentPrice) || 0;
  const estimatedPayout = Number((protectedAmount * Math.max(0, 1 - livePrice)).toFixed(2));
  const expiryTime = useMemo(() => {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + Number(duration));
    return expiry.toISOString();
  }, [duration]);

  async function fetchCurrentPrice(nextAsset = asset) {
    setPriceLoading(true);
    setPriceStatus('');

    try {
      const response = await fetch(`/api/prices/${encodeURIComponent(nextAsset)}`);
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.price) {
        throw new Error(data?.message || 'Could not fetch current price.');
      }

      setCurrentPrice(String(Number(data.price.toFixed(8))));
      setPriceProvider(data.provider || 'Live feed');
      setPriceUpdatedAt(data.lastUpdatedAt ? new Date(data.lastUpdatedAt).toLocaleString() : '');
      setPriceStatus(`${data.symbol} price fetched from ${data.provider || 'live feed'}.`);
    } catch (error) {
      setCurrentPrice('');
      setPriceProvider('');
      setPriceUpdatedAt('');
      setPriceStatus(error instanceof Error ? error.message : 'Could not fetch current price.');
    } finally {
      setPriceLoading(false);
    }
  }

  useEffect(() => {
    fetchCurrentPrice(asset);
  }, [asset]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createPosition({
      asset,
      protectedAmount,
      feePaid,
      triggerPrice: Number(triggerPrice),
      currentPrice: Number(currentPrice),
      expiryTime,
    });
  }

  return (
    <AppShell username={username} walletAddress={walletAddress} title="Create Protection Position." subtitle="Live price is fetched automatically. Review the trigger, fee, and expiry before creating a local tracking position." onLogout={onLogout}>
      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <form onSubmit={submit} className="rounded-2xl border border-[#E1E0CC]/10 bg-[#E1E0CC]/5 p-5">
          <div className="flex flex-col gap-4 border-b border-[#E1E0CC]/10 pb-5 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">Position setup</p>
              <h2 className="mt-2 font-serif text-4xl italic text-[#E1E0CC]">Protect an asset.</h2>
            </div>
            <button type="button" onClick={() => fetchCurrentPrice()} disabled={priceLoading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E1E0CC]/20 px-4 py-3 text-xs uppercase tracking-widest text-[#E1E0CC]/70 transition-colors hover:bg-[#E1E0CC] hover:text-black disabled:cursor-not-allowed disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${priceLoading ? 'animate-spin' : ''}`} />
              Refresh price
            </button>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <span className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">Stablecoin asset</span>
              <button type="button" onClick={() => setCoinPickerOpen(true)} className="mt-3 flex w-full items-center justify-between rounded-xl border border-[#E1E0CC]/12 bg-black/35 px-4 py-4 text-left text-sm text-[#E1E0CC] outline-none transition-colors hover:border-[#E1E0CC]/35">
                <span>{asset}</span>
                <span className="text-[#E1E0CC]/40">Change coin</span>
              </button>
            </div>
            <FormInput label="Amount to protect" value={amount} onChange={setAmount} type="number" />

            <label className="block">
              <span className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">Duration</span>
              <select value={duration} onChange={(event) => setDuration(event.target.value)} className="mt-3 w-full rounded-xl border border-[#E1E0CC]/12 bg-black/35 px-4 py-4 text-sm text-[#E1E0CC] outline-none transition-colors focus:border-[#E1E0CC]/45">
                <option value="1">1 day</option>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
              </select>
            </label>

            <FormInput label="Trigger price" value={triggerPrice} onChange={setTriggerPrice} type="number" />

            <div className="md:col-span-2 rounded-2xl border border-[#E1E0CC]/10 bg-black/30 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">Current USD price</p>
                  <p className="mt-2 text-4xl text-[#E1E0CC]">{priceLoading ? 'Fetching...' : livePrice ? `$${livePrice.toFixed(6)}` : 'Unavailable'}</p>
                  {priceProvider && <p className="mt-2 text-sm text-[#E1E0CC]/45">{priceProvider}{priceUpdatedAt ? ` · ${priceUpdatedAt}` : ''}</p>}
                </div>
                <div className="min-w-56">
                  <FormInput label="Manual fallback" value={currentPrice} onChange={setCurrentPrice} type="number" />
                </div>
              </div>
              {priceStatus && (
                <p className={`mt-4 flex items-center gap-2 text-sm ${livePrice ? 'text-[#E1E0CC]/55' : 'text-amber-100/75'}`}>
                  {!livePrice && <AlertTriangle className="h-4 w-4" />}
                  {priceStatus}
                </p>
              )}
            </div>
          </div>

          <PrimaryButton type="submit" disabled={!protectedAmount || !currentPrice || priceLoading} className="mt-5 w-full">
            <ShieldCheck className="h-4 w-4" />
            Create Protection Position
          </PrimaryButton>
        </form>

        <aside className="grid gap-5">
          <div className="rounded-2xl border border-[#E1E0CC]/10 bg-black/35 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">Live quote</p>
            <div className="mt-5 grid gap-3">
              <Info label="Protection fee" value={usd(feePaid)} />
              <Info label="Protected amount" value={usd(protectedAmount)} />
              <Info label="Estimated loss now" value={usd(estimatedPayout)} />
              <Info label="Expiry" value={new Date(expiryTime).toLocaleString()} />
            </div>
          </div>

          <div className="rounded-2xl border border-[#E1E0CC]/10 bg-[#E1E0CC]/5 p-5">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-[#E1E0CC]/10 p-3 text-[#E1E0CC]">
                <TrendingDown className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">Trigger logic</p>
                <p className="mt-3 text-sm leading-relaxed text-[#E1E0CC]/55">
                  If the verified current price is at or below your trigger before expiry, the position can become claimable in the protection flow.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </section>
      {coinPickerOpen && <CoinPicker selected={asset} onClose={() => setCoinPickerOpen(false)} onSelect={(coin) => { setAsset(coin); setCoinPickerOpen(false); }} />}
    </AppShell>
  );
}

function CoinPicker({ selected, onSelect, onClose }: { selected: string; onSelect: (coin: string) => void; onClose: () => void }) {
  const coins = [
    'USDC on Stellar',
    'EURC on Stellar',
    'PYUSD on Stellar',
    'XLM Stellar',
    'XLC Stellar',
    'AQUA Stellar',
    'yUSDC Stellar',
    'USDT Stellar',
    'Stellar Asset Code',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-[#E1E0CC]/15 bg-black p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">Change coin</p>
            <h3 className="mt-2 font-serif text-4xl italic text-[#E1E0CC]">Select asset.</h3>
          </div>
          <button onClick={onClose} className="rounded-xl border border-[#E1E0CC]/15 p-3 text-[#E1E0CC]/70 hover:bg-[#E1E0CC] hover:text-black">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 max-h-[55vh] overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            {coins.map((coin) => (
              <button key={coin} onClick={() => onSelect(coin)} className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors ${selected === coin ? 'border-[#E1E0CC]/60 bg-[#E1E0CC] text-black' : 'border-[#E1E0CC]/12 text-[#E1E0CC]/75 hover:border-[#E1E0CC]/35 hover:bg-[#E1E0CC]/10'}`}>
                {coin}
                {selected === coin && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Positions({ username, walletAddress, onLogout }: { username: string; walletAddress: string; onLogout: () => void }) {
  const { data, updatePositionPrice } = useDepositFree();
  const [prices, setPrices] = useState<Record<string, string>>({});

  return (
    <AppShell username={username} walletAddress={walletAddress} title="Protection Positions." subtitle="Track every position you create and update current price when you have verified price data." onLogout={onLogout}>
      <GlassCard>
        {data.positions.length ? (
          <div className="grid gap-4">
            {data.positions.map((position) => (
              <div key={position.id} className="rounded-2xl border border-[#E1E0CC]/10 p-5">
                <PositionCard position={position} />
                {position.status !== 'Claimed' && (
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <input value={prices[position.id] || ''} onChange={(event) => setPrices((current) => ({ ...current, [position.id]: event.target.value }))} placeholder="Updated current price" className="w-full rounded-xl border border-[#E1E0CC]/12 bg-black/35 px-4 py-3 text-sm text-[#E1E0CC] outline-none placeholder:text-[#E1E0CC]/25" />
                    <PrimaryButton onClick={() => updatePositionPrice(position.id, Number(prices[position.id]))} disabled={!prices[position.id]}>Update Price</PrimaryButton>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No Protection Positions" description="Create a position from Protect. Nothing is prefilled or seeded." />
        )}
      </GlassCard>
    </AppShell>
  );
}

function Claims({ username, walletAddress, onLogout }: { username: string; walletAddress: string; onLogout: () => void }) {
  const { claimPosition, data } = useDepositFree();
  const triggered = data.positions.filter((position) => position.status === 'Triggered');

  return (
    <AppShell username={username} walletAddress={walletAddress} title="Loss Payout Claims." subtitle="Triggered Protection Positions with a calculated Claimable Payout appear here." onLogout={onLogout}>
      <GlassCard>
        {triggered.length ? (
          <div className="grid gap-4">
            {triggered.map((position) => (
              <div key={position.id} className="rounded-2xl border border-[#E1E0CC]/10 p-5">
                <PositionCard position={position} />
                <PrimaryButton className="mt-4" onClick={() => claimPosition(position.id)}>Claim Loss Payout</PrimaryButton>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No claimable payouts" description="A position must be triggered before a Loss Payout can be claimed." />
        )}
      </GlassCard>
    </AppShell>
  );
}

function Profile({ username, walletAddress, onLogout }: { username: string; walletAddress: string; onLogout: () => void }) {
  const { data, profile, updateProfile } = useDepositFree();
  const [draft, setDraft] = useState(profile);
  const totalFees = data.positions.reduce((sum, position) => sum + position.feePaid, 0);
  const claimed = data.positions.filter((position) => position.status === 'Claimed').reduce((sum, position) => sum + position.claimableAmount, 0);

  return (
    <AppShell username={username} walletAddress={walletAddress} title="Profile." subtitle="Account details tied to your Freighter identity." onLogout={onLogout}>
      <section>
        <div className="grid gap-5 md:grid-cols-2">
          <FormInput label="Username" value={username} onChange={() => undefined} />
          <FormInput label="Wallet address" value={walletAddress} onChange={() => undefined} />
          <FormInput label="Full name" value={draft.fullName} onChange={(value) => setDraft((current) => ({ ...current, fullName: value }))} />
          <FormInput label="City" value={draft.city} onChange={(value) => setDraft((current) => ({ ...current, city: value }))} />
          <FormInput label="Email or phone" value={draft.contact} onChange={(value) => setDraft((current) => ({ ...current, contact: value }))} />
          <FormInput label="Account created" value={profile.createdAt} onChange={() => undefined} />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <StatCard label="Positions Created" value={String(data.positions.length)} />
          <StatCard label="Fees Tracked" value={usd(totalFees)} />
          <StatCard label="Payouts Claimed" value={usd(claimed)} />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <PrimaryButton onClick={() => updateProfile(draft)}>Save profile</PrimaryButton>
          <PrimaryButton variant="outline" onClick={onLogout}>Logout</PrimaryButton>
        </div>
      </section>
    </AppShell>
  );
}

function PayUsername({ username, walletAddress, onLogout }: { username: string; walletAddress: string; onLogout: () => void }) {
  const [recipient, setRecipient] = useState('');
  const [result, setResult] = useState<{ username: string; walletAddress: string } | null>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  async function lookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    setStatus('');

    try {
      const response = await fetch(`/api/users/${encodeURIComponent(recipient.trim())}`);
      const data = await response.json().catch(() => null);

      if (!response.ok || !data) {
        throw new Error(data?.message || 'Username lookup failed.');
      }

      setResult(data);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Username lookup failed.');
    } finally {
      setLoading(false);
    }
  }

  async function copyWallet() {
    if (!result?.walletAddress) return;
    await navigator.clipboard.writeText(result.walletAddress);
    setStatus('Wallet address copied.');
  }

  return (
    <AppShell username={username} walletAddress={walletAddress} title="Pay Username." subtitle="Look up a registered username and copy the connected wallet address." onLogout={onLogout}>
      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <form onSubmit={lookup} className="grid gap-4">
          <FormInput label="Recipient username" value={recipient} onChange={setRecipient} />
          <PrimaryButton type="submit" disabled={!recipient.trim() || loading}>
            <Search className="h-4 w-4" />
            Find username
          </PrimaryButton>
        </form>
        <div className="min-h-44 rounded-2xl bg-[#E1E0CC]/5 p-5">
          {result ? (
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#E1E0CC]/40">Recipient found</p>
              <h3 className="mt-3 font-serif text-4xl italic">{result.username}</h3>
              <p className="mt-4 truncate rounded-xl bg-black/35 px-4 py-3 text-sm text-[#E1E0CC]/70" title={result.walletAddress}>{result.walletAddress}</p>
              <PrimaryButton className="mt-5" onClick={copyWallet}>
                <Copy className="h-4 w-4" />
                Copy wallet address
              </PrimaryButton>
            </div>
          ) : (
            <EmptyState title="No recipient selected" description="Search a registered username to reveal the connected wallet address." />
          )}
          {status && <p className="mt-4 text-sm text-[#E1E0CC]/60">{status}</p>}
        </div>
      </section>
    </AppShell>
  );
}

type ChatMessage = {
  sender: 'user' | 'assistant';
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
  status: 'ready' | 'missing-recipient' | 'not-found';
};

function formatAssetAmount(value: number, asset: string) {
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 7 })} ${asset}`;
}

const agentSuggestions = [
  'Create a payment of 25 XLM to garvit with 0.5% processing fee',
  'Explain how stablecoin loss protection works',
  'What should I check before claiming a payout?',
];

function parsePaymentDraft(text: string): Omit<PaymentDraft, 'recipientWallet' | 'status'> | null {
  const hasPaymentIntent = /\b(pay|send|transfer|payment)\b/i.test(text);
  if (!hasPaymentIntent) return null;

  const amountMatch = text.match(/(?:pay|send|transfer|payment(?:\s+of)?)\s+(\d+(?:\.\d+)?)(?:\s*(xlm|usdc|eurc|pyusd|xlc|aqua|yusdc|usdt))?/i)
    || text.match(/(\d+(?:\.\d+)?)(?:\s*(xlm|usdc|eurc|pyusd|xlc|aqua|yusdc|usdt))?/i);
  const recipientMatch = text.match(/\bto\s+@?([a-zA-Z0-9_]{3,24})\b/i);

  if (!amountMatch || !recipientMatch) return null;

  const amount = Number(amountMatch[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const asset = (amountMatch[2] || 'XLM').toUpperCase();
  const feePercent = Number(text.match(/(?:processing\s*)?fee(?:\s+of|\s+is)?\s*(\d+(?:\.\d+)?)\s*%/i)?.[1] || '0.5');
  const processingFeeRate = Number.isFinite(feePercent) && feePercent >= 0 ? feePercent / 100 : 0.005;
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

function AiChat({ username, walletAddress, onLogout }: { username: string; walletAddress: string; onLogout: () => void }) {
  const [messages, setMessages] = useState<Array<ChatMessage>>([
    {
      sender: 'assistant',
      text: `Welcome ${username}. I can answer DepositFree questions or prepare a username payment draft with a processing fee. I will not send funds without you reviewing it.`,
    },
  ]);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<PaymentDraft | null>(null);

  async function preparePaymentDraft(trimmed: string) {
    const parsed = parsePaymentDraft(trimmed);
    if (!parsed) return false;

    setLoading(true);
    setStatus('Preparing payment draft...');

    try {
      const response = await fetch(`/api/users/${encodeURIComponent(parsed.recipientUsername)}`);
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.walletAddress) {
        setDraft({ ...parsed, status: 'not-found' });
        setMessages((items) => [
          ...items,
          {
            sender: 'assistant',
            text: `I found the payment details, but @${parsed.recipientUsername} is not registered yet. Ask them to create a DepositFree username first.`,
          },
        ]);
        return true;
      }

      const nextDraft: PaymentDraft = {
        ...parsed,
        recipientWallet: data.walletAddress,
        recipientUsername: data.username || parsed.recipientUsername,
        status: 'ready',
      };

      setDraft(nextDraft);
      setMessages((items) => [
        ...items,
        {
          sender: 'assistant',
          text: `Payment draft ready: ${formatAssetAmount(nextDraft.amount, nextDraft.asset)} to @${nextDraft.recipientUsername}, plus ${formatAssetAmount(nextDraft.processingFee, nextDraft.asset)} processing fee. Review the draft before using the wallet address.`,
        },
      ]);
      setStatus('');
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not prepare payment draft.');
      return true;
    } finally {
      setLoading(false);
    }
  }

  async function copyDraft() {
    if (!draft) return;

    const text = [
      `DepositFree payment draft`,
      `Recipient: @${draft.recipientUsername}`,
      `Wallet: ${draft.recipientWallet || 'Not found'}`,
      `Amount: ${formatAssetAmount(draft.amount, draft.asset)}`,
      `Processing fee: ${formatAssetAmount(draft.processingFee, draft.asset)} (${(draft.processingFeeRate * 100).toFixed(2)}%)`,
      `Total: ${formatAssetAmount(draft.totalAmount, draft.asset)}`,
      `Sender wallet: ${walletAddress}`,
    ].join('\n');

    await navigator.clipboard.writeText(text);
    setStatus('Payment draft copied.');
  }

  function useSuggestion(value: string) {
    setMessage(value);
  }

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;

    setMessages((items) => [...items, { sender: 'user', text: trimmed }]);
    setMessage('');
    setLoading(true);
    setStatus('');

    try {
      const handledByAgent = await preparePaymentDraft(trimmed);
      if (handledByAgent) return;

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data) {
        throw new Error(data?.message || 'Chat request failed.');
      }

      setMessages((items) => [...items, { sender: 'assistant', text: data.reply || 'No response returned.' }]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Chat request failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell username={username} walletAddress={walletAddress} title="AI Chat." subtitle="Ask about DepositFree or draft a username payment with a processing fee." onLogout={onLogout}>
      <section className="min-h-[72vh]">
        <aside className="hidden">
          <div className="rounded-2xl border border-[#E1E0CC]/10 bg-[#E1E0CC]/5 p-5">
            <div className="flex items-center gap-3">
              <span className="rounded-2xl bg-[#E1E0CC] p-3 text-black">
                <Wand2 className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">Agent mode</p>
                <h2 className="mt-1 text-lg text-[#E1E0CC]">Payment-aware assistant</h2>
              </div>
            </div>
            <div className="mt-5 grid gap-3 text-sm text-[#E1E0CC]/60">
              <div className="flex items-center gap-3 rounded-xl bg-black/25 px-4 py-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-200" />
                Username lookup through MongoDB
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-black/25 px-4 py-3">
                <Calculator className="h-4 w-4 text-[#E1E0CC]" />
                Processing fee calculation
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-black/25 px-4 py-3">
                <ShieldCheck className="h-4 w-4 text-[#E1E0CC]" />
                Review-only payment drafts
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E1E0CC]/10 bg-black/30 p-5">
            <p className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">Try asking</p>
            <div className="mt-4 grid gap-2">
              {agentSuggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => useSuggestion(item)}
                  className="rounded-xl border border-[#E1E0CC]/10 px-4 py-3 text-left text-sm text-[#E1E0CC]/65 transition-colors hover:border-[#E1E0CC]/35 hover:bg-[#E1E0CC]/10 hover:text-[#E1E0CC]"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#E1E0CC]/10 bg-[#E1E0CC]/5 p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">Payment draft</p>
              <ReceiptText className="h-4 w-4 text-[#E1E0CC]/45" />
            </div>
            {draft ? (
              <div className="mt-5 space-y-3">
                <div className="rounded-2xl bg-black/35 p-4">
                  <p className="text-sm text-[#E1E0CC]/45">Recipient</p>
                  <p className="mt-1 text-xl text-[#E1E0CC]">@{draft.recipientUsername}</p>
                  <p className="mt-2 truncate text-xs text-[#E1E0CC]/45" title={draft.recipientWallet}>{draft.recipientWallet || 'Username not found'}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Info label="Amount" value={formatAssetAmount(draft.amount, draft.asset)} />
                  <Info label="Fee" value={formatAssetAmount(draft.processingFee, draft.asset)} />
                  <Info label="Rate" value={`${(draft.processingFeeRate * 100).toFixed(2)}%`} />
                  <Info label="Total" value={formatAssetAmount(draft.totalAmount, draft.asset)} />
                </div>
                <PrimaryButton className="w-full" onClick={copyDraft} disabled={draft.status !== 'ready'}>
                  <Copy className="h-4 w-4" />
                  Copy draft
                </PrimaryButton>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-[#E1E0CC]/15 p-5 text-sm leading-relaxed text-[#E1E0CC]/45">
                Ask: “Create a payment of 25 XLM to username with 0.5% processing fee.”
              </div>
            )}
          </div>
        </aside>

        <div className="flex min-h-[72vh] flex-col overflow-hidden">
          <div className="hidden">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-black/45 p-2 text-[#E1E0CC]">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm text-[#E1E0CC]">DepositFree Agent</p>
                <p className="text-xs text-[#E1E0CC]/45">DeepSeek for questions, local tools for payment drafts</p>
              </div>
            </div>
            <StatusBadge status={loading ? 'Working' : 'Ready'} />
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto pb-5">
            {messages.map((item, index) => (
              <div key={`${item.sender}-${index}`} className={`flex gap-3 ${item.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                {item.sender === 'assistant' && (
                  <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E1E0CC] text-black">
                    <Bot className="h-4 w-4" />
                  </span>
                )}
                <div className={`max-w-2xl rounded-2xl px-5 py-4 text-sm leading-relaxed shadow-2xl ${item.sender === 'user' ? 'bg-[#E1E0CC] text-black' : 'border border-[#E1E0CC]/10 bg-black/45 text-[#E1E0CC]/75'}`}>
                  {item.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-3 text-sm text-[#E1E0CC]/45">
                <Bot className="h-4 w-4 animate-pulse" />
                Working on it...
              </div>
            )}
          </div>

          {status && <p className="mb-3 text-sm text-[#E1E0CC]/60">{status}</p>}
          <form onSubmit={send}>
            <div className="flex flex-col gap-3 rounded-2xl border border-[#E1E0CC]/12 bg-black/35 p-2 sm:flex-row sm:items-end">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Ask or create a payment draft..."
                rows={2}
                className="max-h-40 min-h-12 w-full resize-none bg-transparent px-3 py-3 text-sm text-[#E1E0CC] outline-none placeholder:text-[#E1E0CC]/25"
              />
              <PrimaryButton type="submit" disabled={!message.trim() || loading} className="shrink-0">
                {loading ? <Bot className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
                Send
              </PrimaryButton>
            </div>
          </form>
        </div>
      </section>
    </AppShell>
  );
}

export default function DashboardPage({ route }: { route: string }) {
  const session = getStoredSession();

  function handleLogout() {
    clearStoredSession();
    clearAppProfile();
    window.location.hash = 'login';
  }

  if (!session) {
    window.location.hash = 'login';
    return null;
  }

  if (route === 'app/protect') return <><Protect username={session.username} walletAddress={session.walletAddress} onLogout={handleLogout} /><Toast /></>;
  if (route === 'app/positions') return <><Positions username={session.username} walletAddress={session.walletAddress} onLogout={handleLogout} /><Toast /></>;
  if (route === 'app/claims') return <><Claims username={session.username} walletAddress={session.walletAddress} onLogout={handleLogout} /><Toast /></>;
  if (route === 'app/pay-username') return <><PayUsername username={session.username} walletAddress={session.walletAddress} onLogout={handleLogout} /><Toast /></>;
  if (route === 'app/ai-chat') return <><AiChat username={session.username} walletAddress={session.walletAddress} onLogout={handleLogout} /><Toast /></>;
  if (route === 'app/profile') return <><Profile username={session.username} walletAddress={session.walletAddress} onLogout={handleLogout} /><Toast /></>;

  return <><Dashboard username={session.username} walletAddress={session.walletAddress} onLogout={handleLogout} /><Toast /></>;
}
