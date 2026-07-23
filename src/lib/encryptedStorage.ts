import { signWalletAuthMessage } from "./freighter";
import { privateStorageMaterialForEmbeddedWallet } from "./embeddedWallet";

const DATABASE_NAME = "coverfi-private-storage";
const DATABASE_VERSION = 1;
const RECORD_STORE = "records";
const RECORD_SCHEMA_VERSION = 1;

type EncryptedRecord = {
  id: string;
  ownerHash: string;
  namespace: string;
  schemaVersion: number;
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
  updatedAt: string;
};

type StorageSession = {
  walletAddress: string;
  ownerHash: string;
  key: CryptoKey;
};

export type StorageMigrationResult = {
  migratedNamespaces: string[];
};

let activeSession: StorageSession | null = null;
const storageListeners = new Set<() => void>();

function notifyStorageListeners() {
  storageListeners.forEach((listener) => listener());
}

function textBytes(value: string) {
  return new TextEncoder().encode(value);
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hashText(value: string) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", textBytes(value)));
}

function storageUnlockMessage(walletAddress: string) {
  return [
    "CoverFi private storage unlock",
    "Version: 1",
    `Wallet: ${walletAddress}`,
    "Purpose: derive an in-memory key for encrypted browser records.",
    "This signature does not authorize a transaction or move funds.",
  ].join("\n");
}

async function deriveStorageKey(walletAddress: string, signature: string) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    textBytes(signature),
    "HKDF",
    false,
    ["deriveKey"],
  );
  const salt = await crypto.subtle.digest(
    "SHA-256",
    textBytes(`coverfi-storage-salt:${walletAddress}`),
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: textBytes("coverfi-private-storage:aes-gcm:v1"),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction was aborted."));
  });
}

function openPrivateDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Encrypted browser storage is unavailable in this browser."));
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECORD_STORE)) {
        const store = database.createObjectStore(RECORD_STORE, { keyPath: "id" });
        store.createIndex("ownerHash", "ownerHash", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open encrypted browser storage."));
  });
}

function requireStorageSession() {
  if (!activeSession) {
    throw new Error("Private storage is locked. Sign the storage-unlock message first.");
  }
  return activeSession;
}

function recordId(ownerHash: string, namespace: string) {
  return `${ownerHash}:${namespace}`;
}

function additionalData(ownerHash: string, namespace: string) {
  return textBytes(`${ownerHash}:${namespace}:${RECORD_SCHEMA_VERSION}`);
}

export function subscribeToPrivateStorage(listener: () => void) {
  storageListeners.add(listener);
  return () => {
    storageListeners.delete(listener);
  };
}

export function isPrivateStorageUnlocked(walletAddress?: string) {
  if (!activeSession) return false;
  return !walletAddress || activeSession.walletAddress === walletAddress;
}

export function lockPrivateStorage() {
  activeSession = null;
  notifyStorageListeners();
}

export async function unlockPrivateStorage(walletAddress: string, existingSignature = "") {
  const normalizedWallet = walletAddress.trim();
  if (!normalizedWallet) throw new Error("A wallet address is required to unlock private storage.");

  if (activeSession?.walletAddress === normalizedWallet) {
    return { migratedNamespaces: [] } satisfies StorageMigrationResult;
  }

  activeSession = null;
  const signature = existingSignature
    || privateStorageMaterialForEmbeddedWallet(normalizedWallet)
    || await signWalletAuthMessage(
      storageUnlockMessage(normalizedWallet),
      normalizedWallet,
      { legacyBase64Payload: true },
    );
  const [key, ownerHash] = await Promise.all([
    deriveStorageKey(normalizedWallet, signature),
    hashText(`coverfi-wallet:${normalizedWallet}`),
  ]);
  activeSession = { walletAddress: normalizedWallet, ownerHash, key };

  try {
    const migration = await migrateLegacyBrowserRecords(normalizedWallet);
    notifyStorageListeners();
    return migration;
  } catch (error) {
    activeSession = null;
    notifyStorageListeners();
    throw error;
  }
}

