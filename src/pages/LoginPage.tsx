import { ArrowLeft, Loader2, Wallet } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { connectFreighterWallet } from "../lib/freighter";
import {
  createWalletSession,
  findSessionByWallet,
  getStoredSession,
} from "../lib/usernameStore";
import { getAppHomeRoute } from "../context/AppContext";

const fallbackVideo =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_170732_8a9ccda6-5cff-4628-b164-059c500a2b41.mp4";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function getSafeNextRoute() {
  const rawHash = window.location.hash.replace(/^#/, "");
  const queryString = rawHash.includes("?")
    ? rawHash.slice(rawHash.indexOf("?") + 1)
    : window.location.search.slice(1);
  const nextRoute =
    new URLSearchParams(queryString).get("next") || getAppHomeRoute();
  const allowedRoutes = [
    "app/dashboard",
    "app/protect",
    "app/portfolio",
    "app/positions",
    "app/claims",
    "app/pay-username",
    "app/ai-chat",
    "app/profile",
  ];

  return allowedRoutes.includes(nextRoute) ? nextRoute : getAppHomeRoute();
}

export default function LoginPage() {
  const [walletAddress, setWalletAddress] = useState("");
  const [status, setStatus] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const session = getStoredSession();

    if (session?.username && session?.walletAddress) {
      window.location.hash = getSafeNextRoute();
    }
  }, []);

  async function handleConnect() {
    setIsConnecting(true);
    setStatus("");

    try {
      const address = await connectFreighterWallet();
      setWalletAddress(address);
      setStatus("Checking saved username...");

      const existingSession = await findSessionByWallet(address);

      if (existingSession) {
        window.location.hash = getSafeNextRoute();
        return;
      }

      createWalletSession(address);
      window.location.hash = getSafeNextRoute();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not connect Freighter.",
      );
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black p-4 text-[#E1E0CC] md:p-6">
      <video
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="auto">
        <source src="/login-background.mp4" type="video/mp4" />
        <source src={fallbackVideo} type="video/mp4" />
      </video>
      <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.65] mix-blend-overlay" />
      <div className="absolute inset-0 bg-linear-to-b from-black/35 via-black/45 to-black/80" />

      <a
        href="/"
        className="coverfi-nav-link absolute left-6 top-6 z-20 inline-flex items-center gap-2 text-sm text-[#E1E0CC]/75 transition-colors hover:text-[#E1E0CC]">
        <ArrowLeft className="h-4 w-4" />
        Home
      </a>

      <section className="relative z-10 flex min-h-[calc(100vh-2rem)] items-center justify-center md:min-h-[calc(100vh-3rem)]">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
          className="liquid-glass w-full max-w-md rounded-3xl p-6 md:p-8">
          <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#E1E0CC]/45">
            Wallet login
          </p>
          <h1 className="font-serif text-5xl italic leading-none text-[#E1E0CC] md:text-7xl">
            Enter CoverFi.
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-[#E1E0CC]/60">
            Connect with Freighter to open your dashboard. You can claim a
            unique username later from Profile.
          </p>

          {!walletAddress ? (
            <button
              type="button"
              onClick={handleConnect}
              disabled={isConnecting}
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#E1E0CC] px-6 py-4 text-sm uppercase tracking-widest text-black transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-70">
              {isConnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wallet className="h-4 w-4" />
              )}
              Connect Freighter
            </button>
          ) : (
            <p className="mt-8 rounded-xl border border-[#E1E0CC]/15 bg-black/25 px-5 py-4 text-sm text-[#E1E0CC]/65">
              Connected wallet: {shortAddress(walletAddress)}
            </p>
          )}

          {status && (
            <p className="mt-5 text-sm leading-relaxed text-[#E1E0CC]/65">
              {status}
            </p>
          )}
        </motion.div>
      </section>
    </main>
  );
}
