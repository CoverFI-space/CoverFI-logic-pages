import {
  Account,
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Networks,
  Operation,
  xdr,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
} from '@stellar/stellar-sdk';
import type { StellarNetwork } from '../context/AppContext';
import {
  getEmbeddedWalletForAddress,
  signTransactionWithAvailableWallet,
} from './embeddedWallet';
import { bytesToHex, sha256CanonicalReceipt } from './receiptHash';

const TESTNET_RPC = 'https://soroban-testnet.stellar.org';
const MAINNET_RPC = 'https://mainnet.sorobanrpc.com';
const TESTNET_HORIZON = 'https://horizon-testnet.stellar.org';
const MAINNET_HORIZON = 'https://horizon.stellar.org';
const STROOPS_PER_UNIT = 10_000_000n;
const RECEIPT_PRINT_FEE_CFTUSD = Number(import.meta.env.VITE_RECEIPT_PRINT_FEE_CFTUSD || 0.1);
const submittedSequenceCache = new Map<string, bigint>();
const SEQUENCE_STORAGE_PREFIX = 'coverfi_sequence_v3:';
const LEGACY_SEQUENCE_STORAGE_PREFIX = 'coverfi_sequence:';

type CreateProtectionPositionInput = {
  userAddress: string;
  network: StellarNetwork;
  asset: string;
  protectedAmount: number;
  durationSeconds: number;
  partnerAddress?: string;
};

export type PaymentLockInput = {
  userAddress: string;
  recipientAddress: string;
  network: StellarNetwork;
  paymentAmount: number;
  durationSeconds: 900 | 3600 | 86400;
  referenceHash?: string;
};

export type FloorShieldInput = {
  userAddress: string;
  network: StellarNetwork;
  protectedAmount: number;
  floorPrice: number;
  durationSeconds: 86400 | 604800 | 2592000;
};

export type ValueProtectionQuote = {
  entryPrice: number;
  maximumPayout: number;
  riskPremium: number;
  automationFee: number;
  totalDue: number;
  recipientValue?: number;
  floorPrice?: number;
};

export type ProtectionQuote = {
  entryPrice: number;
  notional: number;
  maximumPayout: number;
  basePremium: number;
  volatilitySurcharge: number;
  utilizationSurcharge: number;
  concentrationSurcharge: number;
  safetyMargin: number;
  riskPremium: number;
  protocolCommission: number;
  automationFee: number;
  totalDue: number;
  utilizationBps: number;
  concentrationBps: number;
  volatilityBps: number;
};

export type ContractPositionReceipt = {
  transactionHash: string;
  contractPositionId?: string;
  assetContractId: string;
  payoutAssetContractId: string;
};

export type ContractSettlementReceipt = {
  transactionHash: string;
};

export type ReserveClaimDetails = {
  claimId: string;
  amount: string;
  withdrawn: boolean;
  withdrawableAmount: string;
  positionLockedAmount: string;
  poolReservedClaims: string;
};

export type ProtectionAssetOption = {
  label: string;
  symbol: string;
  configured: boolean;
};

export type OnChainProtectionPosition = {
  id: string;
  owner: string;
  protectedAssetContractId: string;
  payoutAssetContractId: string;
  protectedAmount: number;
  feePaid: number;
  entryPrice: number;
  startTime: string;
  expiryTime: string;
  status: "Active" | "AwaitingOracle" | "SettledNoPayout" | "Claimable" | "Claimed" | "PrincipalWithdrawn";
  claimablePayout: number;
  maximumPayout: number;
  settlementPrice: number;
  payoutClaimed: boolean;
  principalWithdrawn: boolean;
};

