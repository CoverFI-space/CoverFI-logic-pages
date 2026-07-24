import type { ReactNode } from 'react';
import { Bot, LogOut, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { StellarNetwork } from '../../context/AppContext';
import CofiAiPanel from './CofiAiPanel';

export function GlassCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`liquid-glass rounded-2xl p-5 ${className}`}>{children}</div>;
}

export function PrimaryButton({ children, onClick, type = 'button', variant = 'solid', className = '', disabled = false }: { children: ReactNode; onClick?: () => void; type?: 'button' | 'submit'; variant?: 'solid' | 'outline'; className?: string; disabled?: boolean }) {
  const styles = variant === 'solid'
    ? 'bg-[#E1E0CC] text-black'
    : 'border border-[#E1E0CC]/30 text-[#E1E0CC] hover:bg-[#E1E0CC] hover:text-black';

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 text-center text-xs uppercase tracking-widest transition-all disabled:cursor-not-allowed disabled:opacity-55 sm:px-5 ${styles} ${className}`}>
      {children}
    </button>
  );
}

export function StatCard({ label, value, detail, icon }: { label: string; value: string; detail?: string; icon?: ReactNode }) {
  return (
    <GlassCard>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">{label}</p>
          <p className="mt-4 text-2xl text-[#E1E0CC] md:text-3xl">{value}</p>
          {detail && <p className="mt-2 text-xs text-[#E1E0CC]/45">{detail}</p>}
        </div>
      </div>
    </GlassCard>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const statusText = status.toLowerCase();
  const tone = statusText.includes('active') || statusText.includes('approved') || statusText.includes('paid') || statusText.includes('settled')
    ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100'
    : statusText.includes('pending') || statusText.includes('review')
      ? 'border-amber-200/25 bg-amber-200/10 text-amber-100'
      : 'border-[#E1E0CC]/15 bg-[#E1E0CC]/10 text-[#E1E0CC]/70';

  return <span className={`rounded-full border px-3 py-1 text-xs ${tone}`}>{status}</span>;
}

export function FormInput({ label, value, onChange, placeholder, type = 'text', step }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; step?: string }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">{label}</span>
      <input
        type={type}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-3 w-full rounded-xl border border-[#E1E0CC]/12 bg-black/35 px-4 py-3 text-sm text-[#E1E0CC] outline-none transition-colors placeholder:text-[#E1E0CC]/25 focus:border-[#E1E0CC]/45"
      />
    </label>
  );
}

function sidebarHref(item: string) {
  const map: Record<string, string> = {
    Dashboard: '#app/dashboard',
    Portfolio: '#app/portfolio',
    Protect: '#app/protect',
    'Asset Flow': '#app/asset-flow',
    Positions: '#app/positions',
    Claims: '#app/claims',
    History: '#app/history',
    Profile: '#app/profile',
    'Pay Username': '#app/pay-username',
  };

  return map[item] || `#app/${item.toLowerCase().replace(/\s+/g, '-')}`;
}

