import type { ReactNode } from 'react';
import { LogOut, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { StellarNetwork } from '../../context/AppContext';

export function GlassCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`liquid-glass rounded-2xl p-5 ${className}`}>{children}</div>;
}

export function PrimaryButton({ children, onClick, type = 'button', variant = 'solid', className = '', disabled = false }: { children: ReactNode; onClick?: () => void; type?: 'button' | 'submit'; variant?: 'solid' | 'outline'; className?: string; disabled?: boolean }) {
  const styles = variant === 'solid'
    ? 'bg-[#E1E0CC] text-black hover:scale-[1.02]'
    : 'border border-[#E1E0CC]/30 text-[#E1E0CC] hover:bg-[#E1E0CC] hover:text-black';

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-xs uppercase tracking-widest transition-all disabled:cursor-not-allowed disabled:opacity-55 ${styles} ${className}`}>
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
        {icon && <span className="rounded-xl bg-[#E1E0CC]/10 p-3 text-[#E1E0CC]">{icon}</span>}
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

export function FormInput({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">{label}</span>
      <input
        type={type}
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
    Positions: '#app/positions',
    Claims: '#app/claims',
    Profile: '#app/profile',
    'Pay Username': '#app/pay-username',
    'AI Chat': '#app/ai-chat',
  };

  return map[item] || `#app/${item.toLowerCase().replace(/\s+/g, '-')}`;
}

export function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<ReactNode>> }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E1E0CC]/10">
      <div className="overflow-x-auto">
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
  const [currentHash, setCurrentHash] = useState(() => window.location.hash || '#app/dashboard');

  useEffect(() => {
    const onHashChange = () => setCurrentHash(window.location.hash || '#app/dashboard');

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <main className="min-h-screen bg-black text-[#E1E0CC]">
      <div className="noise-overlay pointer-events-none fixed inset-0 opacity-[0.12] mix-blend-overlay" />
      <div className="relative grid min-h-screen lg:grid-cols-[280px_1fr]">
        <aside className="border-b border-[#E1E0CC]/10 bg-black/70 p-5 backdrop-blur-xl lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between lg:block">
            <div>
              <p className="font-serif text-4xl italic leading-none">DepositFree</p>
              <p className="mt-2 text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">Stablecoin Protection</p>
            </div>
            <button onClick={onLogout} className="rounded-xl border border-[#E1E0CC]/15 p-3 text-[#E1E0CC]/65 transition-colors hover:bg-[#E1E0CC] hover:text-black lg:hidden">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <nav className="mt-8 flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
            {sidebarItems.map((item) => {
              const href = sidebarHref(item);
              const active = currentHash === href;

              return (
                <a
                  key={item}
                  href={href}
                  className={`whitespace-nowrap rounded-xl border px-4 py-3 text-sm transition-colors ${
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
          <div className="mt-8 hidden rounded-2xl border border-[#E1E0CC]/10 p-4 lg:block">
            <p className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/35">Connected</p>
            <p className="mt-3 truncate text-sm text-[#E1E0CC]/65" title={walletAddress}>{walletAddress}</p>
          </div>
        </aside>
        <section className="p-4 md:p-6 lg:p-8">
          <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="font-serif text-5xl italic leading-none md:text-7xl">{title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#E1E0CC]/55">{subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
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
              <a href="#app/profile" className="inline-flex items-center gap-2 rounded-xl border border-[#E1E0CC]/15 px-4 py-3 text-sm text-[#E1E0CC]/70 transition-colors hover:bg-[#E1E0CC] hover:text-black">
                <UserRound className="h-4 w-4" />
                {username}
              </a>
              <button onClick={onLogout} className="hidden rounded-xl border border-[#E1E0CC]/15 p-3 text-[#E1E0CC]/65 transition-colors hover:bg-[#E1E0CC] hover:text-black lg:inline-flex">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </header>
          {children}
        </section>
      </div>
    </main>
  );
}