function networkPassphrase(network: StellarNetwork) {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

function rpcUrl(network: StellarNetwork) {
  const envUrl = network === 'mainnet' ? import.meta.env.VITE_STELLAR_MAINNET_RPC_URL : import.meta.env.VITE_STELLAR_TESTNET_RPC_URL;
  return envUrl || (network === 'mainnet' ? MAINNET_RPC : TESTNET_RPC);
}

function engineContractId() {
  const id = String(import.meta.env.VITE_PROTECTION_ENGINE_CONTRACT_ID || '').trim();
  if (!id) {
    throw new Error('VITE_PROTECTION_ENGINE_CONTRACT_ID is missing in .env.');
  }
  return id;
}

function paymentLockEngineContractId() {
  const id = String(import.meta.env.VITE_PAYMENT_LOCK_ENGINE_CONTRACT_ID || '').trim();
  if (!id) throw new Error('Payment Lock is not deployed for this network yet.');
  return id;
}

function floorShieldEngineContractId() {
  const id = String(import.meta.env.VITE_FLOOR_SHIELD_ENGINE_CONTRACT_ID || '').trim();
  if (!id) throw new Error('Depeg Shield is not deployed for this network yet.');
  return id;
}

export function isPaymentLockConfigured() {
  return Boolean(String(import.meta.env.VITE_PAYMENT_LOCK_ENGINE_CONTRACT_ID || '').trim());
}

export function isFloorShieldConfigured() {
  return Boolean(String(import.meta.env.VITE_FLOOR_SHIELD_ENGINE_CONTRACT_ID || '').trim());
}

function reserveVaultContractId() {
  const id = String(import.meta.env.VITE_RESERVE_VAULT_CONTRACT_ID || '').trim();
  if (!id) {
    throw new Error('VITE_RESERVE_VAULT_CONTRACT_ID is missing in .env.');
  }
  return id;
}

function payoutAssetContractId(network: StellarNetwork) {
  const cftusdKey = `VITE_CFTUSD_${network.toUpperCase()}_CONTRACT_ID`;
  const usdcKey = `VITE_USDC_${network.toUpperCase()}_CONTRACT_ID`;
  const id = String(import.meta.env[cftusdKey] || import.meta.env[usdcKey] || '').trim();
  if (!id) throw new Error(`${cftusdKey} is missing in .env.`);
  return id;
}

function usernameRegistryContractId() {
  const id = String(
    import.meta.env.VITE_USERNAME_REGISTRY_CONTRACT_ID ||
      import.meta.env.VITE_USERNAME_REGISTRY_ID ||
      '',
  ).trim();
  if (!id) {
    throw new Error('VITE_USERNAME_REGISTRY_ID is missing in .env.');
  }
  return id;
}

function zkVerifierContractId() {
  return String(
    import.meta.env.VITE_ZK_VERIFIER_CONTRACT_ID ||
      import.meta.env.VITE_ZK_VERIFIER_ID ||
      '',
  ).trim();
}

export function isZkVerifierConfigured() {
  return Boolean(zkVerifierContractId());
}

function xlmAssetContractId(network: StellarNetwork) {
  return Asset.native().contractId(networkPassphrase(network));
}

function isAssetConfigured(symbol: string, network: StellarNetwork) {
  if (symbol === 'XLM') return Boolean(xlmAssetContractId(network));
  const lookupKey = `VITE_${symbol}_${network.toUpperCase()}_CONTRACT_ID`;
  const issuerKey = `VITE_${symbol}_${network.toUpperCase()}_ISSUER`;
  return Boolean(
    String(import.meta.env[lookupKey] || '').trim() ||
      String(import.meta.env[issuerKey] || '').trim(),
  );
}

function assetContractId(asset: string, network: StellarNetwork) {
  const symbol = asset.split(/\s+/)[0].toUpperCase();
  const lookupKey = `VITE_${symbol}_${network.toUpperCase()}_CONTRACT_ID`;
  const configured = String(import.meta.env[lookupKey] || '').trim();
  const issuerKey = `VITE_${symbol}_${network.toUpperCase()}_ISSUER`;
  const issuer = String(import.meta.env[issuerKey] || '').trim();

  if (configured) {
    return configured;
  }

  if (symbol === 'XLM') {
    return xlmAssetContractId(network);
  }

  if (issuer) {
    return new Asset(symbol, issuer).contractId(networkPassphrase(network));
  }

  throw new Error(`No Stellar asset contract is configured for ${symbol}. Add ${lookupKey} or ${issuerKey} to logic-pages/.env, restart the frontend, or choose XLM.`);
}

export function getProtectionAssetOptions(network: StellarNetwork): ProtectionAssetOption[] {
  // The deployed protection engine is a single XLM/CFTUSD market. Do not show
  // assets the contract cannot accept until multi-market configuration exists.
  return [
    { label: 'XLM Stellar', symbol: 'XLM' },
  ].map((asset) => ({
    ...asset,
    configured: isAssetConfigured(asset.symbol, network),
  }));
}

export function getDefaultProtectionAsset(network: StellarNetwork) {
  return getProtectionAssetOptions(network).find((asset) => asset.configured)?.label || 'XLM Stellar';
}

function getContractErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');

  console.error('[CoverFi contract error]', error);

  if (message.includes('Selected wallet is not on') || message.includes('Freighter is not on')) {
    return message;
  }

  if (message.includes('selected wallet rejected') || message.includes('Freighter rejected')) {
    return 'Transaction was not signed.';
  }

  if (message.includes('txBadSeq') || message.includes('AAAAAAAG9Ur////7AAAAAA==')) {
    return 'Stellar rejected the wallet sequence before the contract ran. I cleared the local sequence guard; wait a few seconds, then try once.';
  }

  if (message.includes('Email wallet signing key is not available')) {
    return message;
  }

  if (message.includes('account not found') || message.includes('Account not found') || message.includes('does not exist')) {
    return 'This wallet is not funded on the selected Stellar network yet.';
  }

  if (message.includes('Amount must be greater than zero')) {
    return 'Enter an amount greater than zero.';
  }

  if (message.includes('No Stellar asset contract is configured')) {
    return 'This asset is not configured yet.';
  }

  if (message.includes('trustline entry is missing')) {
    return 'This action needs the required asset balance in your wallet.';
  }

  if (message.includes('MissingValue') || message.includes('non-existing value for contract instance')) {
    return 'Contracts are not ready yet. Please try again later.';
  }

  if (message.includes('MismatchingParameterLen') || message.includes('UnexpectedSize')) {
    return 'The deployed protection contract ABI does not match this request yet. Refresh the app and try again.';
  }

  if (message.includes('Error(Contract, #4)')) {
    return 'Protocol is paused. Please try again later.';
  }

  if (message.includes('Error(Contract, #7)')) {
    return 'Enter an amount greater than zero.';
  }

  if (message.includes('Error(Contract, #8)')) {
    return 'Choose 1, 7, 14, or 30 days.';
  }

  if (message.includes('Error(Contract, #12)')) {
    return 'This position is not expired yet.';
  }

  if (message.includes('Error(Contract, #13)')) {
    return 'This principal has already been withdrawn.';
  }

  if (message.includes('Error(Contract, #14)')) {
    return 'No payout is available yet.';
  }

  if (message.includes('Error(Contract, #15)')) {
    return 'The oracle price is stale. Refresh the oracle before creating or settling positions.';
  }

  if (message.includes('Error(Contract, #16)')) {
    return 'This protected asset and payout asset market is not supported by the current contract configuration.';
  }

  if (message.includes('Error(Contract, #17)')) {
    return 'The reserve is already too utilized for this position. Try a smaller amount or add more reserve liquidity.';
  }

  if (message.includes('Error(Contract, #18)')) {
    return 'Protection is currently unavailable on this testnet deployment. The app is pointing at a legacy/mismatched reserve contract, so V2 must be redeployed, initialized, and funded before new positions can be created.';
  }

  if (message.includes('Error(Contract, #20)')) {
    return 'This position is below the $1 minimum protection value. For XLM at the current testnet price, try a larger amount.';
  }

  return 'Contract action failed. Please try again.';
}

function getTransactionResultCode(errorResult?: xdr.TransactionResult) {
  try {
    const code = errorResult?.result().switch();
    return code?.name || '';
  } catch {
    return '';
  }
}

function sequenceCacheKey(address: string, passphrase: string) {
  return `${passphrase}:${address}`;
}

function horizonUrl(passphrase: string) {
  return passphrase === Networks.PUBLIC ? MAINNET_HORIZON : TESTNET_HORIZON;
}

function readStoredSequence(key: string) {
  if (typeof window === 'undefined') return null;

  try {
    window.localStorage.removeItem(`${LEGACY_SEQUENCE_STORAGE_PREFIX}${key}`);
    window.localStorage.removeItem(`coverfi_sequence_v2:${key}`);
    window.localStorage.removeItem(`${SEQUENCE_STORAGE_PREFIX}${key}`);
    return null;
  } catch {
    return null;
  }
}

function writeStoredSequence(key: string, sequence: bigint) {
  void key;
  void sequence;
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(`${SEQUENCE_STORAGE_PREFIX}${key}`);
  } catch {
    // Sequence state stays in memory only to avoid poisoning future browser sessions.
  }
}

function clearStoredSequence(key: string) {
  submittedSequenceCache.delete(key);
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(`${LEGACY_SEQUENCE_STORAGE_PREFIX}${key}`);
    window.localStorage.removeItem(`${SEQUENCE_STORAGE_PREFIX}${key}`);
  } catch {
    // Clearing is best-effort.
  }
}

