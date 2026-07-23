import {
  getAddress,
  isConnected,
  requestAccess,
  signMessage as signFreighterMessage,
  signTransaction as signFreighterTransaction,
} from "@stellar/freighter-api";

const SELECTED_WALLET_KEY = "coverfi_selected_stellar_wallet";
const PUBLIC_NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const TESTNET_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

type StellarWalletsKitRuntime = typeof import("@creit.tech/stellar-wallets-kit/sdk")["StellarWalletsKit"];
type DefaultModules = typeof import("@creit.tech/stellar-wallets-kit/modules/utils")["defaultModules"];

type FreighterResult<T> = T & {
  error?: {
    message?: string;
  };
};

type WalletSignResult = {
  signedTxXdr?: string;
  signerAddress?: string;
  error?: {
    message?: string;
  };
};

let walletKitPromise: Promise<{
  StellarWalletsKit: StellarWalletsKitRuntime;
  defaultModules: DefaultModules;
}> | null = null;
let initialized = false;

function assertWalletResponse<T>(response: FreighterResult<T>, fallbackMessage: string): T {
  if (response.error) {
    throw new Error(response.error.message || fallbackMessage);
  }

  return response;
}

export function networkPassphraseFromEnv() {
  return String(import.meta.env.VITE_STELLAR_NETWORK || "testnet") === "mainnet"
    ? PUBLIC_NETWORK_PASSPHRASE
    : TESTNET_NETWORK_PASSPHRASE;
}

async function loadWalletKit() {
  if (!walletKitPromise) {
    walletKitPromise = Promise.all([
      import("@creit.tech/stellar-wallets-kit/sdk"),
      import("@creit.tech/stellar-wallets-kit/modules/utils"),
    ]).then(([sdk, modules]) => ({
      StellarWalletsKit: sdk.StellarWalletsKit,
      defaultModules: modules.defaultModules,
    }));
  }

  return walletKitPromise;
}

async function initWalletKit() {
  const runtime = await loadWalletKit();
  const { StellarWalletsKit, defaultModules } = runtime;
  if (initialized) return runtime;
  initialized = true;

  StellarWalletsKit.init({
    modules: defaultModules(),
    network: networkPassphraseFromEnv() as never,
    selectedWalletId: window.localStorage.getItem(SELECTED_WALLET_KEY) || undefined,
    authModal: {
      showInstallLabel: true,
      hideUnsupportedWallets: false,
    },
    theme: {
      "background": "#07100E",
      "background-secondary": "#101B18",
      "foreground-strong": "#F2F0DF",
      "foreground": "#DCD9C6",
      "foreground-secondary": "#A7A38D",
      "primary": "#8AD7C1",
      "primary-foreground": "#06100D",
      "transparent": "transparent",
      "lighter": "#F2F0DF",
      "light": "#DCD9C6",
      "light-gray": "#A7A38D",
      "gray": "#55615D",
      "danger": "#FCA5A5",
      "border": "rgba(242, 240, 223, 0.16)",
      "shadow": "0 24px 80px rgba(0, 0, 0, 0.45)",
      "border-radius": "16px",
      "font-family": "Inter, ui-sans-serif, system-ui, sans-serif",
    },
  });

  return runtime;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function textToBase64(value: string) {
  return bytesToBase64(new TextEncoder().encode(value));
}

function signedMessageToBase64(value: unknown) {
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return bytesToBase64(value);
  if (value instanceof ArrayBuffer) return bytesToBase64(new Uint8Array(value));
  if (Array.isArray(value)) return bytesToBase64(new Uint8Array(value));
  if (value && typeof value === "object" && "data" in value) {
    const data = (value as { data?: unknown }).data;
    if (Array.isArray(data)) return bytesToBase64(new Uint8Array(data));
    if (data instanceof ArrayBuffer) return bytesToBase64(new Uint8Array(data));
    if (data instanceof Uint8Array) return bytesToBase64(data);
  }
  throw new Error("The selected wallet returned an unsupported signature format.");
}

async function connectFreighterFallback() {
  const connection = assertWalletResponse(await isConnected(), "Freighter is not available.");

  if (!connection.isConnected) {
    throw new Error("Install or unlock a Stellar wallet, then try again.");
  }

  const access = assertWalletResponse(await requestAccess(), "Wallet connection was rejected.");

  if (access.address) {
    window.localStorage.setItem(SELECTED_WALLET_KEY, "freighter");
    return access.address;
  }

  const existingAddress = assertWalletResponse(await getAddress(), "Could not read your wallet address.");
  window.localStorage.setItem(SELECTED_WALLET_KEY, "freighter");
  return existingAddress.address;
}

export async function connectStellarWallet() {
  const { StellarWalletsKit } = await initWalletKit();

  try {
    const result = await StellarWalletsKit.authModal();
    if (!result.address) {
      throw new Error("No wallet address was selected.");
    }
    const selectedId = StellarWalletsKit.selectedModule?.productId;
    if (selectedId) {
      window.localStorage.setItem(SELECTED_WALLET_KEY, selectedId);
    }
    return result.address;
  } catch (error) {
    try {
      return await connectFreighterFallback();
    } catch {
      throw error instanceof Error
        ? error
        : new Error("Could not connect a Stellar wallet.");
    }
  }
}

export async function signStellarWalletMessage(
  message: string,
  address: string,
  options: { legacyBase64Payload?: boolean } = {},
) {
  const { StellarWalletsKit } = await initWalletKit();
  const payload = options.legacyBase64Payload ? textToBase64(message) : message;
  const networkPassphrase = networkPassphraseFromEnv();

  try {
    const result = await StellarWalletsKit.signMessage(payload, {
      address,
      networkPassphrase,
    });

    if (result.signerAddress && result.signerAddress !== address) {
      throw new Error("The selected wallet signed with a different account.");
    }

    if (!result.signedMessage) {
      throw new Error("The selected wallet did not return a signature.");
    }

    return signedMessageToBase64(result.signedMessage);
  } catch (kitError) {
    const result = assertWalletResponse(
      await signFreighterMessage(payload, {
        address,
        networkPassphrase,
      }),
      "The selected wallet rejected the authentication signature.",
    );

    if (result.signerAddress && result.signerAddress !== address) {
      throw new Error("The selected wallet signed with a different account.");
    }

    if (!result.signedMessage) {
      throw kitError instanceof Error
        ? kitError
        : new Error("The selected wallet did not return a signature.");
    }

    return signedMessageToBase64(result.signedMessage);
  }
}

export async function signTransactionWithSelectedWallet(
  transactionXdr: string,
  options: {
    address: string;
    networkPassphrase: string;
  },
): Promise<WalletSignResult> {
  const { StellarWalletsKit } = await initWalletKit();

  try {
    const result = await StellarWalletsKit.signTransaction(transactionXdr, options);
    return {
      signedTxXdr: result.signedTxXdr,
      signerAddress: result.signerAddress,
    };
  } catch (kitError) {
    try {
      return await signFreighterTransaction(transactionXdr, options);
    } catch {
      return {
        error: {
          message: kitError instanceof Error
            ? kitError.message
            : "The selected wallet rejected the transaction.",
        },
      };
    }
  }
}

export async function getSupportedWallets() {
  const { StellarWalletsKit } = await initWalletKit();
  return StellarWalletsKit.refreshSupportedWallets();
}
