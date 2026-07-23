import { getApiUrl } from "./api";
import { connectStellarWallet, signStellarWalletMessage } from "./walletKit";

type WalletSessionResponse = {
  token: string;
};

export type BackendWalletSession = {
  token: string;
  storageSignature: string;
};

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

  const signature = await signWalletAuthMessage(challenge.message, address, {
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
  const session = (await readJsonResponse(verifyResponse)) as WalletSessionResponse;

  if (!session.token) {
    throw new Error("Wallet authentication did not return a session token.");
  }

  return { token: session.token, storageSignature: signature };
}