async function getHorizonSequence(address: string, passphrase: string) {
  try {
    const response = await fetch(`${horizonUrl(passphrase)}/accounts/${encodeURIComponent(address)}`, {
      cache: 'no-store',
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.sequence) return null;
    return BigInt(String(data.sequence));
  } catch {
    return null;
  }
}

async function getAccountWithSafeSequence(server: rpc.Server, address: string, passphrase: string) {
  const source = await server.getAccount(address);
  const key = sequenceCacheKey(address, passphrase);
  const cachedSequence = submittedSequenceCache.get(key);
  readStoredSequence(key);

  try {
    const fetchedSequence = BigInt(source.sequenceNumber());
    const sequence = [fetchedSequence, cachedSequence]
      .filter((value): value is bigint => typeof value === 'bigint')
      .reduce((max, value) => value > max ? value : max, fetchedSequence);

    if (sequence > fetchedSequence) {
      submittedSequenceCache.set(key, sequence);
      writeStoredSequence(key, sequence);
      return new Account(address, sequence.toString());
    }
  } catch {
    return source;
  }

  return source;
}

function rememberSubmittedSequence(address: string, passphrase: string, transaction: unknown) {
  const sequence = typeof transaction === 'object' && transaction !== null && 'sequence' in transaction
    ? String((transaction as { sequence?: unknown }).sequence || '')
    : '';
  if (!sequence) return;

  try {
    const key = sequenceCacheKey(address, passphrase);
    const submittedSequence = BigInt(sequence);
    const cachedSequence = submittedSequenceCache.get(key) || 0n;
    if (submittedSequence > cachedSequence) {
      submittedSequenceCache.set(key, submittedSequence);
      writeStoredSequence(key, submittedSequence);
    }
  } catch {
    // Sequence cache is a latency guard only; failed parsing should not block the transaction flow.
  }
}

function clearSequenceGuard(address: string, passphrase: string) {
  clearStoredSequence(sequenceCacheKey(address, passphrase));
}

function transactionSequence(transaction: unknown) {
  return typeof transaction === 'object' && transaction !== null && 'sequence' in transaction
    ? String((transaction as { sequence?: unknown }).sequence || '')
    : '';
}

function logSequenceDiagnostics(label: string, data: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.info(`[CoverFi sequence] ${label}`, data);
  }
}

function isMissingTrustlineError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.includes('trustline entry is missing') ||
    message.includes('test CFTUSD trustline');
}

function toStroops(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be greater than zero.');
  }

  return BigInt(Math.round(amount * Number(STROOPS_PER_UNIT)));
}

function normalizeNative(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries()).map(([key, item]) => [
        String(key),
        normalizeNative(item),
      ]),
    );
  }
  if (Array.isArray(value)) return value.map(normalizeNative);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        normalizeNative(item),
      ]),
    );
  }
  return value;
}

function normalizeUsername(username: string) {
  const clean = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(clean)) {
    throw new Error('Use 3 to 24 lowercase letters, numbers, or underscores.');
  }
  return clean;
}

function nativeString(value: unknown, fallback = '0') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function nativeNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function fromStroops(value: unknown) {
  return nativeNumber(value) / Number(STROOPS_PER_UNIT);
}

function fromOraclePrice(value: unknown) {
  const scaled = nativeNumber(value);
  return scaled > 0 ? scaled / 100_000_000 : 0;
}

function hexToBytes32(hex: string) {
  const clean = hex.trim().replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new Error('Expected a 32-byte hex value.');
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytes32ScVal(hex: string) {
  return nativeToScVal(hexToBytes32(hex), { type: 'bytes' });
}

export async function sha256Bytes32Hex(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return bytesToHex(new Uint8Array(digest));
}

function timestampToIso(value: unknown) {
  const seconds = nativeNumber(value);
  return seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
}

function statusFromNative(value: unknown): OnChainProtectionPosition["status"] {
  const text = String(value || "Active");
  if (text.includes("AwaitingOracle")) return "AwaitingOracle";
  if (text.includes("SettledNoPayout")) return "SettledNoPayout";
  if (text.includes("Claimable")) return "Claimable";
  if (text.includes("PrincipalWithdrawn")) return "PrincipalWithdrawn";
  if (text.includes("Claimed")) return "Claimed";
  return "Active";
}

function claimField(record: unknown, ...names: string[]) {
  const object = record && typeof record === 'object' ? record as Record<string, unknown> : {};
  for (const name of names) {
    if (object[name] !== undefined) return object[name];
  }
  return undefined;
}

async function assertWalletNetwork(expectedNetwork: StellarNetwork, expectedPassphrase: string, userAddress: string) {
  if (getEmbeddedWalletForAddress(userAddress, expectedPassphrase)) {
    return;
  }

  // The selected wallet receives the expected network passphrase when signing.
  // Avoid a Freighter-only probe here so every supported Stellar wallet can sign.
  void expectedNetwork;
}

async function simulateContractCall(input: {
  userAddress: string;
  network: StellarNetwork;
  contractId: string;
  method: string;
  args?: xdr.ScVal[];
}) {
  const passphrase = networkPassphrase(input.network);
  const server = new rpc.Server(rpcUrl(input.network), { allowHttp: false });
  const source = await getAccountWithSafeSequence(server, input.userAddress, passphrase);
  const contract = new Contract(input.contractId);
  const transaction = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: passphrase,
  })
    .addOperation(contract.call(input.method, ...(input.args || [])))
    .setTimeout(30)
    .build();

  const result = await server.simulateTransaction(transaction) as any;
  if (result.error) {
    throw new Error(String(result.error));
  }

  return result.result?.retval ? normalizeNative(scValToNative(result.result.retval)) : null;
}

async function submitContractOperations(input: {
  userAddress: string;
  network: StellarNetwork;
  operations: xdr.Operation[];
  failureLabel: string;
}) {
  const passphrase = networkPassphrase(input.network);
  await assertWalletNetwork(input.network, passphrase, input.userAddress);

  const server = new rpc.Server(rpcUrl(input.network), { allowHttp: false });
  const source = await getAccountWithSafeSequence(server, input.userAddress, passphrase);
  const builder = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: passphrase,
  });

  input.operations.forEach((operation) => builder.addOperation(operation));
  const transaction = builder.setTimeout(60).build();
  const preparedTransaction = await server.prepareTransaction(transaction);
  const signed = await signTransactionWithAvailableWallet(preparedTransaction.toXDR(), {
    address: input.userAddress,
    networkPassphrase: passphrase,
  });

  if (signed.error || !signed.signedTxXdr) {
    throw new Error(signed.error?.message || 'The selected wallet rejected the contract transaction.');
  }

  const signedTransaction = TransactionBuilder.fromXDR(signed.signedTxXdr, passphrase);
  const sent = await server.sendTransaction(signedTransaction);

  if (sent.status !== 'PENDING') {
    const resultCode = getTransactionResultCode(sent.errorResult);
    if (resultCode === 'txBadSeq') {
      clearSequenceGuard(input.userAddress, passphrase);
    }
    const errorResult = sent.errorResult ? sent.errorResult.toXDR('base64') : '';
    throw new Error(errorResult ? `${input.failureLabel} (${resultCode || 'unknown'}): ${errorResult}` : `${input.failureLabel}: ${sent.status}`);
  }

  rememberSubmittedSequence(input.userAddress, passphrase, signedTransaction);
  const confirmed = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (confirmed.status !== 'SUCCESS') {
    throw new Error(`${input.failureLabel}: ${confirmed.status}`);
  }

  return { transactionHash: sent.hash, returnValue: confirmed.returnValue };
}

