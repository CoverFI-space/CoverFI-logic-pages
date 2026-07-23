import type { ReceiptData } from "../components/PrinterReceipt";
import { getApiUrl } from "./api";
import { readPrivateRecord, writePrivateRecord } from "./encryptedStorage";

type StellarNetwork = "testnet" | "mainnet";

export type LocalPaymentRecord = {
  id: string;
  sender: string;
  recipient: string;
  receiptData: ReceiptData;
  createdAt: string;
  source?: "local" | "stellar-index" | "coverfi-index";
};

export function asReceiptData(payment: unknown): ReceiptData | null {
  const record = payment && typeof payment === "object"
    ? payment as Record<string, any>
    : {};
  const receipt = record.receiptData;
  if (!receipt) return null;

  return {
    status: String(receipt.status || "Success"),
    from: String(receipt.from || record.sender || "Unknown"),
    to: String(receipt.to || record.recipient || "Unknown"),
    amount: String(receipt.amount || "0 XLM"),
    fee: String(receipt.fee || "0 XLM"),
    txHash: String(receipt.txHash || ""),
    receiptHash: receipt.receiptHash ? String(receipt.receiptHash) : undefined,
    date: String(receipt.date || ""),
  };
}

export async function loadLocalPaymentHistory(walletAddress: string) {
  if (!walletAddress) return [];
  const records = await readPrivateRecord<LocalPaymentRecord[]>("payments");
  return Array.isArray(records) ? records : [];
}

function horizonBaseUrl(network: StellarNetwork) {
  return network === "mainnet"
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org";
}

function shortAddress(address: string) {
  return address && address.length > 12
    ? `${address.slice(0, 6)}...${address.slice(-6)}`
    : address;
}

function formatIndexedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function normalizeIndexedPayment(record: any, walletAddress: string): LocalPaymentRecord | null {
  if (!record || record.transaction_successful === false) return null;

  const type = String(record.type || "");
  if (type !== "payment" && type !== "create_account") return null;

  const txHash = String(record.transaction_hash || "");
  const id = String(record.id || txHash || "");
  if (!txHash || !id) return null;

  const from = String(record.from || record.funder || "");
  const to = String(record.to || record.account || "");
  if (from !== walletAddress && to !== walletAddress) return null;

  const incoming = to === walletAddress;
  const asset = record.asset_type === "native"
    ? "XLM"
    : String(record.asset_code || "ASSET").toUpperCase();
  const amount = String(record.amount || record.starting_balance || "0");
  const counterparty = incoming ? from : to;

  return {
    id: `stellar-${id}`,
    sender: incoming ? shortAddress(counterparty) : "You",
    recipient: incoming ? "You" : shortAddress(counterparty),
    createdAt: String(record.created_at || ""),
    source: "stellar-index",
    receiptData: {
      status: incoming ? "Received" : "Sent",
      from: incoming ? shortAddress(counterparty) : shortAddress(walletAddress),
      to: incoming ? shortAddress(walletAddress) : shortAddress(counterparty),
      amount: `${amount} ${asset}`,
      fee: "Network fee",
      txHash,
      date: formatIndexedDate(String(record.created_at || "")),
    },
  };
}

function normalizeIndexedTransaction(record: any, walletAddress: string): LocalPaymentRecord | null {
  if (!record || record.successful === false) return null;

  const txHash = String(record.hash || "");
  const id = String(record.id || txHash || "");
  if (!txHash || !id) return null;

  const operationCount = Number(record.operation_count || 0);
  const feeCharged = Number(record.fee_charged || 0) / 10_000_000;
  const operationLabel = operationCount === 1
    ? "1 operation"
    : `${Number.isFinite(operationCount) && operationCount > 0 ? operationCount : "Stellar"} operations`;

  return {
    id: `stellar-tx-${id}`,
    sender: "You",
    recipient: "Stellar network",
    createdAt: String(record.created_at || ""),
    source: "stellar-index",
    receiptData: {
      status: "Success",
      from: shortAddress(walletAddress),
      to: "Stellar network",
      amount: operationLabel,
      fee: Number.isFinite(feeCharged) ? `${feeCharged.toFixed(7)} XLM` : "Network fee",
      txHash,
      date: formatIndexedDate(String(record.created_at || "")),
    },
  };
}