export async function readPrivateRecord<T>(namespace: string): Promise<T | null> {
  const session = requireStorageSession();
  const database = await openPrivateDatabase();

  try {
    const transaction = database.transaction(RECORD_STORE, "readonly");
    const stored = await requestResult(
      transaction.objectStore(RECORD_STORE).get(recordId(session.ownerHash, namespace)),
    ) as EncryptedRecord | undefined;
    await transactionComplete(transaction);
    if (!stored) return null;
    if (stored.schemaVersion !== RECORD_SCHEMA_VERSION) {
      throw new Error("This encrypted record uses an unsupported schema version.");
    }

    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: stored.iv,
        additionalData: additionalData(session.ownerHash, namespace),
      },
      session.key,
      stored.ciphertext,
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "OperationError") {
      throw new Error("Private data could not be decrypted with this wallet signature.");
    }
    throw error;
  } finally {
    database.close();
  }
}

export async function writePrivateRecord<T>(namespace: string, value: T) {
  const session = requireStorageSession();
  const database = await openPrivateDatabase();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: additionalData(session.ownerHash, namespace),
    },
    session.key,
    textBytes(JSON.stringify(value)),
  );

  try {
    const transaction = database.transaction(RECORD_STORE, "readwrite");
    transaction.objectStore(RECORD_STORE).put({
      id: recordId(session.ownerHash, namespace),
      ownerHash: session.ownerHash,
      namespace,
      schemaVersion: RECORD_SCHEMA_VERSION,
      iv: iv.buffer,
      ciphertext,
      updatedAt: new Date().toISOString(),
    } satisfies EncryptedRecord);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function removePrivateRecord(namespace: string) {
  const session = requireStorageSession();
  const database = await openPrivateDatabase();

  try {
    const transaction = database.transaction(RECORD_STORE, "readwrite");
    transaction.objectStore(RECORD_STORE).delete(recordId(session.ownerHash, namespace));
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

async function recordsForActiveWallet() {
  const session = requireStorageSession();
  const database = await openPrivateDatabase();

  try {
    const transaction = database.transaction(RECORD_STORE, "readonly");
    const records = await requestResult(
      transaction.objectStore(RECORD_STORE).index("ownerHash").getAll(session.ownerHash),
    ) as EncryptedRecord[];
    await transactionComplete(transaction);
    return records;
  } finally {
    database.close();
  }
}

export async function exportPrivateStorage() {
  const session = requireStorageSession();
  const records = await recordsForActiveWallet();
  const data: Record<string, unknown> = {};

  for (const record of records) {
    data[record.namespace] = await readPrivateRecord(record.namespace);
  }

  return {
    format: "coverfi-private-export",
    schemaVersion: RECORD_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    walletAddress: session.walletAddress,
    data,
  };
}

export async function clearPrivateStorage() {
  const records = await recordsForActiveWallet();
  if (!records.length) return;
  const database = await openPrivateDatabase();

  try {
    const transaction = database.transaction(RECORD_STORE, "readwrite");
    const store = transaction.objectStore(RECORD_STORE);
    records.forEach((record) => store.delete(record.id));
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

async function migrateLegacyBrowserRecords(walletAddress: string) {
  const migratedNamespaces: string[] = [];
  if (typeof window === "undefined") return { migratedNamespaces };

  const legacyRecords = [
    { storage: window.localStorage, key: `coverfi_account_${walletAddress}`, namespace: "account" },
    { storage: window.localStorage, key: `coverfi_payment_history_${walletAddress}`, namespace: "payments" },
    { storage: window.localStorage, key: `coverfi_ai_chat_${walletAddress}`, namespace: "aiMessages" },
    { storage: window.sessionStorage, key: "coverfi_protection_draft", namespace: "protectionDraft" },
  ];

  for (const legacy of legacyRecords) {
    const raw = legacy.storage.getItem(legacy.key);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      await writePrivateRecord(legacy.namespace, parsed);
      legacy.storage.removeItem(legacy.key);
      migratedNamespaces.push(legacy.namespace);
    } catch {
      // Leave unreadable legacy data untouched so the user can recover it manually.
    }
  }

  return { migratedNamespaces } satisfies StorageMigrationResult;
}