export async function getProtectionQuoteOnChain(input: CreateProtectionPositionInput): Promise<ProtectionQuote> {
  try {
    const protectedAsset = assetContractId(input.asset, input.network);
    const payoutAsset = payoutAssetContractId(input.network);
    const result = await simulateContractCall({
      userAddress: input.userAddress,
      network: input.network,
      contractId: engineContractId(),
      method: 'quote_position',
      args: [
        Address.fromString(protectedAsset).toScVal(),
        Address.fromString(payoutAsset).toScVal(),
        nativeToScVal(toStroops(input.protectedAmount), { type: 'i128' }),
        nativeToScVal(BigInt(input.durationSeconds), { type: 'u64' }),
      ],
    });
    const quote = result && typeof result === 'object' ? result as Record<string, unknown> : {};
    return {
      entryPrice: fromOraclePrice(quote.entry_price),
      notional: fromStroops(quote.notional),
      maximumPayout: fromStroops(quote.maximum_payout),
      basePremium: fromStroops(quote.base_premium),
      volatilitySurcharge: fromStroops(quote.volatility_surcharge),
      utilizationSurcharge: fromStroops(quote.utilization_surcharge),
      concentrationSurcharge: fromStroops(quote.concentration_surcharge),
      safetyMargin: fromStroops(quote.safety_margin),
      riskPremium: fromStroops(quote.risk_premium),
      protocolCommission: fromStroops(quote.protocol_commission),
      automationFee: fromStroops(quote.automation_fee),
      totalDue: fromStroops(quote.total_due),
      utilizationBps: nativeNumber(quote.utilization_bps),
      concentrationBps: nativeNumber(quote.concentration_bps),
      volatilityBps: nativeNumber(quote.volatility_bps),
    };
  } catch (error) {
    throw new Error(getContractErrorMessage(error));
  }
}

function parseValueProtectionQuote(result: unknown): ValueProtectionQuote {
  const quote = result && typeof result === 'object' ? result as Record<string, unknown> : {};
  return {
    entryPrice: fromOraclePrice(quote.entry_price),
    maximumPayout: fromStroops(quote.maximum_payout),
    riskPremium: fromStroops(quote.risk_premium),
    automationFee: fromStroops(quote.automation_fee),
    totalDue: fromStroops(quote.total_due),
    recipientValue: quote.recipient_value === undefined ? undefined : fromStroops(quote.recipient_value),
    floorPrice: quote.floor_price === undefined ? undefined : fromOraclePrice(quote.floor_price),
  };
}

export async function getPaymentLockQuoteOnChain(input: PaymentLockInput): Promise<ValueProtectionQuote> {
  try {
    const result = await simulateContractCall({
      userAddress: input.userAddress,
      network: input.network,
      contractId: paymentLockEngineContractId(),
      method: 'quote_lock',
      args: [nativeToScVal(toStroops(input.paymentAmount), { type: 'i128' }), nativeToScVal(BigInt(input.durationSeconds), { type: 'u64' })],
    });
    return parseValueProtectionQuote(result);
  } catch (error) {
    throw new Error(getContractErrorMessage(error));
  }
}

export async function createPaymentLockOnChain(input: PaymentLockInput): Promise<ContractPositionReceipt> {
  try {
    const engine = new Contract(paymentLockEngineContractId());
    const result = await submitContractOperations({
      userAddress: input.userAddress,
      network: input.network,
      failureLabel: 'Protected payment could not be completed',
      operations: [engine.call(
        'create_lock',
        Address.fromString(input.userAddress).toScVal(),
        Address.fromString(input.recipientAddress).toScVal(),
        nativeToScVal(toStroops(input.paymentAmount), { type: 'i128' }),
        nativeToScVal(BigInt(input.durationSeconds), { type: 'u64' }),
        input.referenceHash ? bytes32ScVal(input.referenceHash) : xdr.ScVal.scvVoid(),
        xdr.ScVal.scvVoid(),
      )],
    });
    return { transactionHash: result.transactionHash, contractPositionId: result.returnValue === undefined ? undefined : String(result.returnValue), assetContractId: xlmAssetContractId(input.network), payoutAssetContractId: payoutAssetContractId(input.network) };
  } catch (error) {
    throw new Error(getContractErrorMessage(error));
  }
}

export async function getFloorShieldQuoteOnChain(input: FloorShieldInput): Promise<ValueProtectionQuote> {
  try {
    const result = await simulateContractCall({
      userAddress: input.userAddress,
      network: input.network,
      contractId: floorShieldEngineContractId(),
      method: 'quote_shield',
      args: [nativeToScVal(toStroops(input.protectedAmount), { type: 'i128' }), nativeToScVal(BigInt(Math.round(input.floorPrice * 100_000_000)), { type: 'i128' }), nativeToScVal(BigInt(input.durationSeconds), { type: 'u64' })],
    });
    return parseValueProtectionQuote(result);
  } catch (error) {
    throw new Error(getContractErrorMessage(error));
  }
}

export async function createFloorShieldOnChain(input: FloorShieldInput): Promise<ContractPositionReceipt> {
  try {
    const engine = new Contract(floorShieldEngineContractId());
    const result = await submitContractOperations({
      userAddress: input.userAddress,
      network: input.network,
      failureLabel: 'Depeg Shield could not be created',
      operations: [engine.call(
        'create_shield',
        Address.fromString(input.userAddress).toScVal(),
        nativeToScVal(toStroops(input.protectedAmount), { type: 'i128' }),
        nativeToScVal(BigInt(Math.round(input.floorPrice * 100_000_000)), { type: 'i128' }),
        nativeToScVal(BigInt(input.durationSeconds), { type: 'u64' }),
        xdr.ScVal.scvVoid(),
      )],
    });
    return { transactionHash: result.transactionHash, contractPositionId: result.returnValue === undefined ? undefined : String(result.returnValue), assetContractId: '', payoutAssetContractId: payoutAssetContractId(input.network) };
  } catch (error) {
    throw new Error(getContractErrorMessage(error));
  }
}

