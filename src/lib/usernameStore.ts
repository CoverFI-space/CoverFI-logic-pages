const SESSION_KEY = 'prisma_session';

export type PrismaSession = {
  username: string;
  walletAddress: string;
};

export function getStoredSession() {
  try {
    const stored = window.localStorage.getItem(SESSION_KEY);
    return stored ? (JSON.parse(stored) as PrismaSession) : null;
  } catch {
    return null;
  }
}

export function storeSession(session: PrismaSession) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function createWalletSession(walletAddress: string) {
  return storeSession({
    username: '',
    walletAddress,
  });
}

export async function findSessionByWallet(walletAddress: string) {
  let response: Response;

  try {
    response = await fetch(`/api/wallets/${encodeURIComponent(walletAddress)}`);
  } catch {
    throw new Error('Auth API is not reachable. Start the backend with cd ..\\server; npm.cmd run dev and make sure MONGODB_URI is set in D:\\Stellar\\server\\.env.');
  }

  if (response.status === 404) {
    return null;
  }

  const result = (await response.json().catch(() => null)) as (PrismaSession & { message?: string }) | null;

  if (!response.ok || !result) {
    throw new Error(result?.message || 'Could not check this wallet username.');
  }

  return storeSession({
    username: result.username,
    walletAddress: result.walletAddress,
  });
}

export async function reserveUsername(username: string, walletAddress: string) {
  let response: Response;

  try {
    response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), walletAddress }),
    });
  } catch {
    throw new Error('Auth API is not reachable. Start the backend with cd ..\\server; npm.cmd run dev and make sure MONGODB_URI is set in D:\\Stellar\\server\\.env.');
  }

  const result = (await response.json().catch(() => null)) as (PrismaSession & { message?: string }) | null;

  if (!response.ok || !result) {
    throw new Error(result?.message || 'Auth API is not reachable. Start the backend with cd ..\\server; npm.cmd run dev and check MONGODB_URI in D:\\Stellar\\server\\.env.');
  }

  const session = {
    username: result.username,
    walletAddress: result.walletAddress,
  };

  return storeSession(session);
}

export function clearStoredSession() {
  window.localStorage.removeItem(SESSION_KEY);
}
