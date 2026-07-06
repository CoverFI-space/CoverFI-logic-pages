import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getApiUrl } from "../lib/api";
import { getStoredSession } from "../lib/usernameStore";

export type UserProfile = {
  fullName: string;
  contact: string;
  city: string;
  createdAt: string;
};

export type StellarNetwork = "testnet" | "mainnet";
export type PositionStatus = "Active" | "Triggered" | "Expired" | "Claimed";

export type ProtectionPosition = {
  id: string;
  asset: string;
  protectedAmount: number;
  feePaid: number;
  triggerPrice: number;
  currentPrice: number;
  startTime: string;
  expiryTime: string;
  status: PositionStatus;
  claimableAmount: number;
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
  updatePositionPrice: (id: string, currentPrice: number) => void;
  claimPosition: (id: string) => void;
  revokePosition: (id: string) => void;
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

async function syncAccountToBackend(
  walletAddress: string,
  payload: { profile: UserProfile; data: AppData; network: StellarNetwork },
) {
  if (!walletAddress) return;

  try {
    await fetch(
      getApiUrl(`/api/account/${encodeURIComponent(walletAddress)}`),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
  } catch {
    // Ignore sync failures so the UI remains usable.
  }
}

function calculateClaimable(protectedAmount: number, currentPrice: number) {
  const lossPercent = Math.max(0, 1 - currentPrice);
  return Number((protectedAmount * lossPercent).toFixed(2));
}

function nextStatus(
  position: ProtectionPosition,
  currentPrice: number,
): PositionStatus {
  if (position.status === "Claimed") return "Claimed";
  if (currentPrice <= position.triggerPrice) return "Triggered";
  if (new Date(position.expiryTime).getTime() <= Date.now()) return "Expired";
  return "Active";
}

export function getAppHomeRoute() {
  return "app/dashboard";
}

export function clearAppProfile() {
  // Account state is now persisted server-side.
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [data, setData] = useState<AppData>(emptyData);
  const [network, setNetworkState] = useState<StellarNetwork>("testnet");
  const [toast, setToast] = useState("");

  useEffect(() => {
    const session = getStoredSession();
    const walletAddress = session?.walletAddress ?? "";
    if (!walletAddress) return;

    let ignore = false;

    async function loadAccount() {
      try {
        const response = await fetch(
          getApiUrl(`/api/account/${encodeURIComponent(walletAddress)}`),
        );
        const result = await response.json().catch(() => null);

        if (ignore || !response.ok) return;

        if (result?.profile) {
          setProfile({ ...defaultProfile, ...result.profile });
        }

        if (result?.data) {
          setData({ ...emptyData, ...result.data });
        }

        if (result?.network) {
          setNetworkState(result.network === "mainnet" ? "mainnet" : "testnet");
        }
      } catch {
        // Ignore load failures and keep defaults.
      }
    }

    void loadAccount();

    return () => {
      ignore = true;
    };
  }, []);

  function updateData(updater: (current: AppData) => AppData) {
    setData((current) => {
      const next = updater(current);
      const session = getStoredSession();
      if (session?.walletAddress) {
        void syncAccountToBackend(session.walletAddress, {
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
        setNetworkState(nextNetwork);
        const session = getStoredSession();
        if (session?.walletAddress) {
          void syncAccountToBackend(session.walletAddress, {
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
          void syncAccountToBackend(session.walletAddress, {
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
      updatePositionPrice: (id, currentPrice) => {
        updateData((current) => {
          const positions = current.positions.map((position) => {
            if (position.id !== id) return position;
            const status = nextStatus(position, currentPrice);
            return {
              ...position,
              currentPrice,
              status,
              claimableAmount:
                status === "Triggered"
                  ? calculateClaimable(position.protectedAmount, currentPrice)
                  : position.claimableAmount,
            };
          });
          return {
            ...current,
            positions,
            activity: [
              {
                id: createId("ACT"),
                label: "Current price updated.",
                createdAt: nowLabel(),
              },
              ...current.activity,
            ],
          };
        });
        setToast("Current price updated.");
      },
      claimPosition: (id) => {
        updateData((current) => ({
          positions: current.positions.map((position) =>
            position.id === id ? { ...position, status: "Claimed" } : position,
          ),
          activity: [
            {
              id: createId("ACT"),
              label: "Loss Payout claimed.",
              createdAt: nowLabel(),
            },
            ...current.activity,
          ],
        }));
        setToast("Loss Payout claimed.");
      },
      revokePosition: (id) => {
        updateData((current) => ({
          positions: current.positions.filter((position) => position.id !== id),
          activity: [
            {
              id: createId("ACT"),
              label: "Protection revoked by user.",
              createdAt: nowLabel(),
            },
            ...current.activity,
          ],
        }));
        setToast("Protection revoked. Fees paid are non-refundable.");
      },
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