export async function preflightProtectionPositionOnChain(input: CreateProtectionPositionInput): Promise<void> {
  try {
    const passphrase = networkPassphrase(input.network);
    const server = new rpc.Server(rpcUrl(input.network), { allowHttp: false });
    const source = await getAccountWithSafeSequence(server, input.userAddress, passphrase);
    const engine = new Contract(engineContractId());
    const protectedAsset = assetContractId(input.asset, input.network);
    const payoutAsset = payoutAssetContractId(input.network);
    const createPositionArgs = [
      Address.fromString(input.userAddress).toScVal(),
      Address.fromString(protectedAsset).toScVal(),
      Address.fromString(payoutAsset).toScVal(),
      nativeToScVal(toStroops(input.protectedAmount), { type: 'i128' }),
      nativeToScVal(BigInt(input.durationSeconds), { type: 'u64' }),
    ];
    const createPositionArgsWithPartner = input.partnerAddress
      ? [...createPositionArgs, Address.fromString(input.partnerAddress).toScVal()]
      : [...createPositionArgs, xdr.ScVal.scvVoid()];
    const preferredArgs = createPositionArgsWithPartner;
    const fallbackArgs = createPositionArgs;
    const sourceSequence = source.sequenceNumber();
    const buildTx = (args: xdr.ScVal[]) =>
      new TransactionBuilder(new Account(input.userAddress, sourceSequence), {
        fee: BASE_FEE,
        networkPassphrase: passphrase,
      })
        .addOperation(engine.call('create_position', ...args))
        .setTimeout(60)
        .build();

    const simulate = async (args: xdr.ScVal[]) => {
      const result = await server.simulateTransaction(buildTx(args));
      if ('error' in result && result.error) {
        throw new Error(result.error);
      }
    };

    try {
      await simulate(preferredArgs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      if (!message.includes('MismatchingParameterLen') && !message.includes('UnexpectedSize')) {
        throw error;
      }
      await simulate(fallbackArgs);
    }
  } catch (error) {
    throw new Error(getContractErrorMessage(error));
  }
}

export async function createProtectionPositionOnChain(input: CreateProtectionPositionInput): Promise<ContractPositionReceipt> {
  try {
    const passphrase = networkPassphrase(input.network);
    await assertWalletNetwork(input.network, passphrase, input.userAddress);

    const server = new rpc.Server(rpcUrl(input.network), { allowHttp: false });
    const engine = new Contract(engineContractId());
    const protectedAsset = assetContractId(input.asset, input.network);
    const payoutAsset = payoutAssetContractId(input.network);

    const createPositionArgs = [
      Address.fromString(input.userAddress).toScVal(),
      Address.fromString(protectedAsset).toScVal(),
      Address.fromString(payoutAsset).toScVal(),
      nativeToScVal(toStroops(input.protectedAmount), { type: 'i128' }),
      nativeToScVal(BigInt(input.durationSeconds), { type: 'u64' }),
    ];
    const createPositionArgsWithPartner = input.partnerAddress
      ? [...createPositionArgs, Address.fromString(input.partnerAddress).toScVal()]
      : [...createPositionArgs, xdr.ScVal.scvVoid()];

    const buildCreatePositionTx = (sourceSequence: string, args: xdr.ScVal[]) =>
      new TransactionBuilder(new Account(input.userAddress, sourceSequence), {
        fee: BASE_FEE,
        networkPassphrase: passphrase,
      })
        .addOperation(engine.call(
          'create_position',
          ...args,
        ))
        .setTimeout(60)
        .build();

    const preferredArgs = createPositionArgsWithPartner;
    const fallbackArgs = createPositionArgs;

    const source = await getAccountWithSafeSequence(server, input.userAddress, passphrase);
    const sourceSequence = source.sequenceNumber();
    let preparedTransaction;
    try {
      preparedTransaction = await server.prepareTransaction(buildCreatePositionTx(sourceSequence, preferredArgs));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      if (!message.includes('MismatchingParameterLen') && !message.includes('UnexpectedSize')) {
        throw error;
      }
      preparedTransaction = await server.prepareTransaction(buildCreatePositionTx(sourceSequence, fallbackArgs));
    }
    const signed = await signTransactionWithAvailableWallet(preparedTransaction.toXDR(), {
      address: input.userAddress,
      networkPassphrase: passphrase,
    });

    if (signed.error || !signed.signedTxXdr) {
      throw new Error(signed.error?.message || 'The selected wallet rejected the contract transaction.');
    }

    const signedTransaction = TransactionBuilder.fromXDR(signed.signedTxXdr, passphrase);
    const horizonSequence = await getHorizonSequence(input.userAddress, passphrase);
    logSequenceDiagnostics('create_position', {
      wallet: input.userAddress,
      signerAddress: signed.signerAddress || '',
      sourceSequence: source.sequenceNumber(),
      preparedSequence: transactionSequence(preparedTransaction),
      signedSequence: transactionSequence(signedTransaction),
      horizonSequence: horizonSequence?.toString() || '',
    });

    if (signed.signerAddress && signed.signerAddress !== input.userAddress) {
      throw new Error('The selected wallet signed with a different account than the connected CoverFi wallet. Switch to the connected wallet and try again.');
    }

    const sent = await server.sendTransaction(signedTransaction);

    if (sent.status !== 'PENDING') {
      const resultCode = getTransactionResultCode(sent.errorResult);
      if (resultCode === 'txBadSeq') {
        clearSequenceGuard(input.userAddress, passphrase);
      }
      const errorResult = sent.errorResult ? sent.errorResult.toXDR('base64') : '';
      throw new Error(errorResult ? `Contract transaction failed before confirmation (${resultCode || 'unknown'}): ${errorResult}` : `Contract transaction status: ${sent.status}`);
    }

    rememberSubmittedSequence(input.userAddress, passphrase, signedTransaction);
    const confirmed = await server.pollTransaction(sent.hash, { attempts: 30 });
    if (confirmed.status !== 'SUCCESS') {
      throw new Error(`Contract transaction was not successful: ${confirmed.status}`);
    }

    const nativeReturn = confirmed.returnValue ? scValToNative(confirmed.returnValue) : null;

    return {
      transactionHash: sent.hash,
      contractPositionId: nativeReturn === null || nativeReturn === undefined ? undefined : String(nativeReturn),
      assetContractId: protectedAsset,
      payoutAssetContractId: payoutAsset,
    };
  } catch (error) {
    throw new Error(getContractErrorMessage(error));
  }
}

export async function registerUsernameOnChain(input: {
  userAddress: string;
  network: StellarNetwork;
  username: string;
  leaseCount?: number;
}): Promise<{ username: string; walletAddress: string; transactionHash: string }> {
  try {
    const username = normalizeUsername(input.username);
    const registry = new Contract(usernameRegistryContractId());
    const result = await submitContractOperations({
      userAddress: input.userAddress,
      network: input.network,
      failureLabel: 'Username registration failed',
      operations: [
        registry.call(
          'register_username',
          Address.fromString(input.userAddress).toScVal(),
          nativeToScVal(username, { type: 'string' }),
          nativeToScVal(input.leaseCount || 1, { type: 'u32' }),
        ),
      ],
    });

    return {
      username,
      walletAddress: input.userAddress,
      transactionHash: result.transactionHash,
    };
  } catch (error) {
    throw new Error(getContractErrorMessage(error));
  }
}

export type UsernameRegistrationQuote = {
  baseFee: number;
  scarcityPremium: number;
  totalFee: number;
  expiresAt: string;
};

export async function getUsernameRegistrationQuoteOnChain(input: {
  userAddress: string;
  network: StellarNetwork;
  username: string;
  leaseCount?: number;
}): Promise<UsernameRegistrationQuote> {
  try {
    const username = normalizeUsername(input.username);
    const result = await simulateContractCall({
      userAddress: input.userAddress,
      network: input.network,
      contractId: usernameRegistryContractId(),
      method: 'quote_registration',
      args: [
        nativeToScVal(username, { type: 'string' }),
        nativeToScVal(input.leaseCount || 1, { type: 'u32' }),
      ],
    });
    const quote = result && typeof result === 'object' ? result as Record<string, unknown> : {};
    const expirySeconds = Number(quote.expires_at || 0);
    return {
      baseFee: fromStroops(quote.base_fee),
      scarcityPremium: fromStroops(quote.scarcity_premium),
      totalFee: fromStroops(quote.total_fee),
      expiresAt: expirySeconds > 0 ? new Date(expirySeconds * 1000).toISOString() : '',
    };
  } catch (error) {
    throw new Error(getContractErrorMessage(error));
  }
}

export async function getUsernameAddressOnChain(input: {
  userAddress: string;
  network: StellarNetwork;
  username: string;
}): Promise<{ username: string; walletAddress: string }> {
  try {
    const username = normalizeUsername(input.username);
    const result = await simulateContractCall({
      userAddress: input.userAddress,
      network: input.network,
      contractId: usernameRegistryContractId(),
      method: 'get_address',
      args: [nativeToScVal(username, { type: 'string' })],
    });

    return {
      username,
      walletAddress: nativeString(result),
    };
  } catch {
    throw new Error('Username not found on the Soroban username registry.');
  }
}

export async function getWalletUsernameOnChain(input: {
  userAddress: string;
  network: StellarNetwork;
  walletAddress?: string;
}): Promise<string> {
  try {
    const result = await simulateContractCall({
      userAddress: input.userAddress,
      network: input.network,
      contractId: usernameRegistryContractId(),
      method: 'get_username',
      args: [Address.fromString(input.walletAddress || input.userAddress).toScVal()],
    });

    return nativeString(result, '');
  } catch {
    return '';
  }
}

export async function isUsernameAvailableOnChain(input: {
  userAddress: string;
  network: StellarNetwork;
  username: string;
}): Promise<boolean> {
  const username = normalizeUsername(input.username);
  const result = await simulateContractCall({
    userAddress: input.userAddress,
    network: input.network,
    contractId: usernameRegistryContractId(),
    method: 'is_available',
    args: [nativeToScVal(username, { type: 'string' })],
  });

  return result === true;
}

export async function getUserProtectionPositionsOnChain(input: {
  userAddress: string;
  network: StellarNetwork;
  walletAddress?: string;
}): Promise<OnChainProtectionPosition[]> {
  const walletAddress = input.walletAddress || input.userAddress;
  const ids = await simulateContractCall({
    userAddress: input.userAddress,
    network: input.network,
    contractId: engineContractId(),
    method: 'get_user_positions',
    args: [Address.fromString(walletAddress).toScVal()],
  });
  const positionIds = Array.isArray(ids) ? ids : [];

  const records = await Promise.all(
    positionIds.map((id) =>
      simulateContractCall({
        userAddress: input.userAddress,
        network: input.network,
        contractId: engineContractId(),
        method: 'get_position',
        args: [nativeToScVal(BigInt(String(id)), { type: 'u64' })],
      }),
    ),
  );

  return records
    .map((record, index) => {
      const item = record && typeof record === 'object'
        ? record as Record<string, unknown>
        : {};
      const id = nativeString(item.id ?? positionIds[index], String(positionIds[index]));
      return {
        id,
        owner: nativeString(item.owner, walletAddress),
        protectedAssetContractId: nativeString(item.protected_asset, ''),
        payoutAssetContractId: nativeString(item.payout_asset, ''),
        protectedAmount: fromStroops(item.protected_amount),
        feePaid: fromStroops(item.fee_paid),
        entryPrice: fromOraclePrice(item.entry_price),
        startTime: timestampToIso(item.start_time),
        expiryTime: timestampToIso(item.expiry_time),
        status: statusFromNative(item.status),
        claimablePayout: fromStroops(item.claimable_payout),
        maximumPayout: fromStroops(item.maximum_payout),
        settlementPrice: fromOraclePrice(item.settlement_price),
        payoutClaimed: item.payout_claimed === true,
        principalWithdrawn: item.principal_withdrawn === true,
      };
    })
    .filter((position) => position.id);
}

export async function settleProtectionPositionOnChain(input: {
  userAddress: string;
  network: StellarNetwork;
  contractPositionId: string;
}): Promise<ContractSettlementReceipt> {
  try {
    const positionId = BigInt(input.contractPositionId);
    const engine = new Contract(engineContractId());
    const result = await submitContractOperations({
      userAddress: input.userAddress,
      network: input.network,
      failureLabel: 'Position settlement failed',
      operations: [
        engine.call(
          'settle_position',
          Address.fromString(input.userAddress).toScVal(),
          nativeToScVal(positionId, { type: 'u64' }),
        ),
      ],
    });
    return { transactionHash: result.transactionHash };
  } catch (error) {
    throw new Error(getContractErrorMessage(error));
  }
}

export async function claimProtectionPayoutOnChain(input: {
  userAddress: string;
  network: StellarNetwork;
  contractPositionId: string;
}): Promise<ContractSettlementReceipt> {
  try {
    const positionId = BigInt(input.contractPositionId);
    const engine = new Contract(engineContractId());
    const result = await submitContractOperations({
      userAddress: input.userAddress,
      network: input.network,
      failureLabel: 'Payout claim failed',
      operations: [
        engine.call(
          'claim_payout',
          Address.fromString(input.userAddress).toScVal(),
          nativeToScVal(positionId, { type: 'u64' }),
        ),
      ],
    });
    return { transactionHash: result.transactionHash };
  } catch (error) {
    throw new Error(getContractErrorMessage(error));
  }
}

export async function withdrawProtectionPrincipalOnChain(input: {
  userAddress: string;
  network: StellarNetwork;
  contractPositionId: string;
}): Promise<ContractSettlementReceipt> {
  try {
    const positionId = BigInt(input.contractPositionId);
    const engine = new Contract(engineContractId());
    const result = await submitContractOperations({
      userAddress: input.userAddress,
      network: input.network,
      failureLabel: 'Principal withdrawal failed',
      operations: [
        engine.call(
          'withdraw_principal',
          Address.fromString(input.userAddress).toScVal(),
          nativeToScVal(positionId, { type: 'u64' }),
        ),
      ],
    });
    return { transactionHash: result.transactionHash };
  } catch (error) {
    throw new Error(getContractErrorMessage(error));
  }
}


export async function getReserveClaimDetails(input: {
  userAddress: string;
  network: StellarNetwork;
  contractPositionId: string;
  payoutAssetContractId: string;
}): Promise<ReserveClaimDetails> {
  try {
    const reserve = reserveVaultContractId();
    const claimId = BigInt(input.contractPositionId);
    const token = Address.fromString(input.payoutAssetContractId).toScVal();
    const claimArg = nativeToScVal(claimId, { type: 'u64' });

    const [claimRecord, positionLocked, poolState] = await Promise.all([
      simulateContractCall({
        userAddress: input.userAddress,
        network: input.network,
        contractId: reserve,
        method: 'get_claim',
        args: [claimArg],
      }).catch(() => null),
      simulateContractCall({
        userAddress: input.userAddress,
        network: input.network,
        contractId: reserve,
        method: 'get_locked_for_position',
        args: [claimArg],
      }),
      simulateContractCall({
        userAddress: input.userAddress,
        network: input.network,
        contractId: reserve,
        method: 'get_pool',
        args: [token],
      }),
    ]);

    const amount = nativeString(claimField(claimRecord, 'amount'));
    const withdrawn = claimField(claimRecord, 'withdrawn') === true;

    return {
      claimId: input.contractPositionId,
      amount,
      withdrawn,
      withdrawableAmount: withdrawn ? '0' : amount,
      positionLockedAmount: nativeString(positionLocked),
      poolReservedClaims: nativeString(claimField(poolState, 'reserved_claims')),
    };
  } catch (error) {
    throw new Error(getContractErrorMessage(error));
  }
}

export type ReservePoolView = {
  totalAssets: number;
  totalShares: number;
  providerShares: number;
  providerNav: number;
  lockedLiabilities: number;
  reservedClaims: number;
  unearnedPremiums: number;
  safetyBalance: number;
  automationBalance: number;
  utilizationBps: number;
};

export async function getReservePoolOnChain(input: {
  userAddress: string;
  network: StellarNetwork;
}): Promise<ReservePoolView> {
  const tokenId = payoutAssetContractId(input.network);
  const token = Address.fromString(tokenId).toScVal();
  const [pool, shares, nav, utilization] = await Promise.all([
    simulateContractCall({ userAddress: input.userAddress, network: input.network, contractId: reserveVaultContractId(), method: 'get_pool', args: [token] }),
    simulateContractCall({ userAddress: input.userAddress, network: input.network, contractId: reserveVaultContractId(), method: 'get_provider_shares', args: [Address.fromString(input.userAddress).toScVal(), token] }),
    simulateContractCall({ userAddress: input.userAddress, network: input.network, contractId: reserveVaultContractId(), method: 'get_provider_nav', args: [token] }),
    simulateContractCall({ userAddress: input.userAddress, network: input.network, contractId: reserveVaultContractId(), method: 'get_utilization_bps', args: [token] }),
  ]);
  return {
    totalAssets: fromStroops(claimField(pool, 'total_assets')),
    totalShares: fromStroops(claimField(pool, 'total_shares')),
    providerShares: fromStroops(shares),
    providerNav: fromStroops(nav),
    lockedLiabilities: fromStroops(claimField(pool, 'locked_liabilities')),
    reservedClaims: fromStroops(claimField(pool, 'reserved_claims')),
    unearnedPremiums: fromStroops(claimField(pool, 'unearned_premiums')),
    safetyBalance: fromStroops(claimField(pool, 'safety_balance')),
    automationBalance: fromStroops(claimField(pool, 'automation_balance')),
    utilizationBps: nativeNumber(utilization),
  };
}

export async function depositReserveOnChain(input: {
  userAddress: string;
  network: StellarNetwork;
  amount: number;
}) {
  const reserve = new Contract(reserveVaultContractId());
  return submitContractOperations({
    userAddress: input.userAddress,
    network: input.network,
    failureLabel: 'Reserve deposit failed',
    operations: [reserve.call(
      'deposit_reserve',
      Address.fromString(input.userAddress).toScVal(),
      Address.fromString(payoutAssetContractId(input.network)).toScVal(),
      nativeToScVal(toStroops(input.amount), { type: 'i128' }),
      nativeToScVal(0n, { type: 'i128' }),
    )],
  });
}

export async function getPayoutAssetBalanceOnChain(input: {
  userAddress: string;
  network: StellarNetwork;
}) {
  try {
    const result = await simulateContractCall({
      userAddress: input.userAddress,
      network: input.network,
      contractId: payoutAssetContractId(input.network),
      method: 'balance',
      args: [Address.fromString(input.userAddress).toScVal()],
    });
    return fromStroops(result);
  } catch (error) {
    if (isMissingTrustlineError(error)) {
      return null;
    }
    throw new Error(getContractErrorMessage(error));
  }
}

export async function trustPayoutAssetOnChain(input: {
  userAddress: string;
  network: StellarNetwork;
}) {
  try {
    const payout = new Contract(payoutAssetContractId(input.network));
    return submitContractOperations({
      userAddress: input.userAddress,
      network: input.network,
      failureLabel: 'Test CFTUSD trustline setup failed',
      operations: [payout.call(
        'trust',
        Address.fromString(input.userAddress).toScVal(),
      )],
    });
  } catch (error) {
    throw new Error(getContractErrorMessage(error));
  }
}

export async function requestReserveWithdrawalOnChain(input: {
  userAddress: string;
  network: StellarNetwork;
  shares: number;
}) {
  const reserve = new Contract(reserveVaultContractId());
  return submitContractOperations({
    userAddress: input.userAddress,
    network: input.network,
    failureLabel: 'Withdrawal request failed',
    operations: [reserve.call(
      'request_withdraw',
      Address.fromString(input.userAddress).toScVal(),
      Address.fromString(payoutAssetContractId(input.network)).toScVal(),
      nativeToScVal(toStroops(input.shares), { type: 'i128' }),
    )],
  });
}

export async function executeReserveWithdrawalOnChain(input: {
  userAddress: string;
  network: StellarNetwork;
  requestId: string;
}) {
  const reserve = new Contract(reserveVaultContractId());
  return submitContractOperations({
    userAddress: input.userAddress,
    network: input.network,
    failureLabel: 'Withdrawal execution failed',
    operations: [reserve.call(
      'execute_withdraw',
      Address.fromString(input.userAddress).toScVal(),
      nativeToScVal(BigInt(input.requestId), { type: 'u64' }),
      nativeToScVal(0n, { type: 'i128' }),
    )],
  });
}

export type UsernamePaymentResult = {
  transactionHash: string;
};

export type PaymentReceiptAnchorResult = {
  transactionHash: string;
  receiptTransactionHash: string;
  feePaid: number;
  receiptHash: string;
};

function paymentAssetForLabel(asset: string, network: StellarNetwork) {
  const paymentAssetSymbol = asset.split(/\s+/)[0].toUpperCase();
  const paymentAsset = asset === 'XLM Stellar' || asset === 'XLM'
    ? Asset.native()
    : new Asset(
        paymentAssetSymbol,
        String(import.meta.env[`VITE_${paymentAssetSymbol}_${network.toUpperCase()}_ISSUER`] || '').trim()
      );
  return { paymentAsset, paymentAssetSymbol };
}

export async function sendUsernamePayment(input: {
  userAddress: string;
  network: StellarNetwork;
  receiverAddress: string;
  amount: number;
  asset: string;
}): Promise<UsernamePaymentResult> {
  try {
    const passphrase = networkPassphrase(input.network);
    await assertWalletNetwork(input.network, passphrase, input.userAddress);

    const server = new rpc.Server(rpcUrl(input.network), { allowHttp: false });
    const source = await getAccountWithSafeSequence(server, input.userAddress, passphrase);
    const { paymentAsset } = paymentAssetForLabel(input.asset, input.network);

    const paymentTxBuilder = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: passphrase,
    });

    paymentTxBuilder.addOperation(
      Operation.payment({
        destination: input.receiverAddress,
        asset: paymentAsset,
        amount: input.amount.toString(),
      })
    );

    const paymentTx = paymentTxBuilder.setTimeout(60).build();
    const signed = await signTransactionWithAvailableWallet(paymentTx.toXDR(), {
      address: input.userAddress,
      networkPassphrase: passphrase,
    });

    if (signed.error || !signed.signedTxXdr) {
      throw new Error(signed.error?.message || 'The selected wallet rejected the payment transaction.');
    }

    const signedTransaction = TransactionBuilder.fromXDR(signed.signedTxXdr, passphrase);
    const sent = await server.sendTransaction(signedTransaction);

    if (sent.status !== 'PENDING') {
      const resultCode = getTransactionResultCode(sent.errorResult);
      if (resultCode === 'txBadSeq') {
        clearSequenceGuard(input.userAddress, passphrase);
      }
      const errorResult = sent.errorResult ? sent.errorResult.toXDR('base64') : '';
      throw new Error(errorResult ? `Payment failed before confirmation (${resultCode || 'unknown'}): ${errorResult}` : `Payment status: ${sent.status}`);
    }

    rememberSubmittedSequence(input.userAddress, passphrase, signedTransaction);
    const confirmed = await server.pollTransaction(sent.hash, { attempts: 30 });
    if (confirmed.status !== 'SUCCESS') {
      console.error("Payment Transaction Failed!", confirmed);
      const errDetails = (confirmed as any).errorResultXdr || (confirmed as any).resultXdr || confirmed.status;
      throw new Error(`Payment was not successful: ${confirmed.status}. Check console for details. (XDR: ${errDetails})`);
    }

    return { transactionHash: sent.hash };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || '');
    throw new Error(message || 'Could not send payment.');
  }
}