export function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<ReactNode>> }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E1E0CC]/10">
      <div className="grid gap-3 p-3 md:hidden">
        {rows.length ? rows.map((row, index) => (
          <div key={`mobile-row-${index}`} className="rounded-xl border border-[#E1E0CC]/10 bg-[#E1E0CC]/5 p-3">
            {row.map((cell, cellIndex) => (
              <div key={`${cellIndex}-${String(cell)}`} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-2 text-sm">
                <span className="text-xs uppercase tracking-[0.18em] text-[#E1E0CC]/35">{headers[cellIndex] || 'Detail'}</span>
                <span className="min-w-0 break-words text-[#E1E0CC]/72">{cell}</span>
              </div>
            ))}
          </div>
        )) : (
          <div className="p-4 text-center text-sm text-[#E1E0CC]/45">No records yet.</div>
        )}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-[#E1E0CC]/5 text-xs uppercase tracking-[0.2em] text-[#E1E0CC]/40">
            <tr>{headers.map((header) => <th key={header} className="px-4 py-4 font-normal">{header}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-[#E1E0CC]/10 text-[#E1E0CC]/70">
            {rows.map((row, index) => (
              <tr key={`${row[0]}-${index}`}>
                {row.map((cell, cellIndex) => <td key={`${cellIndex}-${String(cell)}`} className="px-4 py-4">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#E1E0CC]/15 p-6 text-center">
      <p className="text-[#E1E0CC]">{title}</p>
      <p className="mt-2 text-sm text-[#E1E0CC]/45">{description}</p>
    </div>
  );
}

export function DashboardLayout({ title, subtitle, sidebarItems, username, walletAddress, network, onNetworkChange, children, onLogout }: { title: string; subtitle: string; sidebarItems: string[]; username: string; walletAddress: string; network: StellarNetwork; onNetworkChange: (network: StellarNetwork) => void; children: ReactNode; onLogout: () => void }) {
  const getCurrentRouteHash = () => {
    if (window.location.hash) return window.location.hash;
    const pathname = window.location.pathname.replace(/^\/+/, '').replace(/\/$/, '');
    return pathname.startsWith('app/') ? `#${pathname}` : '#app/dashboard';
  };
  const [currentHash, setCurrentHash] = useState(getCurrentRouteHash);
  const [assistantOpen, setAssistantOpen] = useState(false);

  useEffect(() => {
    const onHashChange = () => setCurrentHash(getCurrentRouteHash());

    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onHashChange);
    };
  }, []);

  return (
    <main className="min-h-screen overflow-x-hidden bg-black text-[#E1E0CC]">
      <div className="noise-overlay pointer-events-none fixed inset-0 opacity-[0.12] mix-blend-overlay" />
      <div className="relative min-h-screen">
        <aside className="sticky top-0 z-40 border-b border-[#E1E0CC]/10 bg-black/90 p-4 backdrop-blur-xl sm:p-5 lg:fixed lg:left-0 lg:top-0 lg:flex lg:h-screen lg:w-[280px] lg:flex-col lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between lg:block">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="CoverFi" className="h-11 w-11 shrink-0 object-contain" />
              <div>
                <p className="font-serif text-3xl italic leading-none sm:text-4xl">CoverFi</p>
                <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-[#E1E0CC]/40 sm:text-xs sm:tracking-[0.25em]">Stablecoin Protection</p>
              </div>
            </div>
            <button onClick={onLogout} className="rounded-xl border border-[#E1E0CC]/15 p-3 text-[#E1E0CC]/65 transition-colors hover:bg-[#E1E0CC] hover:text-black lg:hidden" aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <nav className="mt-5 flex gap-2 overflow-x-auto pb-1 lg:mt-8 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:pb-4 lg:pr-1">
            {sidebarItems.map((item) => {
              const href = sidebarHref(item);
              const active = currentHash === href;

              return (
                <a
                  key={item}
                  href={href}
                  className={`whitespace-nowrap rounded-xl border px-3 py-2.5 text-xs transition-colors sm:px-4 sm:py-3 sm:text-sm ${
                    active
                      ? 'border-[#E1E0CC]/55 bg-[#E1E0CC] text-black shadow-[0_0_24px_rgba(225,224,204,0.18)]'
                      : 'border-[#E1E0CC]/10 text-[#E1E0CC]/60 hover:border-[#E1E0CC]/25 hover:bg-[#E1E0CC]/10 hover:text-[#E1E0CC]'
                  }`}
                >
                  {item}
                </a>
              );
            })}
          </nav>
          <div className="mt-4 hidden rounded-2xl border border-[#E1E0CC]/10 p-4 lg:block">
            <p className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/35">Connected</p>
            <p className="mt-3 truncate text-sm text-[#E1E0CC]/65" title={walletAddress}>{walletAddress}</p>
          </div>
        </aside>
        <section className="min-w-0 p-4 pb-24 md:p-6 lg:ml-[280px] lg:p-8">
          <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <h1 className="font-serif text-4xl italic leading-none sm:text-5xl md:text-7xl">{title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#E1E0CC]/55">{subtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="inline-flex rounded-xl border border-[#E1E0CC]/15 bg-black/35 p-1">
                {(['testnet', 'mainnet'] as StellarNetwork[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => onNetworkChange(item)}
                    className={`rounded-lg px-3 py-2 text-xs uppercase tracking-widest transition-colors ${
                      network === item ? 'bg-[#E1E0CC] text-black' : 'text-[#E1E0CC]/55 hover:text-[#E1E0CC]'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <a href="#app/profile" className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-xl border border-[#E1E0CC]/15 px-4 py-3 text-sm text-[#E1E0CC]/70 transition-colors hover:bg-[#E1E0CC] hover:text-black">
                <UserRound className="h-4 w-4" />
                <span className="truncate">{username}</span>
              </a>
              <button onClick={onLogout} className="hidden rounded-xl border border-[#E1E0CC]/15 p-3 text-[#E1E0CC]/65 transition-colors hover:bg-[#E1E0CC] hover:text-black lg:inline-flex" aria-label="Log out">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </header>
          {children}
        </section>
        <button
          type="button"
          onClick={() => setAssistantOpen(true)}
          className="fixed bottom-24 right-5 z-40 inline-flex items-center gap-2 rounded-full border border-violet-200/35 bg-[#17131f]/95 px-4 py-3 text-xs font-medium uppercase tracking-widest text-violet-100 shadow-[0_14px_42px_rgba(0,0,0,.42)] backdrop-blur-xl transition hover:border-violet-100 hover:bg-violet-100 hover:text-black lg:bottom-8 lg:right-8"
          aria-label="Open CoverFi AI assistant">
          <Bot className="h-4 w-4" /> CoFi AI
        </button>
        <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-5 gap-1 rounded-2xl border border-[#E1E0CC]/12 bg-black/88 p-1.5 shadow-[0_16px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl lg:hidden" aria-label="Primary mobile navigation">
          {['Dashboard', 'Protect', 'Pay Username', 'Claims', 'Profile'].map((item) => {
            const href = sidebarHref(item);
            const active = currentHash === href;
            return (
              <a
                key={item}
                href={href}
                className={`flex min-h-12 items-center justify-center rounded-xl px-1 text-center text-[10px] font-medium leading-tight transition-colors ${
                  active
                    ? 'bg-[#E1E0CC] text-black'
                    : 'text-[#E1E0CC]/58 hover:bg-[#E1E0CC]/10 hover:text-[#E1E0CC]'
                }`}
              >
                {item === 'Pay Username' ? 'Pay' : item}
              </a>
            );
          })}
        </nav>
      </div>
      <CofiAiPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} username={username} walletAddress={walletAddress} />
    </main>
  );
}
