import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { Buffer } from "buffer";
import type { StellarNetwork } from "../context/AppContext";
import { signTransactionWithSelectedWallet } from "./walletKit";
import { getStoredSession } from "./usernameStore";

const EMBEDDED_WALLET_KEY = "coverfi_embedded_wallet_session";

export type EmbeddedWalletSession = {
  type: "email";
  publicKey: string;
  secretKey: string;
  network: StellarNetwork;
  createdAt: string;
  fundingStatus?: string;
};

function networkPassphrase(network: StellarNetwork) {
  return network === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function getStorage() {
  return typeof window !== "undefined" ? window.sessionStorage : null;
}

export function getEmbeddedWalletSession() {
  try {
    const raw = getStorage()?.getItem(EMBEDDED_WALLET_KEY);
    return raw ? (JSON.parse(raw) as EmbeddedWalletSession) : null;
  } catch {
    return null;
  }
}

export function createEmbeddedWalletSession(input: {
  network: StellarNetwork;
}) {
  if (input.network === "mainnet") {
    throw new Error("Email wallets are disabled on mainnet. Connect a self-custody Stellar wallet instead.");
  }
  const keypair = Keypair.random();
  const session: EmbeddedWalletSession = {
    type: "email",
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
    network: input.network,
    createdAt: new Date().toISOString(),
  };
  getStorage()?.setItem(EMBEDDED_WALLET_KEY, JSON.stringify(session));
  return session;
}

export function updateEmbeddedWalletSession(updates: Partial<EmbeddedWalletSession>) {
  const existing = getEmbeddedWalletSession();
  if (!existing) return null;
  const next = { ...existing, ...updates };
  getStorage()?.setItem(EMBEDDED_WALLET_KEY, JSON.stringify(next));
  return next;
}

export function clearEmbeddedWalletSession() {
  getStorage()?.removeItem(EMBEDDED_WALLET_KEY);
}

export function getEmbeddedWalletForAddress(address: string, networkPassphraseValue: string) {
  const session = getEmbeddedWalletSession();
  if (!session || session.publicKey !== address) return null;
  if (networkPassphrase(session.network) !== networkPassphraseValue) return null;
  return session;
}

export async function signTransactionWithAvailableWallet(
  transactionXdr: string,
  options: {
    address: string;
    networkPassphrase: string;
  },
): Promise<{
  signedTxXdr?: string;
  signerAddress?: string;
  error?: {
    message?: string;
  };
}> {
  const embedded = getEmbeddedWalletForAddress(
    options.address,
    options.networkPassphrase,
  );

  if (embedded) {
    if (embedded.network === "mainnet") {
      return {
        error: {
          message: "Email wallet signing is disabled on mainnet. Connect a self-custody Stellar wallet instead.",
        },
      };
    }
    const transaction = TransactionBuilder.fromXDR(
      transactionXdr,
      options.networkPassphrase,
    );
    transaction.sign(Keypair.fromSecret(embedded.secretKey));
    return { signedTxXdr: transaction.toXDR(), signerAddress: embedded.publicKey };
  }

  const session = getStoredSession();
  if (session?.loginMethod === "email" && session.walletAddress === options.address) {
    return {
      error: {
        message: "Email wallet signing key is not available for this network. Log in again with email OTP.",
      },
    };
  }

  return signTransactionWithSelectedWallet(transactionXdr, options);
}

export function privateStorageMaterialForEmbeddedWallet(walletAddress: string) {
  const session = getEmbeddedWalletSession();
  if (!session || session.publicKey !== walletAddress) return "";
  return `coverfi-email-wallet:${session.publicKey}:${session.secretKey}:${session.createdAt}`;
}

export async function createEmailWalletCommitment(input: {
  walletAddress: string;
  email: string;
  network: StellarNetwork;
}) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(32));
  const salt = Array.from(saltBytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const message = [
    "coverfi.email_wallet_ownership.v0",
    input.network,
    input.walletAddress,
    input.email.trim().toLowerCase(),
    salt,
  ].join(":");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(message),
  );
  const commitment = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return {
    commitment,
    salt,
    circuitId: "coverfi.email_wallet_ownership.v0",
    commitmentScheme: "sha256-v0",
  };
}

export async function createEmailWalletSignatureProof(input: {
  walletAddress: string;
  network: StellarNetwork;
  purpose: string;
  challenge?: string;
}) {
  const session = getEmbeddedWalletSession();
  if (!session || session.publicKey !== input.walletAddress || session.network !== input.network) {
    throw new Error("Email wallet signing key is not available for this proof.");
  }

  const message = [
    input.purpose,
    input.network,
    input.walletAddress,
    input.challenge || "",
    new Date().toISOString(),
  ].join(":");
  const messageBytes = new TextEncoder().encode(message);
  const digest = await crypto.subtle.digest("SHA-256", messageBytes);
  const digestBytes = new Uint8Array(digest);
  const signature = Keypair.fromSecret(session.secretKey).sign(Buffer.from(digestBytes));

  return {
    message,
    digest: bytesToHex(digestBytes),
    signature: bytesToBase64(signature),
    signer: session.publicKey,
    scheme: "stellar-ed25519-sha256",
  };
}