export async function createPaymentReceiptOnChain(input: {
  userAddress: string;
  network: StellarNetwork;
  receiverAddress: string;
  amount: number;
  asset: string;
  paymentTxHash: string;
}): Promise<PaymentReceiptAnchorResult> {
  try {
    const passphrase = networkPassphrase(input.network);
    await assertWalletNetwork(input.network, passphrase, input.userAddress);

    const server = new rpc.Server(rpcUrl(input.network), { allowHttp: false });
    const paymentReceiptRegistryId = String(
      import.meta.env.VITE_RECEIPT_REGISTRY_ID || '',
    ).trim();
    if (!paymentReceiptRegistryId) {
      throw new Error('VITE_RECEIPT_REGISTRY_ID is missing in .env.');
    }

    const receiptContract = new Contract(paymentReceiptRegistryId);
    const { paymentAssetSymbol } = paymentAssetForLabel(input.asset, input.network);
    const source = await getAccountWithSafeSequence(server, input.userAddress, passphrase);

    const receiptTxBuilder = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: passphrase,
    });

    const paymentTxHash = input.paymentTxHash.toLowerCase();
    const receiptUri = `stellar://payment-receipt/${paymentTxHash}`;
    const receiptHash = await sha256CanonicalReceipt({
      schema: 'coverfi.payment_receipt.v1',
      network: input.network,
      sender: input.userAddress,
      receiver: input.receiverAddress,
      asset: paymentAssetSymbol,
      amount: input.amount.toString(),
      paymentTxHash,
      receiptUri,
    });
    const referenceHash = await sha256CanonicalReceipt({
      schema: 'coverfi.payment_receipt_reference.v1',
      network: input.network,
      paymentTxHash,
    });
    receiptTxBuilder.addOperation(
      receiptContract.call(
        'create_receipt',
        Address.fromString(input.userAddress).toScVal(),
        nativeToScVal(receiptHash.bytes, { type: 'bytes' }),
        nativeToScVal(referenceHash.bytes, { type: 'bytes' }),
      )
    );

    const receiptTx = receiptTxBuilder.setTimeout(60).build();
    const preparedReceiptTx = await server.prepareTransaction(receiptTx);
    
    const signed = await signTransactionWithAvailableWallet(preparedReceiptTx.toXDR(), {
      address: input.userAddress,
      networkPassphrase: passphrase,
    });

    if (signed.error || !signed.signedTxXdr) {
      throw new Error(signed.error?.message || 'The selected wallet rejected the receipt transaction.');
    }

    const signedTransaction = TransactionBuilder.fromXDR(signed.signedTxXdr, passphrase);
    const sent = await server.sendTransaction(signedTransaction);

    if (sent.status !== 'PENDING') {
      const resultCode = getTransactionResultCode(sent.errorResult);
      if (resultCode === 'txBadSeq') {
        clearSequenceGuard(input.userAddress, passphrase);
      }
      const errorResult = sent.errorResult ? sent.errorResult.toXDR('base64') : '';
      throw new Error(errorResult ? `Receipt creation failed (${resultCode || 'unknown'}): ${errorResult}` : `Receipt creation status: ${sent.status}`);
    }

    rememberSubmittedSequence(input.userAddress, passphrase, signedTransaction);
    const confirmed = await server.pollTransaction(sent.hash, { attempts: 30 });
    if (confirmed.status !== 'SUCCESS') {
      console.error("Receipt Transaction Failed!", confirmed);
      const errDetails = (confirmed as any).errorResultXdr || (confirmed as any).resultXdr || confirmed.status;
      throw new Error(`Receipt creation was not successful: ${confirmed.status}. Check console for details. (XDR: ${errDetails})`);
    }

    return {
      transactionHash: input.paymentTxHash,
      receiptTransactionHash: sent.hash,
      receiptHash: receiptHash.hex,
      feePaid: RECEIPT_PRINT_FEE_CFTUSD,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || '');
    throw new Error(message || 'Could not create payment receipt.');
  }
}

