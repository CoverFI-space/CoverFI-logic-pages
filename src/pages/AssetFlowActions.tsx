import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { PrimaryButton } from "../components/dashboard/DashboardComponents";
import { useDepositFree } from "../context/AppContext";
import { getApiUrl } from "../lib/api";
import {
  createProtectionPositionOnChain,
  getDefaultProtectionAsset,
  getPayoutAssetBalanceOnChain,
  getProtectionAssetOptions,
  getProtectionQuoteOnChain,
  getUsernameRegistrationQuoteOnChain,
  getUsernameAddressOnChain,
  preflightProtectionPositionOnChain,
  registerUsernameOnChain,
  sendUsernamePayment,
  trustPayoutAssetOnChain,
} from "../lib/stellarContracts";
import { getStoredSession, saveContractUsername } from "../lib/usernameStore";
export type FlowNodeState =
  | "Idle"
  | "Ready"
  | "Processing"
  | "Successful"
  | "Rejected"
  | "Failed";
type FlowKind = "protect" | "username";
function staleOracleMessage() {
  return "Oracle observation is stale. New quotes and positions are paused until an authorized oracle publisher updates the feed.";
}
function isStaleOracle(error: unknown) {
  return String(error || "")
    .toLowerCase()
    .includes("oracle price is stale");
}

