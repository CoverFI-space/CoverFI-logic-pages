import { getApiUrl } from "./api";

const SESSION_KEY = "prisma_session";

function getStorage() {
  return typeof window !== "undefined" ? window.sessionStorage : null;
}

export type PrismaSession = {
  username: string;
  walletAddress: string;
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

export function createWalletSession(walletAddress: string) {
  return storeSession({
    username: "",
    walletAddress,
  });
}

async function readApiMessage(response: Response, fallback: string) {
  try {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      return data?.message || fallback;
    }

    const text = await response.text().catch(() => "");
    return text || fallback;
  } catch {
    return fallback;
  }
}

export async function findSessionByWallet(walletAddress: string) {
  let response: Response;

  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);

    response = await fetch(
      getApiUrl(`/api/wallets/${encodeURIComponent(walletAddress)}`),
      { signal: controller.signal },
    );

    window.clearTimeout(timeoutId);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The wallet lookup timed out. Please retry in a moment.");
    }

    console.error("Wallet lookup request failed:", error);
    throw new Error(
      "Auth API is not reachable. Start the backend with cd ..\\server; npm.cmd run dev and make sure MONGODB_URI is set in D:\\Stellar\\server\\.env.",
    );
  }

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const message = await readApiMessage(response, "Could not check this wallet username.");
    throw new Error(message);
  }

  const result = (await response.json().catch(() => null)) as
    | (PrismaSession & { message?: string })
    | null;

  if (!result) {
    throw new Error("The backend returned an empty wallet lookup response.");
  }

  return storeSession({
    username: result.username,
    walletAddress: result.walletAddress,
  });
}

export async function reserveUsername(username: string, walletAddress: string) {
  let response: Response;

  try {
    response = await fetch(getApiUrl("/api/auth/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), walletAddress }),
    });
  } catch {
    throw new Error(
      "Auth API is not reachable. Start the backend with cd ..\\server; npm.cmd run dev and make sure MONGODB_URI is set in D:\\Stellar\\server\\.env.",
    );
  }

  if (!response.ok) {
    const message = await readApiMessage(
      response,
      "Auth API is not reachable. Start the backend with cd ..\\server; npm.cmd run dev and check MONGODB_URI in D:\\Stellar\\server\\.env.",
    );
    throw new Error(message);
  }

  const result = (await response.json().catch(() => null)) as
    | (PrismaSession & { message?: string })
    | null;

  if (!result) {
    throw new Error("The backend returned an empty registration response.");
  }

  const session = {
    username: result.username,
    walletAddress: result.walletAddress,
  };

  return storeSession(session);
}

export function clearStoredSession() {
  getStorage()?.removeItem(SESSION_KEY);
}
