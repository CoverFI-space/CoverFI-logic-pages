import { Activity, ArrowLeft, KeyRound, Loader2, Mail, ShieldCheck, Wallet } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { connectWallet, createBackendWalletSession } from "../lib/freighter";
import {
  isPrivateStorageUnlocked,
  unlockPrivateStorage,
} from "../lib/encryptedStorage";
import {
  createWalletSession,
  getStoredSession,
} from "../lib/usernameStore";
import { getApiUrl } from "../lib/api";
import {
  createEmailWalletCommitment,
  createEmailWalletSignatureProof,
  createEmbeddedWalletSession,
  updateEmbeddedWalletSession,
} from "../lib/embeddedWallet";
import { getAppHomeRoute } from "../context/AppContext";
import { getWalletUsernameOnChain } from "../lib/stellarContracts";
import type { StellarNetwork } from "../context/AppContext";
import { publicStatusUrl } from "../lib/links";
import { playRouteExitTransition } from "../lib/pageTransitions";
import { CodeBoxes } from "../components/CodeBoxes";
import { AuthenticatorQrCode } from "../components/AuthenticatorQrCode";

const fallbackVideo =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_170732_8a9ccda6-5cff-4628-b164-059c500a2b41.mp4";
const termsVersion = String(import.meta.env.VITE_TERMS_VERSION || "2026-07-16");
const defaultNetwork: StellarNetwork =
  String(import.meta.env.VITE_STELLAR_NETWORK || "testnet") === "mainnet"
    ? "mainnet"
    : "testnet";

type LoginMode = "wallet" | "email";

function hasAcceptedTerms() {
  return window.localStorage.getItem(`coverfi_terms_${termsVersion}`) === "accepted";
}

