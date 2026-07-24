import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getApiUrl } from '../lib/api';

type Invoice = {
  invoiceHash: string;
  merchantWallet: string;
  amountStroops: string;
  durationSeconds: number;
  expiresAt: string;
  status: string;
};

function formatXlm(value: string) {
  const amount = Number(value) / 10_000_000;
  return Number.isFinite(amount) ? amount.toLocaleString(undefined, { maximumFractionDigits: 7 }) : '—';
}

export default function InvoicePage({ token }: { token: string }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [message, setMessage] = useState('Loading invoice…');

  useEffect(() => {
    let live = true;
    void fetch(getApiUrl(`/api/invoices/${encodeURIComponent(token)}`), { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || 'This invoice is unavailable.');
        if (live) { setInvoice(body.invoice); setMessage(''); }
      })
      .catch((error) => live && setMessage(error instanceof Error ? error.message : 'This invoice is unavailable.'));
    return () => { live = false; };
  }, [token]);

  function continueToPayment() {
    window.sessionStorage.setItem('coverfi_pending_invoice_token', token);
    window.location.assign('/login?redirect=app/rate-lock');
  }

  return <main className="min-h-screen bg-[#030907] px-5 py-12 text-[#E1E0CC] sm:px-8">
    <section className="mx-auto max-w-lg rounded-[2rem] border border-[#E1E0CC]/15 bg-[#08140f] p-7 shadow-2xl shadow-black/30">
      <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><img src="/logo.png" alt="CoverFi" className="h-8 w-8 object-contain" /><p className="text-xs uppercase tracking-[0.24em] text-[#E1E0CC]/45">CoverFi protected invoice</p></div><h1 className="mt-3 font-serif text-4xl italic">Pay with a Rate Lock.</h1></div><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#E1E0CC] text-black"><ShieldCheck className="h-5 w-5" /></span></div>
      {invoice ? <div className="mt-8 space-y-4"><div className="rounded-2xl border border-[#E1E0CC]/12 bg-black/15 p-5"><p className="text-xs uppercase tracking-[0.2em] text-[#E1E0CC]/45">Amount due</p><p className="mt-2 text-3xl font-medium">{formatXlm(invoice.amountStroops)} XLM</p><p className="mt-3 break-all text-xs text-[#E1E0CC]/50">To {invoice.merchantWallet}</p></div><div className="flex justify-between border-b border-[#E1E0CC]/10 pb-3 text-sm"><span className="text-[#E1E0CC]/50">Protection window</span><span>{invoice.durationSeconds / 60 < 60 ? `${invoice.durationSeconds / 60} minutes` : `${invoice.durationSeconds / 3600} hour${invoice.durationSeconds === 3600 ? '' : 's'}`}</span></div><div className="flex justify-between border-b border-[#E1E0CC]/10 pb-3 text-sm"><span className="text-[#E1E0CC]/50">Invoice expires</span><span>{new Date(invoice.expiresAt).toLocaleString()}</span></div><button onClick={continueToPayment} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#E1E0CC] px-5 py-4 font-medium text-black transition hover:bg-white">Continue to secure payment <ArrowRight className="h-4 w-4" /></button><p className="text-xs leading-5 text-[#E1E0CC]/45">You will review a fresh quote and sign only from your own wallet. The merchant is paid immediately; any eligible value-protection payout is paid only to the merchant.</p></div> : <p className="mt-8 rounded-2xl border border-[#E1E0CC]/10 p-5 text-sm text-[#E1E0CC]/60">{message}</p>}
    </section>
  </main>;
}
