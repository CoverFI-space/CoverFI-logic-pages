const PUBLIC_NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const TESTNET_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

type StellarWalletsKitRuntime = typeof import("@creit.tech/stellar-wallets-kit/sdk")["StellarWalletsKit"];
type DefaultModules = typeof import("@creit.tech/stellar-wallets-kit/modules/utils")["defaultModules"];
type WalletModule = ReturnType<DefaultModules>[number];

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
let walletConnectionPromise: Promise<string> | null = null;
const walletSignaturePromises = new Map<string, Promise<string>>();
let oneKeyAddressPromise: Promise<string> | null = null;

type OneKeyStellarProvider = {
  isOneKey?: boolean;
  getAddress: (options?: { path?: string }) => Promise<{ address: string }>;
  getNetwork?: () => Promise<{ network?: string; networkPassphrase?: string }>;
  signTransaction: (xdr: string, options?: Record<string, unknown>) => Promise<{
    signedTxXdr: string;
    signerAddress?: string;
  }>;
  signAuthEntry: (entry: string, options?: Record<string, unknown>) => Promise<{
    signedAuthEntry: string;
    signerAddress?: string;
  }>;
  signMessage: (message: string, options?: Record<string, unknown>) => Promise<{
    signedMessage: string;
    signerAddress?: string;
  }>;
};

declare global {
  interface Window {
    $onekey?: { stellar?: OneKeyStellarProvider };
  }
}

function getOneKeyProvider() {
  const provider = window.$onekey?.stellar;
  if (
    !provider
    || provider.isOneKey !== true
    || typeof provider.getAddress !== "function"
    || typeof provider.signMessage !== "function"
  ) {
    throw new Error("OneKey Stellar provider was not detected. Unlock the OneKey extension and enable its Stellar account.");
  }
  return provider;
}

function getOneKeyAddress() {
  if (!oneKeyAddressPromise) {
    oneKeyAddressPromise = getOneKeyProvider()
      .getAddress()
      .then((result) => {
        const address = String(result?.address || '').trim();
        if (!address) throw new Error('OneKey did not return a Stellar address.');
        return address;
      });
    oneKeyAddressPromise.catch(() => {
      oneKeyAddressPromise = null;
    });
  }
  return oneKeyAddressPromise;
}

// Stellar Wallets Kit 2.5.0 still calls OneKey's retired getPublicKey API.
// Keep the kit UI and selection lifecycle, but adapt this one module to
// OneKey's current Stellar provider API (getAddress / getNetwork).
function createCurrentOneKeyModule(module: WalletModule): WalletModule {
  if (module.productId !== "onekey") return module;
  return new Proxy(module, {
    get(target, property, receiver) {
      if (property === "isAvailable") {
        return async () => {
          const provider = window.$onekey?.stellar;
          return Boolean(
            provider
            && provider.isOneKey === true
            && typeof provider.getAddress === "function"
            && typeof provider.signMessage === "function",
          );
        };
      }
      // OneKey is an injected browser wallet, not a platform wrapper.  The
      // wallet kit auto-selects platform wrappers while rendering its modal;
      // explicitly returning false prevents a render/reconnect loop.
      if (property === "isPlatformWrapper") {
        return async () => false;
      }
      if (property === "getAddress") {
        return async () => ({ address: await getOneKeyAddress() });
      }
      if (property === "getNetwork") {
        return async () => getOneKeyProvider().getNetwork?.() || {
          networkPassphrase: networkPassphraseFromEnv(),
        };
      }
      if (property === "signTransaction") {
        return async (xdr: string, options?: Record<string, unknown>) => (
          getOneKeyProvider().signTransaction(xdr, options)
        );
      }
      if (property === "signAuthEntry") {
        return async (entry: string, options?: Record<string, unknown>) => (
          getOneKeyProvider().signAuthEntry(entry, options)
        );
      }
      if (property === "signMessage") {
        return async (message: string, options?: Record<string, unknown>) => (
          getOneKeyProvider().signMessage(message, options)
        );
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
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
    modules: defaultModules().map(createCurrentOneKeyModule),
    network: networkPassphraseFromEnv() as never,
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

function walletError(error: unknown, fallback: string) {
  if (error instanceof Error) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return new Error(message);
  }
  return new Error(fallback);
}

export async function connectStellarWallet() {
  if (walletConnectionPromise) return walletConnectionPromise;

  walletConnectionPromise = (async () => {
    const { StellarWalletsKit } = await initWalletKit();
    try {
      // Keep a successfully authorised OneKey address for this page lifetime.
      // Re-opening the picker must not repeatedly invoke OneKey's permission
      // method; a rejected request clears this cache in getOneKeyAddress().
      // The page clears its own selected-wallet state before opening this
      // picker. Calling the kit's disconnect here makes OneKey re-enter its
      // extension connection lifecycle and can reopen its approval window.
      const result = await StellarWalletsKit.authModal();
      if (!result.address) {
        throw new Error("No wallet address was selected.");
      }
      return result.address;
    } catch (error) {
      throw walletError(error, "Could not connect the selected Stellar wallet.");
    }
  })();

  try {
    return await walletConnectionPromise;
  } finally {
    walletConnectionPromise = null;
  }
}

export async function signStellarWalletMessage(
  message: string,
  address: string,
  options: { legacyBase64Payload?: boolean } = {},
) {
  const requestKey = `${address}:${message}:${options.legacyBase64Payload ? "base64" : "text"}`;
  const inFlight = walletSignaturePromises.get(requestKey);
  if (inFlight) return inFlight;

  const signaturePromise = (async () => {
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
    } catch (error) {
      throw walletError(error, "The selected wallet rejected the authentication signature.");
    }
  })();

  walletSignaturePromises.set(requestKey, signaturePromise);
  try {
    return await signaturePromise;
  } finally {
    walletSignaturePromises.delete(requestKey);
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
  } catch (error) {
    return {
      error: {
        message: walletError(error, "The selected wallet rejected the transaction.").message,
      },
    };
  }
}

export async function getSupportedWallets() {
  const { StellarWalletsKit } = await initWalletKit();
  return StellarWalletsKit.refreshSupportedWallets();
}
