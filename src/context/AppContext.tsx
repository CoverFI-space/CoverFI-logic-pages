import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getStoredSession } from "../lib/usernameStore";
import {
  getUserProtectionPositionsOnChain,
  type OnChainProtectionPosition,
} from "../lib/stellarContracts";
import {
  readPrivateRecord,
  removePrivateRecord,
  writePrivateRecord,
} from "../lib/encryptedStorage";

export type UserProfile = {
  fullName: string;
  contact: string;
  city: string;
  createdAt: string;
  email: string;
  emailVerifiedAt: string;
  emailSignedAt: string;
  emailSigner: string;
  emailProofDigest: string;
  emailProofScheme: string;
  mfaEnabledAt: string;
  mfaSignedAt: string;
  mfaSigner: string;
  mfaProofDigest: string;
  mfaProofScheme: string;
  mfaProofTxHash: string;
  mfaProofAnchoredAt: string;
  kycStatus: string;
  kycVerifiedAt: string;
  kycSessionId: string;
  kycProofDigest: string;
  kycProofTxHash: string;
  kycProofAnchoredAt: string;
  kycProofSigner: string;
};

export type StellarNetwork = "testnet" | "mainnet";
export type PositionStatus = "Active" | "AwaitingOracle" | "SettledNoPayout" | "Claimable" | "Claimed" | "PrincipalWithdrawn";

export type ProtectionPosition = {
  id: string;
  asset: string;
  protectedAmount: number;
  feePaid: number;
  entryPrice: number;
  currentPrice: number;
  startTime: string;
  expiryTime: string;
  status: PositionStatus;
  claimableAmount: number;
  maximumPayout?: number;
  settlementPrice?: number;
  payoutClaimed?: boolean;
  principalWithdrawn?: boolean;
  contractPositionId?: string;
  transactionHash?: string;
  assetContractId?: string;
  payoutAssetContractId?: string;
};

export type ActivityLog = {
  id: string;
  label: string;
  createdAt: string;
};

type AppData = {
  positions: ProtectionPosition[];
  activity: ActivityLog[];
};

type AppContextValue = {
  profile: UserProfile;
  data: AppData;
  network: StellarNetwork;
  toast: string;
  setNetwork: (network: StellarNetwork) => void;
  updateProfile: (profile: UserProfile) => void;
  createPosition: (
    position: Omit<
      ProtectionPosition,
      "id" | "startTime" | "status" | "claimableAmount"
    >,
  ) => void;
  refreshPositions: () => Promise<void>;
  setToast: (message: string) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

const defaultProfile: UserProfile = {
  fullName: "",
  contact: "",
  city: "",
  createdAt: new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }),
  email: "",
  emailVerifiedAt: "",
  emailSignedAt: "",
  emailSigner: "",
  emailProofDigest: "",
  emailProofScheme: "",
  mfaEnabledAt: "",
  mfaSignedAt: "",
  mfaSigner: "",
  mfaProofDigest: "",
  mfaProofScheme: "",
  mfaProofTxHash: "",
  mfaProofAnchoredAt: "",
  kycStatus: "",
  kycVerifiedAt: "",
  kycSessionId: "",
  kycProofDigest: "",
  kycProofTxHash: "",
  kycProofAnchoredAt: "",
  kycProofSigner: "",
};

