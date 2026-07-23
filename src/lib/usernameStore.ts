const SESSION_KEY = "prisma_session";

function getStorage() {
  return typeof window !== "undefined" ? window.sessionStorage : null;
}

export type PrismaSession = {
  username: string;
  walletAddress: string;
  loginMethod?: "wallet" | "freighter" | "email";
  email?: string;
  network?: "testnet" | "mainnet";
  backendSessionToken?: string;
};

export function getStoredSession() {
  try {
    const storage = getStorage();
    const stored = storage?.getItem(SESSION_KEY);
    return stored ? (JSON.parse(stored) as PrismaSession) : null;
  } catch {
    return null;
  }
}

export function storeSession(session: PrismaSession) {
  const storage = getStorage();
  storage?.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function createWalletSession(
  walletAddress: string,
  username = "",
  metadata: Pick<PrismaSession, "loginMethod" | "email" | "network" | "backendSessionToken"> = {},
) {
  return storeSession({
    username,
    walletAddress,
    ...metadata,
  });
}

export function updateStoredSession(updates: Partial<PrismaSession>) {
  const existing = getStoredSession();
  return storeSession({
    username: "",
    walletAddress: "",
    ...existing,
    ...updates,
  });
}

export function saveContractUsername(username: string, walletAddress: string) {
  const existing = getStoredSession();
  return storeSession({
    ...existing,
    username: username.trim().toLowerCase(),
    walletAddress,
  });
}

export function clearStoredSession() {
  getStorage()?.removeItem(SESSION_KEY);
}