function failureState(error: unknown): FlowNodeState {
  const message = String(error || "").toLowerCase();
  return message.includes("not signed") || message.includes("rejected")
    ? "Rejected"
    : "Failed";
}
async function requestTestCftusd(walletAddress: string, amount = "5") {
  const session = getStoredSession();
  const response = await fetch(
    getApiUrl("/api/onboarding/testnet/cftusd/fund"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CoverFi-Wallet-Address": walletAddress,
        ...(session?.backendSessionToken
          ? { Authorization: `Bearer ${session.backendSessionToken}` }
          : {}),
      },
      body: JSON.stringify({ walletAddress, amount }),
    },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(data?.message || "Could not fund test CFTUSD.");
}
function ProtectionAction({
  walletAddress,
  onNodeStates,
}: {
  walletAddress: string;
  onNodeStates: (state: Record<string, FlowNodeState>) => void;
}) {
  const { createPosition, network } = useDepositFree();
  const [asset, setAsset] = useState(() =>
    getDefaultProtectionAsset("testnet"),
  );
  const [amount, setAmount] = useState("");
  const [duration, setDuration] = useState("7");
  const [quote, setQuote] = useState<Awaited<
    ReturnType<typeof getProtectionQuoteOnChain>
  > | null>(null);
  const [status, setStatus] = useState(
    "Enter an amount to request an on-chain quote.",
  );
  const [submitting, setSubmitting] = useState(false);
  const options = getProtectionAssetOptions(network).filter(
    (option) => option.configured,
  );
  const parsedAmount = Number(amount);
  useEffect(() => {
    if (!options.some((option) => option.label === asset))
      setAsset(getDefaultProtectionAsset(network));
  }, [asset, network, options]);
  useEffect(() => {
    let cancelled = false;
    setQuote(null);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      onNodeStates({
        wallet: "Ready",
        engine: "Idle",
        "principal-vault": "Idle",
        "reserve-vault": "Idle",
        settlement: "Idle",
      });
      return;
    }
    const timer = window.setTimeout(() => {
      void getProtectionQuoteOnChain({
        userAddress: walletAddress,
        network,
        asset,
        protectedAmount: parsedAmount,
        durationSeconds: Number(duration) * 86400,
      })
        .then((nextQuote) => {
          if (cancelled) return;
          setQuote(nextQuote);
          setStatus(
            "Contract quote is ready. Review the breakdown before signing.",
          );
          onNodeStates({
            wallet: "Ready",
            engine: "Ready",
            "principal-vault": "Ready",
            "reserve-vault": "Ready",
            settlement: "Idle",
          });
        })
        .catch((error) => {
          if (cancelled) return;
          setStatus(
            isStaleOracle(error)
              ? staleOracleMessage()
              : error instanceof Error
                ? error.message
                : "Contract quote is unavailable.",
          );
          onNodeStates({
            wallet: "Ready",
            engine: "Idle",
            "principal-vault": "Idle",
            "reserve-vault": "Idle",
            settlement: "Idle",
          });
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [asset, duration, network, onNodeStates, parsedAmount, walletAddress]);
  async function ensureTestPremiumToken() {
    if (network !== "testnet") return;
    const balance = await getPayoutAssetBalanceOnChain({
      userAddress: walletAddress,
      network,
    });
    if (balance === null) {
      setStatus(
        "Creating the test CFTUSD trustline. Review the wallet request.",
      );
      await trustPayoutAssetOnChain({ userAddress: walletAddress, network });
      await requestTestCftusd(walletAddress);
    } else if (balance < 1) {
      setStatus("Funding test CFTUSD for the protection premium.");
      await requestTestCftusd(walletAddress);
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quote || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return;
    const input = {
      userAddress: walletAddress,
      network,
      asset,
      protectedAmount: parsedAmount,
      durationSeconds: Number(duration) * 86400,
    };
    setSubmitting(true);
    onNodeStates({
      wallet: "Processing",
      engine: "Processing",
      "principal-vault": "Processing",
      "reserve-vault": "Processing",
      settlement: "Idle",
    });
    try {
      await ensureTestPremiumToken();
      await preflightProtectionPositionOnChain(input);
      setStatus(
        "Review the exact contract transaction in your wallet. CoverFi cannot sign it for you.",
      );
      const receipt = await createProtectionPositionOnChain(input);
      const expiry = new Date(
        Date.now() + Number(duration) * 86400 * 1000,
      ).toISOString();
      createPosition({
        asset,
        protectedAmount: parsedAmount,
        feePaid: quote.totalDue,
        entryPrice: quote.entryPrice,
        currentPrice: quote.entryPrice,
        expiryTime: expiry,
        maximumPayout: quote.maximumPayout,
        contractPositionId: receipt.contractPositionId,
        transactionHash: receipt.transactionHash,
        assetContractId: receipt.assetContractId,
        payoutAssetContractId: receipt.payoutAssetContractId,
      });
      setStatus(
        "Protection position is active on-chain. Its settlement node activates at expiry.",
      );
      onNodeStates({
        wallet: "Successful",
        engine: "Successful",
        "principal-vault": "Successful",
        "reserve-vault": "Successful",
        settlement: "Ready",
      });
    } catch (error) {
      setStatus(
        isStaleOracle(error)
          ? staleOracleMessage()
          : error instanceof Error
            ? error.message
            : "Could not create the protection position.",
      );
      onNodeStates({
        wallet: failureState(error),
        engine: failureState(error),
        "principal-vault": "Failed",
        "reserve-vault": "Failed",
        settlement: "Idle",
      });
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <form onSubmit={submit} className="flow-action-panel">
      {" "}
      <div className="flow-action-heading">
        <span className="flow-action-icon">
          <ShieldCheck size={20} />
        </span>
        <div>
          <p>Protect / deposit assets</p>
          <h2>Create a protected position</h2>
        </div>
      </div>{" "}
      <p className="flow-action-copy">
        This is the same on-chain protection route: quote, preflight, user
        wallet review, and contract confirmation. The fixed canvas above shows
        where each step is recorded.
      </p>{" "}
      <div className="flow-form-grid">
        {" "}
        <label>
          <span>Protected asset</span>
          <select
            value={asset}
            onChange={(event) => setAsset(event.target.value)}
          >
            {options.map((option) => (
              <option key={option.label} value={option.label}>
                {option.symbol}
              </option>
            ))}
          </select>
        </label>{" "}
        <label>
          <span>Protected amount</span>
          <input
            inputMode="decimal"
            min="0"
            step="any"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="100"
          />
        </label>{" "}
        <label>
          <span>Protection duration</span>
          <select
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
          >
            {[1, 7, 14, 30].map((day) => (
              <option key={day} value={day}>
                {day} day{day === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </label>{" "}
      </div>{" "}
      <div className="flow-quote-grid">
        {" "}
        <div>
          <span>Premium</span>
          <strong>{quote ? quote.totalDue.toFixed(7) : "—"}</strong>
        </div>{" "}
        <div>
          <span>Maximum payout</span>
          <strong>{quote ? quote.maximumPayout.toFixed(7) : "—"}</strong>
        </div>{" "}
        <div>
          <span>Reserve utilization</span>
          <strong>
            {quote ? `${(quote.utilizationBps / 100).toFixed(2)}%` : "—"}
          </strong>
        </div>{" "}
      </div>{" "}
      <p className="flow-action-status">
        {submitting && <LoaderCircle size={15} className="animate-spin" />}
        {status}
      </p>{" "}
      <PrimaryButton
        type="submit"
        disabled={!quote || submitting}
        className="w-full"
      >
        {submitting
          ? "Confirming on-chain position"
          : "Review & sign protection"}
      </PrimaryButton>{" "}
    </form>
  );
}
function UsernameAction({
  username,
  walletAddress,
  onNodeStates,
}: {
  username: string;
  walletAddress: string;
  onNodeStates: (state: Record<string, FlowNodeState>) => void;
}) {
  const { network } = useDepositFree();
  const [currentUsername, setCurrentUsername] = useState(username);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [recipient, setRecipient] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState(
    "Register a username or look up a recipient before payment.",
  );
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    onNodeStates({
      "username-wallet": "Ready",
      registry: currentUsername ? "Successful" : "Idle",
      "fee-routing": currentUsername ? "Successful" : "Idle",
      lookup: recipientAddress ? "Successful" : "Idle",
      payment: "Idle",
    });
  }, [currentUsername, onNodeStates, recipientAddress]);
  async function register(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!usernameDraft.trim()) return;
    setBusy(true);
    onNodeStates({
      "username-wallet": "Processing",
      registry: "Processing",
      "fee-routing": "Processing",
      lookup: "Idle",
      payment: "Idle",
    });
    try {
      const quote = await getUsernameRegistrationQuoteOnChain({
        userAddress: walletAddress,
        network,
        username: usernameDraft,
      });
      if (network === "testnet") {
        const balance = await getPayoutAssetBalanceOnChain({
          userAddress: walletAddress,
          network,
        });
        if (balance === null) {
          setStatus(
            "Creating the test CFTUSD trustline before username registration. Review the wallet request.",
          );
          await trustPayoutAssetOnChain({
            userAddress: walletAddress,
            network,
          });
          await requestTestCftusd(walletAddress, "5");
        } else if (balance < quote.totalFee) {
          const topUp = Math.min(
            10,
            Math.max(5, quote.totalFee - balance + 0.1),
          );
          setStatus(
            `Funding ${topUp.toFixed(2)} test CFTUSD for the ${quote.totalFee.toFixed(2)} CFTUSD registration fee.`,
          );
          await requestTestCftusd(walletAddress, topUp.toFixed(2));
          const refreshedBalance = await getPayoutAssetBalanceOnChain({
            userAddress: walletAddress,
            network,
          });
          if (refreshedBalance === null || refreshedBalance < quote.totalFee) {
            throw new Error(
              `Username registration needs ${quote.totalFee.toFixed(2)} CFTUSD. The test faucet can issue at most 10 CFTUSD per request; request another testnet top-up and try again.`,
            );
          }
        }
      }
      const result = await registerUsernameOnChain({
        userAddress: walletAddress,
        network,
        username: usernameDraft,
      });
      saveContractUsername(result.username, result.walletAddress);
      setCurrentUsername(result.username);
      setUsernameDraft("");
      setStatus(
        `@${result.username} is active on the Soroban username registry.`,
      );
      onNodeStates({
        "username-wallet": "Successful",
        registry: "Successful",
        "fee-routing": "Successful",
        lookup: "Idle",
        payment: "Idle",
      });
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Username registration failed.",
      );
      onNodeStates({
        "username-wallet": failureState(error),
        registry: failureState(error),
        "fee-routing": "Failed",
        lookup: "Idle",
        payment: "Idle",
      });
    } finally {
      setBusy(false);
    }
  }
  async function lookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recipient.trim()) return;
    setBusy(true);
    setRecipientAddress("");
    onNodeStates({
      "username-wallet": "Ready",
      registry: currentUsername ? "Successful" : "Idle",
      "fee-routing": currentUsername ? "Successful" : "Idle",
      lookup: "Processing",
      payment: "Idle",
    });
    try {
      const result = await getUsernameAddressOnChain({
        userAddress: walletAddress,
        network,
        username: recipient,
      });
      setRecipientAddress(result.walletAddress);
      setStatus(
        `Recipient @${result.username} resolved. Review the destination before signing.`,
      );
      onNodeStates({
        "username-wallet": "Ready",
        registry: currentUsername ? "Successful" : "Idle",
        "fee-routing": currentUsername ? "Successful" : "Idle",
        lookup: "Successful",
        payment: "Ready",
      });
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Username lookup failed.",
      );
      onNodeStates({
        "username-wallet": "Ready",
        registry: currentUsername ? "Successful" : "Idle",
        "fee-routing": currentUsername ? "Successful" : "Idle",
        lookup: "Failed",
        payment: "Idle",
      });
    } finally {
      setBusy(false);
    }
  }
  async function pay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (
      !recipientAddress ||
      !currentUsername ||
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0
    )
      return;
    setBusy(true);
    onNodeStates({
      "username-wallet": "Processing",
      registry: "Successful",
      "fee-routing": "Successful",
      lookup: "Successful",
      payment: "Processing",
    });
    try {
      await sendUsernamePayment({
        userAddress: walletAddress,
        network,
        receiverAddress: recipientAddress,
        amount: parsedAmount,
        asset: "XLM",
      });
      setAmount("");
      setStatus(`XLM payment to @${recipient} completed on Stellar.`);
      onNodeStates({
        "username-wallet": "Successful",
        registry: "Successful",
        "fee-routing": "Successful",
        lookup: "Successful",
        payment: "Successful",
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Payment failed.");
      onNodeStates({
        "username-wallet": failureState(error),
        registry: "Successful",
        "fee-routing": "Successful",
        lookup: "Successful",
        payment: failureState(error),
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="flow-action-panel">
      {" "}
      <div className="flow-action-heading">
        <span className="flow-action-icon">
          <WalletCards size={20} />
        </span>
        <div>
          <p>Usernames & payments</p>
          <h2>Register, resolve, and pay</h2>
        </div>
      </div>{" "}
      <p className="flow-action-copy">
        Every action below uses the fixed username flow above. A wallet
        signature is required for registration and payment; lookup cannot move
        funds.
      </p>{" "}
      {!currentUsername ? (
        <form onSubmit={register} className="flow-inline-form">
          <label>
            <span>Choose username</span>
            <input
              value={usernameDraft}
              onChange={(event) => setUsernameDraft(event.target.value)}
              placeholder="your_name"
              maxLength={24}
            />
          </label>
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? "Registering" : "Register username"}
          </PrimaryButton>
        </form>
      ) : (
        <div className="flow-owned-name">
          <CheckCircle2 size={17} /> @{currentUsername} is active for this
          wallet.
        </div>
      )}{" "}
      <form onSubmit={lookup} className="flow-inline-form flow-space-top">
        <label>
          <span>Recipient username</span>
          <input
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            placeholder="recipient_name"
            maxLength={24}
          />
        </label>
        <PrimaryButton type="submit" variant="outline" disabled={busy}>
          {busy ? "Resolving" : "Resolve username"}
        </PrimaryButton>
      </form>{" "}
      {recipientAddress && (
        <form onSubmit={pay} className="flow-payment-form">
          <div className="flow-resolved">
            <CircleAlert size={16} />
            <span>
              Paying @{recipient} at <strong>{recipientAddress}</strong>
            </span>
          </div>
          <label>
            <span>XLM amount</span>
            <input
              inputMode="decimal"
              min="0"
              step="any"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="10"
            />
          </label>
          <PrimaryButton type="submit" disabled={busy || !currentUsername}>
            {busy ? "Preparing wallet payment" : "Review & sign payment"}
          </PrimaryButton>
        </form>
      )}{" "}
      <p className="flow-action-status">
        {busy && <LoaderCircle size={15} className="animate-spin" />}
        {status}
      </p>{" "}
    </section>
  );
}
export default function AssetFlowActions({
  flow,
  username,
  walletAddress,
  onNodeStates,
}: {
  flow: FlowKind;
  username: string;
  walletAddress: string;
  onNodeStates: (state: Record<string, FlowNodeState>) => void;
}) {
  return flow === "protect" ? (
    <ProtectionAction
      walletAddress={walletAddress}
      onNodeStates={onNodeStates}
    />
  ) : (
    <UsernameAction
      username={username}
      walletAddress={walletAddress}
      onNodeStates={onNodeStates}
    />
  );
}
