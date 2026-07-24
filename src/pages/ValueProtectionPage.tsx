import { ArrowRight, RefreshCw, ShieldCheck, WalletCards } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useDepositFree } from '../context/AppContext';
import { DashboardLayout, FormInput, GlassCard, PrimaryButton, StatusBadge } from '../components/dashboard/DashboardComponents';
import {
  createFloorShieldOnChain,
  createPaymentLockOnChain,
  getFloorShieldQuoteOnChain,
  getPaymentLockQuoteOnChain,
  getUsernameAddressOnChain,
  getPayoutAssetBalanceOnChain,
  isFloorShieldConfigured,
  isPaymentLockConfigured,
  type ValueProtectionQuote,
} from '../lib/stellarContracts';
import { getApiUrl } from '../lib/api';
import { getStoredSession } from '../lib/usernameStore';

type Mode = 'rate-lock' | 'depeg-shield';

const nav = ['Dashboard', 'Portfolio', 'Protect', 'Rate Lock', 'Depeg Shield', 'Asset Flow', 'Positions', 'Claims', 'Pay Username', 'History', 'Profile'];

function format(value: number, suffix = '') {
  return `${Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '—'}${suffix}`;
}

export default function ValueProtectionPage({ mode, username, walletAddress, onLogout }: { mode: Mode; username: string; walletAddress: string; onLogout: () => void }) {
  const { network, setNetwork, setToast } = useDepositFree();
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [floor, setFloor] = useState('0.99');
  const [duration, setDuration] = useState(mode === 'rate-lock' ? '3600' : '604800');
  const [quote, setQuote] = useState<ValueProtectionQuote | null>(null);
  const [referenceHash, setReferenceHash] = useState('');
  const [invoiceToken, setInvoiceToken] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const configured = mode === 'rate-lock' ? isPaymentLockConfigured() : isFloorShieldConfigured();
  const title = mode === 'rate-lock' ? 'Rate Lock' : 'Depeg Shield';
  const subtitle = mode === 'rate-lock'
    ? 'Send XLM now and protect the recipient’s defined value for a short settlement window.'
    : 'Set a floor for the configured stablecoin market. Your balance remains protected until expiry.';
  const durations = useMemo(() => mode === 'rate-lock'
    ? [['900', '15 minutes'], ['3600', '1 hour'], ['86400', '24 hours']]
    : [['86400', '1 day'], ['604800', '7 days'], ['2592000', '30 days']], [mode]);

  useEffect(() => {
    if (mode !== 'rate-lock') return;
    const token = window.sessionStorage.getItem('coverfi_pending_invoice_token');
    if (!token) return;
    window.sessionStorage.removeItem('coverfi_pending_invoice_token');
    void fetch(getApiUrl(`/api/invoices/${encodeURIComponent(token)}`), { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || 'This invoice is unavailable.');
        setRecipient(body.invoice.merchantWallet);
        setAmount(String(Number(body.invoice.amountStroops) / 10_000_000));
        setDuration(String(body.invoice.durationSeconds));
        setReferenceHash(body.invoice.invoiceHash);
        setInvoiceToken(token);
        setStatus('Invoice loaded. Get a fresh quote before signing.');
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : 'Could not load this invoice.'));
  }, [mode]);

  async function resolveRecipient() {
    const value = recipient.trim();
    if (/^G[A-Z2-7]{55}$/.test(value)) return value;
    return (await getUsernameAddressOnChain({ userAddress: walletAddress, network, username: value.replace(/^@/, '') })).walletAddress;
  }

  async function refreshQuote() {
    const numericAmount = Number(amount);
    if (!configured) { setStatus(`${title} is not deployed on ${network} yet.`); return; }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) { setStatus('Enter an amount greater than zero.'); return; }
    setBusy(true); setStatus('Checking the current market and available capacity…');
    try {
      if (mode === 'rate-lock') {
        const recipientAddress = await resolveRecipient();
        const payoutBalance = await getPayoutAssetBalanceOnChain({ userAddress: recipientAddress, network });
        if (payoutBalance === null) throw new Error('The recipient is not ready to receive the payout asset. Ask them to set up their receiving balance before continuing.');
      }
      const next = mode === 'rate-lock'
        ? await getPaymentLockQuoteOnChain({ userAddress: walletAddress, network, recipientAddress: walletAddress, paymentAmount: numericAmount, durationSeconds: Number(duration) as 900 | 3600 | 86400 })
        : await getFloorShieldQuoteOnChain({ userAddress: walletAddress, network, protectedAmount: numericAmount, floorPrice: Number(floor), durationSeconds: Number(duration) as 86400 | 604800 | 2592000 });
      setQuote(next); setStatus('Quote ready. Review every value before signing.');
    } catch (error) { setQuote(null); setStatus(error instanceof Error ? error.message : 'Could not prepare a quote.'); }
    finally { setBusy(false); }
  }

  async function submit() {
    const numericAmount = Number(amount);
    if (!quote || !configured) return;
    setBusy(true); setStatus('Preparing your wallet confirmation…');
    try {
      if (mode === 'rate-lock') {
        const recipientAddress = await resolveRecipient();
        const payoutBalance = await getPayoutAssetBalanceOnChain({ userAddress: recipientAddress, network });
        if (payoutBalance === null) throw new Error('The recipient is not ready to receive the payout asset. Ask them to set up their receiving balance before continuing.');
        const receipt = await createPaymentLockOnChain({ userAddress: walletAddress, recipientAddress, network, paymentAmount: numericAmount, durationSeconds: Number(duration) as 900 | 3600 | 86400, referenceHash: referenceHash || undefined });
        if (invoiceToken) {
          const session = getStoredSession();
          await fetch(getApiUrl(`/api/invoices/${encodeURIComponent(invoiceToken)}/submitted`), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-CoverFi-Wallet-Address': walletAddress,
              ...(session?.backendSessionToken ? { Authorization: `Bearer ${session.backendSessionToken}` } : {}),
            },
            body: JSON.stringify({ customerWallet: walletAddress, paymentLockId: receipt.contractPositionId, transactionHash: receipt.transactionHash }),
          });
          setInvoiceToken('');
        }
        setStatus(`Protected payment created. Transaction ${receipt.transactionHash.slice(0, 12)}…`);
        setToast('Rate Lock created. The recipient receives any eligible payout automatically.');
      } else {
        const receipt = await createFloorShieldOnChain({ userAddress: walletAddress, network, protectedAmount: numericAmount, floorPrice: Number(floor), durationSeconds: Number(duration) as 86400 | 604800 | 2592000 });
        setStatus(`Depeg Shield created. Transaction ${receipt.transactionHash.slice(0, 12)}…`);
        setToast('Depeg Shield created. Principal becomes withdrawable after settlement.');
      }
      setQuote(null);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Wallet confirmation was not completed.'); }
    finally { setBusy(false); }
  }

  return <DashboardLayout title={title} subtitle={subtitle} sidebarItems={nav} username={username || 'New user'} walletAddress={walletAddress} network={network} onNetworkChange={setNetwork} onLogout={onLogout}>
    <section className="mx-auto grid max-w-5xl gap-5 xl:grid-cols-[1.05fr_0.95fr]">
      <GlassCard className="p-6">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/45">Testnet value protection</p><h2 className="mt-2 font-serif text-3xl italic text-[#E1E0CC]">{mode === 'rate-lock' ? 'Protect a recipient value.' : 'Choose your price floor.'}</h2></div><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#E1E0CC] text-black"><ShieldCheck className="h-5 w-5" /></span></div>
        {!configured && <div className="mt-6 rounded-2xl border border-amber-200/25 bg-amber-200/10 p-4 text-sm text-amber-100">This pilot market is being prepared for {network}. It will become available after its dedicated reserve is funded and verified.</div>}
        <div className="mt-6 grid gap-5">
          {mode === 'rate-lock' && <FormInput label="Recipient username or wallet" value={recipient} onChange={setRecipient} placeholder="@recipient or G..." />}
          <FormInput label={mode === 'rate-lock' ? 'XLM payment amount' : 'Protected stablecoin amount'} value={amount} onChange={setAmount} placeholder="0.00" type="number" step="0.0000001" />
          {mode === 'depeg-shield' && <FormInput label="Floor price (USD)" value={floor} onChange={setFloor} placeholder="0.99" type="number" step="0.0001" />}
          <div><p className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">Protection window</p><div className="mt-3 grid grid-cols-3 gap-2">{durations.map(([value, label]) => <button key={value} onClick={() => { setDuration(value); setQuote(null); }} className={`rounded-xl border px-3 py-3 text-xs ${duration === value ? 'border-[#E1E0CC] bg-[#E1E0CC] text-black' : 'border-[#E1E0CC]/15 text-[#E1E0CC]/60'}`}>{label}</button>)}</div></div>
          <PrimaryButton onClick={() => void refreshQuote()} disabled={busy || !configured} className="w-full"><RefreshCw className="h-4 w-4" />{busy ? 'Checking…' : 'Get live quote'}</PrimaryButton>
        </div>
      </GlassCard>
      <GlassCard className="p-6"><p className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">Review</p>{quote ? <div className="mt-5"><StatusBadge status="Ready for wallet review" /><div className="mt-5 grid gap-3 text-sm"><Row label="Entry price" value={`$${format(quote.entryPrice)}`} />{mode === 'rate-lock' && <Row label="Recipient value now" value={`$${format(quote.recipientValue || 0)}`} />}{mode === 'depeg-shield' && <Row label="Selected floor" value={`$${format(quote.floorPrice || Number(floor))}`} />}<Row label="Maximum payout" value={`${format(quote.maximumPayout)} CFTUSD`} /><Row label="Protection premium" value={`${format(quote.riskPremium)} XLM`} /><Row label="Automation fee" value={`${format(quote.automationFee)} XLM`} /><Row label="Total due" value={`${format(quote.totalDue)} XLM`} /></div><PrimaryButton onClick={() => void submit()} disabled={busy} className="mt-7 w-full"><WalletCards className="h-4 w-4" />{busy ? 'Waiting for wallet…' : mode === 'rate-lock' ? 'Send with Rate Lock' : 'Create Depeg Shield'}<ArrowRight className="h-4 w-4" /></PrimaryButton></div> : <div className="mt-5 rounded-2xl border border-dashed border-[#E1E0CC]/15 p-6 text-sm leading-6 text-[#E1E0CC]/55">A fresh price and capacity check is required before a wallet can be asked to sign.</div>}<p className="mt-6 text-xs leading-5 text-[#E1E0CC]/40">{mode === 'rate-lock' ? 'The XLM payment is final immediately. This is a capped value-protection product, not an escrow or guaranteed payment service.' : 'This is a capped testnet value-protection product, not insurance. Settlement requires a valid expiry price observation.'}</p>{status && <p className="mt-4 text-sm text-[#E1E0CC]/70">{status}</p>}</GlassCard>
    </section>
  </DashboardLayout>;
}

function Row({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4 border-b border-[#E1E0CC]/10 pb-3"><span className="text-[#E1E0CC]/45">{label}</span><span className="font-medium text-[#E1E0CC]">{value}</span></div>; }