export async function loadIndexedPaymentHistory(
  walletAddress: string,
  network: StellarNetwork,
) {
  if (!walletAddress) return [];

  const paymentsUrl = new URL(
    `/accounts/${encodeURIComponent(walletAddress)}/payments`,
    horizonBaseUrl(network),
  );
  paymentsUrl.searchParams.set("order", "desc");
  paymentsUrl.searchParams.set("limit", "50");

  const transactionsUrl = new URL(
    `/accounts/${encodeURIComponent(walletAddress)}/transactions`,
    horizonBaseUrl(network),
  );
  transactionsUrl.searchParams.set("order", "desc");
  transactionsUrl.searchParams.set("limit", "50");

  const [paymentsResult, transactionsResult] = await Promise.allSettled([
    fetch(paymentsUrl, { cache: "no-store" }),
    fetch(transactionsUrl, { cache: "no-store" }),
  ]);
  const paymentsResponse =
    paymentsResult.status === "fulfilled" ? paymentsResult.value : null;
  const transactionsResponse =
    transactionsResult.status === "fulfilled" ? transactionsResult.value : null;
  const paymentsData = await paymentsResponse?.json().catch(() => null);
  const transactionsData = await transactionsResponse?.json().catch(() => null);

  if (!paymentsResponse?.ok && !transactionsResponse?.ok) {
    const detail =
      paymentsData?.extras?.reason ||
      paymentsData?.detail ||
      paymentsData?.title ||
      transactionsData?.extras?.reason ||
      transactionsData?.detail ||
      transactionsData?.title;
    throw new Error(detail || "Could not index Stellar payment history.");
  }

  const paymentRecords = Array.isArray(paymentsData?._embedded?.records)
    ? paymentsData._embedded.records
    : [];
  const transactionRecords = Array.isArray(transactionsData?._embedded?.records)
    ? transactionsData._embedded.records
    : [];

  return [
    ...paymentRecords.map((record: any) => normalizeIndexedPayment(record, walletAddress)),
    ...transactionRecords.map((record: any) => normalizeIndexedTransaction(record, walletAddress)),
  ]
    .filter(Boolean) as LocalPaymentRecord[];
}

function normalizeCoverFiHistoryRecord(record: any): LocalPaymentRecord | null {
  if (!record) return null;
  const payload = record.payload || {};
  const txHash = String(record.transactionHash || payload.txHash || "");
  const id = String(record.id || txHash || crypto.randomUUID());
  const amount = String(payload.amount || payload.value || "Contract event");
  const asset = String(payload.asset || payload.symbol || "CoverFi");
  const occurredAt = String(record.occurredAt || record.createdAt || new Date().toISOString());

  return {
    id: `coverfi-${id}`,
    sender: String(payload.from || payload.owner || "CoverFi"),
    recipient: String(payload.to || payload.counterparty || "Contract"),
    createdAt: occurredAt,
    source: "coverfi-index",
    receiptData: {
      status: String(record.eventType || record.status || "Indexed"),
      from: shortAddress(String(payload.from || payload.owner || "")) || "CoverFi",
      to: shortAddress(String(payload.to || payload.counterparty || "")) || "Contract",
      amount: `${amount} ${asset}`.trim(),
      fee: String(payload.fee || "Contract event"),
      txHash,
      receiptHash: payload.receiptHash ? String(payload.receiptHash) : undefined,
      date: formatIndexedDate(occurredAt),
    },
  };
}

export async function loadCoverFiHistory(walletAddress: string) {
  if (!walletAddress) return [];
  const response = await fetch(getApiUrl(`/api/history/${encodeURIComponent(walletAddress)}?limit=75`), {
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(data?.message || "Could not load CoverFi contract history.");
  }

  const events = Array.isArray(data.events) ? data.events : [];
  const records = Array.isArray(data.records) ? data.records : [];
  return [...events, ...records]
    .map((record) => normalizeCoverFiHistoryRecord(record))
    .filter(Boolean) as LocalPaymentRecord[];
}

export async function loadPaymentHistoryWithIndex(
  walletAddress: string,
  network: StellarNetwork,
) {
  const [local, indexed, coverfiIndexed] = await Promise.all([
    loadLocalPaymentHistory(walletAddress).catch(() => []),
    loadIndexedPaymentHistory(walletAddress, network).catch(() => []),
    loadCoverFiHistory(walletAddress).catch(() => []),
  ]);

  const seen = new Set<string>();
  return [...local, ...coverfiIndexed, ...indexed]
    .filter((payment) => {
      const receipt = asReceiptData(payment);
      const key = receipt?.txHash || payment.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const left = new Date(a.createdAt || a.receiptData?.date || 0).getTime();
      const right = new Date(b.createdAt || b.receiptData?.date || 0).getTime();
      return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
    })
    .slice(0, 75);
}

export async function saveLocalPaymentHistory(
  walletAddress: string,
  payment: LocalPaymentRecord,
) {
  if (!walletAddress) return [];

  const existing = await loadLocalPaymentHistory(walletAddress);
  const paymentKey = payment.receiptData?.txHash || payment.id;
  const next = [
    payment,
    ...existing.filter((record) => {
      const recordKey = record.receiptData?.txHash || record.id;
      return recordKey !== paymentKey;
    }),
  ].slice(0, 50);
  await writePrivateRecord("payments", next);
  return next;
}
