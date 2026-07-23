import { ArrowLeft, FileText, ShieldCheck } from "lucide-react";

const termsVersion = String(import.meta.env.VITE_TERMS_VERSION || "2026-07-16");

function goBack() {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  window.history.replaceState({}, "", "/login");
  window.dispatchEvent(new Event("popstate"));
}

const sections = [
  {
    title: "1. Product status",
    body: "CoverFi is beta software for Stellar wallet users. The website, app, optional backend support, smart contracts, oracle configuration, reserve policy, AI features, and documentation may change while the product is tested, audited, and improved.",
  },
  {
    title: "2. Eligibility and user responsibility",
    body: "You are responsible for confirming that you may legally use CoverFi in your jurisdiction. You must not use CoverFi if applicable law, sanctions rules, exchange controls, or platform restrictions prohibit you from doing so.",
  },
  {
    title: "3. Non-custodial wallet use",
    body: "CoverFi does not ask for or custody seed phrases, secret keys, or private keys. You are responsible for your wallet, device security, transaction review, network choice, and all wallet signatures.",
  },
  {
    title: "4. Not insurance or financial advice",
    body: "CoverFi protection is not insurance, a bank product, a deposit product, a guaranteed payout, a promise to make you whole, investment advice, legal advice, tax advice, or financial advice.",
  },
  {
    title: "5. Protection positions and payouts",
    body: "Protection positions, settlement status, reserve locks, payout claims, and principal withdrawals are intended to be governed by Soroban smart-contract state. Eligibility depends on smart-contract rules, expiry-time oracle data, reserve state, protocol configuration, user signatures, and Stellar network execution. Reserve capacity is a solvency control for contract-defined claims, not a guarantee that any user will receive a payout.",
  },
  {
    title: "6. Fees, premiums, and taxes",
    body: "Premiums, transaction fees, network fees, and any enabled service fees may be non-refundable after a signed action is accepted. You are responsible for taxes, reporting, and recordkeeping related to your use of CoverFi.",
  },
  {
    title: "7. Usernames, payments, and receipts",
    body: "CoverFi usernames are resolved through the Soroban username registry. Username-to-wallet mappings and wallet-to-username mappings are public blockchain records. Payments are wallet-directed Stellar transactions. Receipt displays are browser-local convenience records unless a future explicit user opt-in stores encrypted or support data elsewhere. Payment and receipt tools do not reverse, guarantee, or insure transactions.",
  },
  {
    title: "8. AI support",
    body: "CoverFi AI is a support and drafting layer. It can be incorrect or incomplete. It cannot sign transactions, move funds, guarantee outcomes, or replace independent review. AI chat history is browser-local by default. Messages sent for AI replies may be processed by the configured AI provider and backend transport, but CoverFi should not treat AI output as protocol state.",
  },
  {
    title: "9. Prohibited use",
    body: "You must not use CoverFi for illegal activity, fraud, sanctions evasion, market manipulation, phishing, spam, scraping, credential harvesting, malware, impersonation, abuse of AI endpoints, abusive uploads, or attempts to bypass security, rate limits, or access controls.",
  },
  {
    title: "10. Privacy and data",
    body: "Public blockchain data such as wallet addresses, username mappings, protection positions, claims, reserve state, contract events, and transaction hashes can be read by anyone through Stellar infrastructure. Browser-local data such as profile fields, receipt history, AI chat history, and dashboard cache stays on the user's device by default and may be lost if browser storage is cleared.",
  },
  {
    title: "11. Data use, sharing, and retention",
    body: "CoverFi may use public chain data, request metadata, logs, and optional support records to operate the app, provide support, prevent abuse, improve reliability, measure product usage, comply with law, and protect users. Optional backend or indexer services may mirror public contract events for speed and monitoring, but they are not the source of truth for usernames, protection positions, claims, or reserves.",
  },
  {
    title: "12. Security limits",
    body: "CoverFi uses reasonable technical controls, but no website, backend, wallet connection, oracle, smart contract, cloud service, AI service, or blockchain network can be guaranteed secure, uninterrupted, or error-free.",
  },
  {
    title: "13. Third-party services",
    body: "CoverFi depends on third-party wallets, Stellar network services, Soroban RPC providers, optional support/indexer services, analytics, price providers, AI providers, browsers, and hosting infrastructure. Third-party terms and privacy policies may apply to those services.",
  },
  {
    title: "14. Changes, suspension, and termination",
    body: "CoverFi may update these terms, change features, pause contracts, limit access, suspend abusive accounts, remove content, or stop operating parts of the service when needed for safety, compliance, security, or product reasons.",
  },
  {
    title: "15. Disclaimers and liability limits",
    body: "CoverFi is provided as-is and as-available. To the maximum extent permitted by law, CoverFi disclaims warranties and limits liability for losses related to market moves, smart-contract bugs, oracle failures, user mistakes, wallet compromise, service outages, data loss, third-party services, or unauthorized use.",
  },
  {
    title: "16. Disputes and legal review",
    body: "These terms are a product notice for beta users and should be reviewed by qualified counsel before production or mainnet use. Any production deployment should define governing law, venue, dispute process, contact address, and legally required consumer/privacy rights for target jurisdictions.",
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#0B0B0A] px-4 py-6 text-[#E1E0CC] md:px-8 md:py-10">
      <div className="mx-auto max-w-6xl">
        <button
          type="button"
          onClick={goBack}
          className="coverfi-nav-link inline-flex items-center gap-2 text-sm text-[#E1E0CC]/70 hover:text-[#E1E0CC]">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <section className="mt-10 grid gap-8 lg:grid-cols-[0.72fr_0.28fr]">
          <article className="rounded-2xl border border-[#E1E0CC]/10 bg-[#E1E0CC]/5 p-6 md:p-8">
            <p className="text-xs uppercase tracking-[0.35em] text-[#E1E0CC]/40">
              Legal document
            </p>
            <h1 className="mt-4 font-serif text-5xl italic leading-none md:text-7xl">
              Terms and privacy.
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-relaxed text-[#E1E0CC]/60">
              Version {termsVersion}. This page is the user-facing terms,
              privacy, risk, and acceptable-use notice for the CoverFi beta.
              Acceptance happens on the login page before app access.
            </p>

            <div className="mt-10 space-y-8 text-sm leading-relaxed text-[#E1E0CC]/68">
              {sections.map((section) => (
                <section key={section.title}>
                  <h2 className="text-2xl text-[#E1E0CC]">{section.title}</h2>
                  <p className="mt-3">{section.body}</p>
                </section>
              ))}

              <section>
                <h2 className="text-2xl text-[#E1E0CC]">
                  17. Official service references
                </h2>
                <p className="mt-3">
                  CoverFi's implementation should be reviewed against official
                  provider documentation, including Stellar and Soroban
                  developer documentation, wallet provider documentation,
                  oracle/price-provider documentation, AI provider policies,
                  optional support/indexer infrastructure documentation, and
                  the terms and privacy notices of each infrastructure provider
                  used in production.
                </p>
                <div className="mt-4 grid gap-2">
                  {[
                    ["Stellar developer documentation", "https://developers.stellar.org/docs"],
                    ["Soroban smart contracts", "https://developers.stellar.org/docs/build/smart-contracts"],
                    ["Stellar wallet integration documentation", "https://developers.stellar.org/docs/build/apps/wallet/stellar-wallets-kit"],
                    ["CoinGecko API documentation", "https://docs.coingecko.com/"],
                  ].map(([label, href]) => (
                    <a
                      key={href}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="coverfi-nav-link text-[#E1E0CC]">
                      {label}
                    </a>
                  ))}
                </div>
              </section>
            </div>
          </article>

          <aside className="h-fit space-y-5">
            <div className="rounded-2xl border border-[#E1E0CC]/10 bg-black/35 p-5">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-[#E1E0CC] p-3 text-black">
                  <FileText className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-[#E1E0CC]/40">
                    Version
                  </p>
                  <p className="text-sm text-[#E1E0CC]">{termsVersion}</p>
                </div>
              </div>
              <p className="mt-5 text-sm leading-relaxed text-[#E1E0CC]/58">
                This page is read-only. Return to login to accept the current
                version before entering the app.
              </p>
            </div>

            <div className="rounded-2xl border border-[#E1E0CC]/10 bg-black/35 p-5">
              <div className="flex items-center gap-3">
                <span className="rounded-xl border border-[#E1E0CC]/15 p-3 text-[#E1E0CC]">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <p className="text-sm text-[#E1E0CC]">Key notices</p>
              </div>
              <div className="mt-5 space-y-3 text-sm text-[#E1E0CC]/58">
                <p>Protection is not insurance.</p>
                <p>Payouts are not guaranteed.</p>
                <p>Never share wallet secrets.</p>
                <p>AI drafts require user review.</p>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