const emptyData: AppData = {
  positions: [],
  activity: [],
};

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function nowLabel() {
  return new Date().toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type StoredAccountState = {
  profile?: Partial<UserProfile>;
  data?: Partial<AppData>;
  network?: StellarNetwork;
};

function normalizePosition(raw: any): ProtectionPosition | null {
  if (!raw || typeof raw !== "object") return null;

  const entryPrice = Number(raw.entryPrice ?? raw.currentPrice ?? 0);

  return {
    id: String(raw.id || createId("POS")),
    asset: String(raw.asset || "XLM Stellar"),
    protectedAmount: Number(raw.protectedAmount || 0),
    feePaid: Number(raw.feePaid || 0),
    entryPrice: Number.isFinite(entryPrice) && entryPrice > 0 ? entryPrice : 1,
    currentPrice: Number(raw.currentPrice || entryPrice || 1),
    startTime: String(raw.startTime || new Date().toISOString()),
    expiryTime: String(raw.expiryTime || new Date().toISOString()),
    status: ["Active", "AwaitingOracle", "SettledNoPayout", "Claimable", "Claimed", "PrincipalWithdrawn"].includes(raw.status)
      ? raw.status
      : "Active",
    claimableAmount: Number(raw.claimableAmount || 0),
    maximumPayout: Number(raw.maximumPayout || 0),
    settlementPrice: Number(raw.settlementPrice || 0),
    payoutClaimed: Boolean(raw.payoutClaimed),
    principalWithdrawn: Boolean(raw.principalWithdrawn),
    contractPositionId: raw.contractPositionId
      ? String(raw.contractPositionId)
      : undefined,
    transactionHash: raw.transactionHash ? String(raw.transactionHash) : undefined,
    assetContractId: raw.assetContractId ? String(raw.assetContractId) : undefined,
    payoutAssetContractId: raw.payoutAssetContractId
      ? String(raw.payoutAssetContractId)
      : undefined,
  };
}

function normalizeAppData(data: Partial<AppData> | undefined): AppData {
  const positions = Array.isArray(data?.positions)
    ? data.positions.map(normalizePosition).filter(Boolean)
    : [];
  const activity = Array.isArray(data?.activity)
    ? data.activity.map((item: any) => ({
        id: String(item?.id || createId("ACT")),
        label: String(item?.label || "Activity"),
        createdAt: String(item?.createdAt || nowLabel()),
      }))
    : [];

  return {
    positions: positions as ProtectionPosition[],
    activity,
  };
}

function mapOnChainStatus(status: OnChainProtectionPosition["status"]): PositionStatus {
  return status;
}

function assetLabelFromContract(contractId: string) {
  return contractId ? `Contract ${contractId.slice(0, 6)}...${contractId.slice(-6)}` : "On-chain asset";
}

function normalizeOnChainPosition(
  position: OnChainProtectionPosition,
  existing?: ProtectionPosition,
): ProtectionPosition {
  return {
    id: `CHAIN-${position.id}`,
    asset: existing?.asset || assetLabelFromContract(position.protectedAssetContractId),
    protectedAmount: position.protectedAmount,
    feePaid: position.feePaid,
    entryPrice: position.entryPrice || existing?.entryPrice || 1,
    currentPrice: existing?.currentPrice || position.entryPrice || 1,
    startTime: position.startTime,
    expiryTime: position.expiryTime,
    status: mapOnChainStatus(position.status),
    claimableAmount: position.claimablePayout,
    maximumPayout: position.maximumPayout,
    settlementPrice: position.settlementPrice,
    payoutClaimed: position.payoutClaimed,
    principalWithdrawn: position.principalWithdrawn,
    contractPositionId: position.id,
    transactionHash: existing?.transactionHash,
    assetContractId: position.protectedAssetContractId,
    payoutAssetContractId: position.payoutAssetContractId,
  };
}

function mergeOnChainPositions(
  localPositions: ProtectionPosition[],
  chainPositions: OnChainProtectionPosition[],
) {
  const localByChainId = new Map(
    localPositions
      .filter((position) => position.contractPositionId)
      .map((position) => [position.contractPositionId, position]),
  );
  const chainRecords = chainPositions.map((position) =>
    normalizeOnChainPosition(position, localByChainId.get(position.id)),
  );
  const chainIds = new Set(chainPositions.map((position) => position.id));
  const localOnly = localPositions.filter(
    (position) =>
      !position.contractPositionId || !chainIds.has(position.contractPositionId),
  );

  return [...chainRecords.reverse(), ...localOnly];
}

async function readStoredAccount(walletAddress: string) {
  if (!walletAddress) return null;
  return readPrivateRecord<StoredAccountState>("account");
}

async function syncAccountState(
  walletAddress: string,
  payload: { profile: UserProfile; data: AppData; network: StellarNetwork },
) {
  if (!walletAddress) return;

  try {
    await writePrivateRecord("account", payload);
  } catch {
    // Keep contract-backed flows usable if encrypted convenience storage fails.
  }
}

export function getAppHomeRoute() {
  return "app/dashboard";
}

export async function clearAppProfile() {
  const session = getStoredSession();
  if (!session?.walletAddress) return;
  await removePrivateRecord("account");
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [data, setData] = useState<AppData>(emptyData);
  const [network, setNetworkState] = useState<StellarNetwork>(() => {
    const session = getStoredSession();
    return session?.network === "mainnet" ? "mainnet" : "testnet";
  });
  const [toast, setToast] = useState("");
  const [storageHydrated, setStorageHydrated] = useState(false);

  async function refreshPositions() {
    const session = getStoredSession();
    if (!session?.walletAddress) return;
    const walletAddress = session.walletAddress;
    const chainPositions = await getUserProtectionPositionsOnChain({
      userAddress: walletAddress,
      walletAddress,
      network,
    });

    setData((current) => {
      const positions = mergeOnChainPositions(current.positions, chainPositions);
      const next = { ...current, positions };
      void syncAccountState(walletAddress, {
        profile,
        data: next,
        network,
      });
      return next;
    });
  }

  useEffect(() => {
    const session = getStoredSession();
    const walletAddress = session?.walletAddress ?? "";
    let cancelled = false;

    if (!walletAddress) {
      setStorageHydrated(true);
      return;
    }

    void readStoredAccount(walletAddress)
      .then((result) => {
        if (cancelled || !result) return;
        if (result.profile) {
          setProfile({ ...defaultProfile, ...result.profile });
        }
        if (result.data) {
          setData(normalizeAppData(result.data));
        }
        if (result.network && session?.loginMethod !== "email") {
          setNetworkState(result.network === "mainnet" ? "mainnet" : "testnet");
        }
      })
      .catch(() => {
        // Contract state remains available if private cache hydration fails.
      })
      .finally(() => {
        if (!cancelled) setStorageHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.walletAddress || !storageHydrated) return;

    void refreshPositions().catch(() => {
      // Keep the browser-local cache usable if RPC or contract hydration fails.
    });
  }, [network, storageHydrated]);

  function updateData(updater: (current: AppData) => AppData) {
    setData((current) => {
      const next = updater(current);
      const session = getStoredSession();
      if (session?.walletAddress) {
        void syncAccountState(session.walletAddress, {
          profile,
          data: next,
          network,
        });
      }
      return next;
    });
  }

  const value = useMemo<AppContextValue>(
    () => ({
      profile,
      data,
      network,
      toast,
      setNetwork: (nextNetwork) => {
        const session = getStoredSession();
        if (session?.loginMethod === "email" && session.network && session.network !== nextNetwork) {
          setToast(`Email wallet is locked to Stellar ${session.network}.`);
          return;
        }

        setNetworkState(nextNetwork);
        if (session?.walletAddress) {
          void syncAccountState(session.walletAddress, {
            profile,
            data,
            network: nextNetwork,
          });
        }
        setToast(
          nextNetwork === "testnet"
            ? "Switched to Stellar Testnet."
            : "Switched to Stellar Mainnet.",
        );
      },
      updateProfile: (nextProfile) => {
        setProfile(nextProfile);
        const session = getStoredSession();
        if (session?.walletAddress) {
          void syncAccountState(session.walletAddress, {
            profile: nextProfile,
            data,
            network,
          });
        }
        setToast("Profile updated.");
      },
      createPosition: (position) => {
        const startTime = new Date().toISOString();
        const record: ProtectionPosition = {
          ...position,
          id: position.contractPositionId
            ? `CHAIN-${position.contractPositionId}`
            : createId("POS"),
          startTime,
          status: "Active",
          claimableAmount: 0,
          principalWithdrawn: false,
        };

        updateData((current) => ({
          positions: [record, ...current.positions],
          activity: [
            {
              id: createId("ACT"),
              label: position.transactionHash
                ? "Contract Protection Position created."
                : "Protection Position created.",
              createdAt: nowLabel(),
            },
            ...current.activity,
          ],
        }));
        setToast(
          position.transactionHash
            ? "Contract position created."
            : "Protection Position created.",
        );
        window.location.hash = "app/positions";
      },
      refreshPositions,
      setToast,
    }),
    [data, network, profile, toast],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useDepositFree() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error("useDepositFree must be used inside AppProvider.");
  }

  return context;
}