function acceptTerms() {
  window.localStorage.setItem(`coverfi_terms_${termsVersion}`, "accepted");
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function getSafeNextRoute() {
  const rawHash = window.location.hash.replace(/^#/, "");
  const queryString = rawHash.includes("?")
    ? rawHash.slice(rawHash.indexOf("?") + 1)
    : window.location.search.slice(1);
  const nextRoute = (
    new URLSearchParams(queryString).get("next") || getAppHomeRoute()
  )
    .replace(/^\/+/, "")
    .replace(/\/$/, "");
  const allowedRoutes = [
    "app/dashboard",
    "app/protect",
    "app/portfolio",
    "app/positions",
    "app/claims",
    "app/pay-username",
    "app/ai-chat",
    "app/qr-service",
    "app/profile",
  ];

  return allowedRoutes.includes(nextRoute) ? nextRoute : getAppHomeRoute();
}

async function navigateToAppRoute(route: string) {
  await playRouteExitTransition();
  const normalizedRoute = route.startsWith("app/") ? `/${route}` : `/${route}`;
  window.history.replaceState({}, "", normalizedRoute);
  window.dispatchEvent(new Event("popstate"));
}

export default function LoginPage() {
  const [walletAddress, setWalletAddress] = useState("");
  const [status, setStatus] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(() => hasAcceptedTerms());
  const [loginMode, setLoginMode] = useState<LoginMode>("wallet");
  const [email, setEmail] = useState("");
  const [otpId, setOtpId] = useState("");
  const [otp, setOtp] = useState("");
  const [mfaChallengeId, setMfaChallengeId] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaSetupSecret, setMfaSetupSecret] = useState("");
  const [mfaSetupUrl, setMfaSetupUrl] = useState("");
  const [pendingEmailSessionToken, setPendingEmailSessionToken] = useState("");
  const isEmailVerificationStep = loginMode === "email" && Boolean(otpId || mfaChallengeId);

  useEffect(() => {
    const session = getStoredSession();

    if (session?.walletAddress && hasAcceptedTerms()) {
      void navigateToAppRoute(getSafeNextRoute());
    }
  }, []);

  async function readJsonResponse(response: Response) {
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.message || data?.error?.message || `Request failed with ${response.status}.`);
    }
    return data;
  }

  async function handleConnect() {
    if (!termsAccepted) {
      setStatus("Accept the Terms and Privacy notice before opening CoverFi.");
      return;
    }

    acceptTerms();
    setIsConnecting(true);
    setStatus("");

    try {
      const address = await connectWallet();
      setWalletAddress(address);
      setStatus("Checking Soroban username registry...");

      const username = await getWalletUsernameOnChain({
        userAddress: address,
        network: defaultNetwork,
      });

      setStatus("Sign once to create your secure CoverFi session...");
      const backendSession = await createBackendWalletSession(address);
      await unlockPrivateStorage(address, backendSession.storageSignature);
      createWalletSession(address, username, {
        loginMethod: "wallet",
        network: defaultNetwork,
        backendSessionToken: backendSession.token,
      });
      await navigateToAppRoute(getSafeNextRoute());
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not connect a Stellar wallet.",
      );
    } finally {
      setIsConnecting(false);
    }
  }

  function handleHomeClick() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.assign("https://coverfi.space");
  }

  async function handleSendOtp() {
    acceptTerms();
    setTermsAccepted(true);
    setIsConnecting(true);
    setStatus("");

    try {
      const response = await fetch(getApiUrl("/api/onboarding/email/start"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await readJsonResponse(response);
      setOtpId(data.otpId);
      setOtp("");
      setMfaChallengeId("");
      setMfaCode("");
      setMfaSetupSecret("");
      setMfaSetupUrl("");
      setPendingEmailSessionToken("");
      setStatus("OTP sent. Enter the code from your email.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send OTP.");
    } finally {
      setIsConnecting(false);
    }
  }

  function handleChangeEmail() {
    setOtpId("");
    setOtp("");
    setMfaChallengeId("");
    setMfaCode("");
    setMfaSetupSecret("");
    setMfaSetupUrl("");
    setPendingEmailSessionToken("");
    setStatus("");
  }

  async function finishEmailWallet(verified: { token: string; expiresAt?: string; mfaEnabled?: boolean; mfaEnrollmentProof?: string }) {
      if (!verified.token) {
        throw new Error("Authenticator verification did not return a session token.");
      }
      const embedded = createEmbeddedWalletSession({
        network: defaultNetwork,
      });
      setWalletAddress(embedded.publicKey);

      setStatus(
        defaultNetwork === "testnet"
          ? "Creating testnet wallet and asking Friendbot to fund it..."
          : "Creating mainnet wallet address. Mainnet funding is not automatic.",
      );

      const walletResponse = await fetch(getApiUrl("/api/onboarding/wallets/register-or-fund"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${verified.token}`,
        },
        body: JSON.stringify({
          walletAddress: embedded.publicKey,
          network: defaultNetwork,
        }),
      });
      const walletData = await readJsonResponse(walletResponse);
      updateEmbeddedWalletSession({
        fundingStatus: walletData.fundingStatus,
      });

      try {
        const commitment = await createEmailWalletCommitment({
          email,
          walletAddress: embedded.publicKey,
          network: defaultNetwork,
        });
        await fetch(getApiUrl("/api/zk/commitments/email-wallet"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${verified.token}`,
          },
          body: JSON.stringify({
            walletAddress: embedded.publicKey,
            network: defaultNetwork,
            commitment: commitment.commitment,
            circuitId: commitment.circuitId,
            commitmentScheme: commitment.commitmentScheme,
            publicSignals: {
              fundingStatus: walletData.fundingStatus,
              mfaEnabled: Boolean(verified.mfaEnabled),
            },
          }),
        });
      } catch {
        // ZK commitment storage is useful metadata, but it must not block wallet creation.
      }

      if (verified.mfaEnabled) {
        try {
          const proof = await createEmailWalletSignatureProof({
            walletAddress: embedded.publicKey,
            network: defaultNetwork,
            purpose: "coverfi.mfa.enabled.v1",
            challenge: verified.mfaEnrollmentProof || "",
          });
          await fetch(getApiUrl("/api/zk/proofs/record"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subjectRef: embedded.publicKey,
              circuitId: "coverfi.mfa.enabled.v1",
              proofSystem: "stellar-ed25519",
              proof,
              publicSignals: {
                network: defaultNetwork,
                walletAddress: embedded.publicKey,
                mfaEnabled: true,
              },
            }),
          });
        } catch {
          // The wallet-bound MFA proof is additive; login should not fail if proof recording is unavailable.
        }
      }

      await unlockPrivateStorage(embedded.publicKey);
      createWalletSession(embedded.publicKey, "", {
        loginMethod: "email",
        email: email.trim().toLowerCase(),
        network: defaultNetwork,
      });
      await navigateToAppRoute(getSafeNextRoute());
  }

  async function handleEmailWalletCreate() {
    if (!otpId) {
      setStatus("Send the OTP first.");
      return;
    }

    setIsConnecting(true);
    setStatus("");

    try {
      if (mfaChallengeId) {
        const mfaResponse = await fetch(getApiUrl("/api/onboarding/email/mfa/verify"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, challengeId: mfaChallengeId, code: mfaCode, network: defaultNetwork }),
        });
        await finishEmailWallet(await readJsonResponse(mfaResponse));
        return;
      }

      const verifyResponse = await fetch(getApiUrl("/api/onboarding/email/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otpId, otp, network: defaultNetwork }),
      });
      const verifiedEmail = await readJsonResponse(verifyResponse);

      if (verifiedEmail.mfaRequired) {
        setMfaChallengeId(verifiedEmail.challengeId);
        setMfaSetupSecret("");
        setMfaSetupUrl("");
        setPendingEmailSessionToken("");
        setStatus("Enter the 6-digit code from your authenticator app.");
        return;
      }

      if (verifiedEmail.mfaSetupAvailable) {
        setMfaChallengeId(verifiedEmail.challengeId);
        setMfaSetupSecret(verifiedEmail.secret || "");
        setMfaSetupUrl(verifiedEmail.otpauthUrl || "");
        setPendingEmailSessionToken(verifiedEmail.token || "");
        setStatus("Optional: add CoverFi to Google Authenticator or Microsoft Authenticator, or skip MFA and continue.");
        return;
      }

      await finishEmailWallet(verifiedEmail);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create email wallet.");
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleSkipMfaSetup() {
    if (!pendingEmailSessionToken) {
      setStatus("Verify your email OTP first.");
      return;
    }

    setIsConnecting(true);
    setStatus("");

    try {
      await finishEmailWallet({ token: pendingEmailSessionToken });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create email wallet.");
    } finally {
      setIsConnecting(false);
    }
  }

  if (loginMode === "email" && mfaSetupSecret && pendingEmailSessionToken) {
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
        <div className="absolute inset-0 bg-linear-to-b from-black/45 via-black/55 to-black/85" />

        <section className="relative z-10 flex min-h-[calc(100vh-2rem)] items-center justify-center md:min-h-[calc(100vh-3rem)]">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
            className="liquid-glass grid w-full max-w-4xl gap-6 rounded-3xl p-6 md:grid-cols-[360px_1fr] md:p-8">
            <div>
              <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#E1E0CC]/45">
                Optional MFA
              </p>
              <h1 className="font-serif text-5xl italic leading-none text-[#E1E0CC] md:text-6xl">
                Secure CoverFi.
              </h1>
              <p className="mt-5 text-sm leading-relaxed text-[#E1E0CC]/60">
                Scan this QR in Google Authenticator, Microsoft Authenticator,
                Authy, or 1Password. Then enter the six-digit code.
              </p>
              <div className="mt-6 rounded-2xl border border-[#E1E0CC]/10 bg-black/30 p-4 text-xs leading-relaxed text-[#E1E0CC]/52">
                MFA enrollment is bound to your email login and the generated
                wallet signs a proof after setup.
              </div>
            </div>

            <div className="grid gap-5">
              <AuthenticatorQrCode
                value={mfaSetupUrl}
                secret={mfaSetupSecret}
                label="Scan with Authenticator"
                size={260}
              />
              <CodeBoxes
                label="Authenticator code"
                value={mfaCode}
                onChange={setMfaCode}
                disabled={isConnecting}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleSkipMfaSetup}
                  disabled={isConnecting}
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#E1E0CC]/18 bg-black/25 px-4 text-xs uppercase tracking-widest text-[#E1E0CC]/75 transition-colors hover:bg-[#E1E0CC]/10 disabled:cursor-not-allowed disabled:opacity-70">
                  Skip MFA for now
                </button>
                <button
                  type="button"
                  onClick={handleEmailWalletCreate}
                  disabled={isConnecting || mfaCode.length !== 6}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#E1E0CC] px-5 text-xs uppercase tracking-widest text-black transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-70">
                  {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Enable MFA
                </button>
              </div>
              {status && (
                <p className="text-sm leading-relaxed text-[#E1E0CC]/65">
                  {status}
                </p>
              )}
            </div>
          </motion.div>
        </section>
      </main>
    );
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

      <button
        type="button"
        onClick={handleHomeClick}
        className="coverfi-nav-link absolute left-6 top-6 z-20 inline-flex items-center gap-2 text-sm text-[#E1E0CC]/75 transition-colors hover:text-[#E1E0CC]">
        <ArrowLeft className="h-4 w-4" />
        Home
      </button>

      <a
        href={publicStatusUrl}
        target="_blank"
        rel="noreferrer"
        className="coverfi-nav-link absolute right-6 top-6 z-20 inline-flex items-center gap-2 text-sm text-[#E1E0CC]/75 transition-colors hover:text-[#E1E0CC]">
        <Activity className="h-4 w-4" />
        Status
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
            Connect a Stellar wallet, or create a simple email-based wallet
            for a smoother onboarding.
          </p>

          {!isEmailVerificationStep && (
            <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl border border-[#E1E0CC]/10 bg-black/25 p-1">
              {[
                { id: "wallet" as const, label: "Connect wallet", icon: Wallet },
                { id: "email" as const, label: "Email OTP", icon: Mail },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setLoginMode(item.id);
                      setStatus("");
                    }}
                    className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm transition ${
                      loginMode === item.id
                        ? "bg-[#E1E0CC] text-black"
                        : "text-[#E1E0CC]/65 hover:text-[#E1E0CC]"
                    }`}>
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          )}

          {!isEmailVerificationStep && (
            <label className="mt-6 flex items-start gap-3 rounded-2xl border border-[#E1E0CC]/10 bg-black/25 p-4 text-sm leading-relaxed text-[#E1E0CC]/62">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(event) => {
                  setTermsAccepted(event.target.checked);
                  if (event.target.checked) {
                    acceptTerms();
                  } else {
                    window.localStorage.removeItem(`coverfi_terms_${termsVersion}`);
                  }
                }}
                className="mt-1 h-4 w-4 accent-[#E1E0CC]"
              />
              <span>
                I accept the{" "}
                <a href="/terms" className="coverfi-nav-link text-[#E1E0CC]">
                  Terms and Privacy notice
                </a>
                . CoverFi protection is not insurance and payouts are not guaranteed.
              </span>
            </label>
          )}

          {loginMode === "email" && (
            <div className="mt-6 grid gap-4">
              {!otpId ? (
                <label className="grid gap-2 text-sm text-[#E1E0CC]/60">
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    className="h-12 rounded-xl border border-[#E1E0CC]/12 bg-black/35 px-4 text-[#E1E0CC] outline-none focus:border-[#E1E0CC]/45"
                  />
                </label>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#E1E0CC]/10 bg-black/25 p-4">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.24em] text-[#E1E0CC]/38">
                      OTP sent to
                    </p>
                    <p className="mt-1 truncate text-sm text-[#E1E0CC]">{email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleChangeEmail}
                    disabled={isConnecting}
                    className="shrink-0 rounded-xl border border-[#E1E0CC]/18 px-3 py-2 text-xs uppercase tracking-widest text-[#E1E0CC]/70 transition-colors hover:bg-[#E1E0CC]/10 disabled:cursor-not-allowed disabled:opacity-60">
                    Change
                  </button>
                </div>
              )}
              {otpId && (
                <CodeBoxes
                  label="OTP"
                  value={otp}
                  onChange={setOtp}
                  disabled={isConnecting}
                />
              )}
              {mfaChallengeId && (
                <div className="grid gap-3 rounded-xl border border-[#E1E0CC]/12 bg-black/30 p-4">
                  <div className="inline-flex items-center gap-2 text-sm text-[#E1E0CC]">
                    <ShieldCheck className="h-4 w-4" />
                    Authenticator app
                  </div>
                  <CodeBoxes
                    label="Authenticator code"
                    value={mfaCode}
                    onChange={setMfaCode}
                    disabled={isConnecting}
                  />
                </div>
              )}
            </div>
          )}

          {!walletAddress && loginMode === "wallet" ? (
            <button
              type="button"
              onClick={handleConnect}
              disabled={isConnecting || !termsAccepted}
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#E1E0CC] px-6 py-4 text-sm uppercase tracking-widest text-black transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-70">
              {isConnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wallet className="h-4 w-4" />
              )}
              Connect wallet
            </button>
          ) : !walletAddress && loginMode === "email" ? (
            !otpId ? (
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={isConnecting || !email.trim()}
                className="mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#E1E0CC] px-5 text-xs uppercase tracking-widest text-black transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-70">
                {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Send OTP
              </button>
            ) : (
              <button
                type="button"
                onClick={handleEmailWalletCreate}
                disabled={isConnecting || otp.length !== 6 || (Boolean(mfaChallengeId) && mfaCode.length !== 6)}
                className="mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#E1E0CC] px-5 text-xs uppercase tracking-widest text-black transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-70">
                {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                {mfaChallengeId ? "Verify MFA" : "Verify OTP"}
              </button>
            )
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