export async function sendPaymentAndCreateReceipt(input: {
  userAddress: string;
  network: StellarNetwork;
  receiverAddress: string;
  amount: number;
  asset: string;
  onPaymentSuccess?: () => void;
}): Promise<PaymentReceiptAnchorResult> {
  const payment = await sendUsernamePayment(input);
  input.onPaymentSuccess?.();
  return createPaymentReceiptOnChain({
    ...input,
    paymentTxHash: payment.transactionHash,
  });
}

export type ZkProofAnchorInput = {
  userAddress: string;
  network: StellarNetwork;
  circuitIdHash: string;
  commitmentHash: string;
  publicInputsHash: string;
  proofHash: string;
  verifierHash: string;
};

export type ZkProofAnchorResult = {
  transactionHash: string;
};

export async function getZkProofStatusOnChain(input: {
  userAddress: string;
  network: StellarNetwork;
  subjectAddress?: string;
  circuitIdHash: string;
}) {
  const contractId = zkVerifierContractId();
  if (!contractId) return false;

  try {
    const result = await simulateContractCall({
      userAddress: input.userAddress,
      network: input.network,
      contractId,
      method: 'has_verified',
      args: [
        Address.fromString(input.subjectAddress || input.userAddress).toScVal(),
        bytes32ScVal(input.circuitIdHash),
      ],
    });
    return Boolean(result);
  } catch (error) {
    throw new Error(getContractErrorMessage(error));
  }
}

export async function recordZkProofOnChain(input: ZkProofAnchorInput): Promise<ZkProofAnchorResult> {
  const contractId = zkVerifierContractId();
  if (!contractId) {
    throw new Error('VITE_ZK_VERIFIER_CONTRACT_ID is missing in .env.');
  }

  try {
    const contract = new Contract(contractId);
    const result = await submitContractOperations({
      userAddress: input.userAddress,
      network: input.network,
      failureLabel: 'ZK proof anchoring failed',
      operations: [
        contract.call(
          'record_proof',
          Address.fromString(input.userAddress).toScVal(),
          bytes32ScVal(input.circuitIdHash),
          bytes32ScVal(input.commitmentHash),
          bytes32ScVal(input.publicInputsHash),
          bytes32ScVal(input.proofHash),
          bytes32ScVal(input.verifierHash),
        ),
      ],
    });
    return { transactionHash: result.transactionHash };
  } catch (error) {
    throw new Error(getContractErrorMessage(error));
  }
}
