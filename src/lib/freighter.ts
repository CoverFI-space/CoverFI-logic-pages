import { getApiUrl } from "./api";
import {
  connectStellarWallet,
  networkPassphraseFromEnv,
  signStellarWalletMessage,
  signTransactionWithSelectedWallet,
} from "./walletKit";

type WalletSessionResponse = {
  token: string;
};

export type BackendWalletSession = {
  token: string;
  storageSignature: string;
};

function supportsMessageSigning(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return !/(does not support.*sign.?message|sign.?message.*not supported|unsupported.*sign.?message)/i.test(message);
}

async function readJsonResponse(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || data?.error?.message || `Request failed with ${response.status}.`);
  }
  return data;
}

export async function connectWallet() {
  return connectStellarWallet();
}

export async function connectFreighterWallet() {
  return connectWallet();
}

export async function signWalletAuthMessage(
  message: string,
  address: string,
  options: { legacyBase64Payload?: boolean } = {},
) {
  return signStellarWalletMessage(message, address, options);
}

export async function createBackendWalletSession(address: string): Promise<BackendWalletSession> {
  const challengeResponse = await fetch(getApiUrl("/api/auth/challenge"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: address }),
  });
  const challenge = await readJsonResponse(challengeResponse);

  let signature = "";
  let session: WalletSessionResponse;
  try {
    signature = await signWalletAuthMessage(challenge.message, address, {
      legacyBase64Payload: true,
    });
    const verifyResponse = await fetch(getApiUrl("/api/auth/session"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress: address,
        message: challenge.message,
        nonce: challenge.nonce,
        signature,
      }),
    });
    session = (await readJsonResponse(verifyResponse)) as WalletSessionResponse;
  } catch (error) {
    if (supportsMessageSigning(error)) throw error;

    const transactionChallengeResponse = await fetch(getApiUrl("/api/auth/transaction-challenge"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: address }),
    });
    const transactionChallenge = await readJsonResponse(transactionChallengeResponse);
    const signed = await signTransactionWithSelectedWallet(transactionChallenge.xdr, {
      address,
      networkPassphrase: networkPassphraseFromEnv(),
    });
    if (!signed.signedTxXdr) {
      throw new Error(signed.error?.message || "The selected wallet did not sign the authentication request.");
    }
    const verifyResponse = await fetch(getApiUrl("/api/auth/transaction-session"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress: address,
        nonce: transactionChallenge.nonce,
        signedTxXdr: signed.signedTxXdr,
      }),
    });
    session = (await readJsonResponse(verifyResponse)) as WalletSessionResponse;
    signature = signed.signedTxXdr;
  }

  if (!session.token) {
    throw new Error("Wallet authentication did not return a session token.");
  }

  return { token: session.token, storageSignature: signature };
}
