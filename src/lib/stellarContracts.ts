import { getNetworkDetails, signTransaction } from '@stellar/freighter-api';
import {
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
} from '@stellar/stellar-sdk';
import type { StellarNetwork } from '../context/AppContext';

const TESTNET_RPC = 'https://soroban-testnet.stellar.org';
const MAINNET_RPC = 'https://mainnet.sorobanrpc.com';
const STROOPS_PER_UNIT = 10_000_000n;

type CreateProtectionPositionInput = {
  userAddress: string;
  network: StellarNetwork;
  asset: string;
  protectedAmount: number;
  durationSeconds: number;
  triggerPrice: number;
};

export type ContractPositionReceipt = {
  transactionHash: string;
  contractPositionId?: string;
  assetContractId: string;
  payoutAssetContractId: string;
};

export type ProtectionAssetOption = {
  label: string;
  symbol: string;
  configured: boolean;
};

const configurableAssets = [
  { label: 'USDC on Stellar', symbol: 'USDC' },
  { label: 'EURC on Stellar', symbol: 'EURC' },
  { label: 'PYUSD on Stellar', symbol: 'PYUSD' },
  { label: 'AQUA Stellar', symbol: 'AQUA' },
  { label: 'yUSDC Stellar', symbol: 'YUSDC' },
  { label: 'USDT Stellar', symbol: 'USDT' },
];

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

function xlmAssetContractId(network: StellarNetwork) {
  return Asset.native().contractId(networkPassphrase(network));
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
  return [
    { label: 'XLM Stellar', symbol: 'XLM', configured: true },
    ...configurableAssets.map((asset) => {
      const lookupKey = `VITE_${asset.symbol}_${network.toUpperCase()}_CONTRACT_ID`;
      const issuerKey = `VITE_${asset.symbol}_${network.toUpperCase()}_ISSUER`;
      const configured = Boolean(
        String(import.meta.env[lookupKey] || '').trim() ||
        String(import.meta.env[issuerKey] || '').trim(),
      );
      return { ...asset, configured };
    }),
  ];
}

export function getDefaultProtectionAsset(network: StellarNetwork) {
  return getProtectionAssetOptions(network).find((asset) => asset.configured)?.label || 'XLM Stellar';
}

function getContractErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');

  if (message.includes('MissingValue') || message.includes('non-existing value for contract instance')) {
    return 'The protection contract is deployed but not initialized on this Stellar network. Initialize the engine, vaults, oracle, reserve funding, and oracle prices before creating positions.';
  }

  return message || 'Could not create contract position.';
}

function toStroops(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be greater than zero.');
  }

  return BigInt(Math.round(amount * Number(STROOPS_PER_UNIT)));
}

function toPriceInt(price: number) {
  if (!Number.isFinite(price) || price <= 0 || price > 1) {
    throw new Error('Trigger price must be between 0 and 1 for this protection contract.');
  }

  return BigInt(Math.round(price * Number(STROOPS_PER_UNIT)));
}

async function assertWalletNetwork(expectedNetwork: StellarNetwork, expectedPassphrase: string) {
  const details = await getNetworkDetails();

  if (details.error) {
    throw new Error(details.error.message || 'Could not read Freighter network.');
  }

  if (details.networkPassphrase && details.networkPassphrase !== expectedPassphrase) {
    throw new Error(`Freighter is not on ${expectedNetwork}. Switch Freighter network before creating the contract position.`);
  }
}

export async function createProtectionPositionOnChain(input: CreateProtectionPositionInput): Promise<ContractPositionReceipt> {
  try {
    const passphrase = networkPassphrase(input.network);
    await assertWalletNetwork(input.network, passphrase);

    const server = new rpc.Server(rpcUrl(input.network), { allowHttp: false });
    const source = await server.getAccount(input.userAddress);
    const engine = new Contract(engineContractId());
    const protectedAsset = assetContractId(input.asset, input.network);
    const payoutAsset = protectedAsset;

    const transaction = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: passphrase,
    })
      .addOperation(engine.call(
        'create_position',
        Address.fromString(input.userAddress).toScVal(),
        Address.fromString(protectedAsset).toScVal(),
        Address.fromString(payoutAsset).toScVal(),
        nativeToScVal(toStroops(input.protectedAmount), { type: 'i128' }),
        nativeToScVal(BigInt(input.durationSeconds), { type: 'u64' }),
        nativeToScVal(toPriceInt(input.triggerPrice), { type: 'i128' }),
      ))
      .setTimeout(60)
      .build();

    const preparedTransaction = await server.prepareTransaction(transaction);
    const signed = await signTransaction(preparedTransaction.toXDR(), {
      address: input.userAddress,
      networkPassphrase: passphrase,
    });

    if (signed.error || !signed.signedTxXdr) {
      throw new Error(signed.error?.message || 'Freighter rejected the contract transaction.');
    }

    const signedTransaction = TransactionBuilder.fromXDR(signed.signedTxXdr, passphrase);
    const sent = await server.sendTransaction(signedTransaction);

    if (sent.status !== 'PENDING') {
      const errorResult = sent.errorResult ? sent.errorResult.toXDR('base64') : '';
      throw new Error(errorResult ? `Contract transaction failed before confirmation: ${errorResult}` : `Contract transaction status: ${sent.status}`);
    }

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
