import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type UserProfile = {
  fullName: string;
  contact: string;
  city: string;
  createdAt: string;
};

export type StellarNetwork = 'testnet' | 'mainnet';
export type PositionStatus = 'Active' | 'Triggered' | 'Expired' | 'Claimed';

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
  createPosition: (position: Omit<ProtectionPosition, 'id' | 'startTime' | 'status' | 'claimableAmount'>) => void;
  updatePositionPrice: (id: string, currentPrice: number) => void;
  claimPosition: (id: string) => void;
  setToast: (message: string) => void;
};

const PROFILE_KEY = 'depositfree_profile';
const DATA_KEY = 'depositfree_protection_data';
const NETWORK_KEY = 'depositfree_network';
const AppContext = createContext<AppContextValue | null>(null);

const defaultProfile: UserProfile = {
  fullName: '',
  contact: '',
  city: '',
  createdAt: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
};

const emptyData: AppData = {
  positions: [],
  activity: [],
};

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function nowLabel() {
  return new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function readProfile() {
  try {
    const stored = window.localStorage.getItem(PROFILE_KEY);
    return stored ? { ...defaultProfile, ...(JSON.parse(stored) as UserProfile) } : defaultProfile;
  } catch {
    return defaultProfile;
  }
}

function readData() {
  try {
    const stored = window.localStorage.getItem(DATA_KEY);
    return stored ? { ...emptyData, ...(JSON.parse(stored) as AppData) } : emptyData;
  } catch {
    return emptyData;
  }
}

function readNetwork(): StellarNetwork {
  return window.localStorage.getItem(NETWORK_KEY) === 'mainnet' ? 'mainnet' : 'testnet';
}

function persistData(data: AppData) {
  window.localStorage.setItem(DATA_KEY, JSON.stringify(data));
}

function calculateClaimable(protectedAmount: number, currentPrice: number) {
  const lossPercent = Math.max(0, 1 - currentPrice);
  return Number((protectedAmount * lossPercent).toFixed(2));
}

function nextStatus(position: ProtectionPosition, currentPrice: number): PositionStatus {
  if (position.status === 'Claimed') return 'Claimed';
  if (currentPrice <= position.triggerPrice) return 'Triggered';
  if (new Date(position.expiryTime).getTime() <= Date.now()) return 'Expired';
  return 'Active';
}

export function getAppHomeRoute() {
  return 'app/dashboard';
}

export function clearAppProfile() {
  window.localStorage.removeItem(PROFILE_KEY);
  window.localStorage.removeItem(DATA_KEY);
  window.localStorage.removeItem(NETWORK_KEY);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(() => readProfile());
  const [data, setData] = useState<AppData>(() => readData());
  const [network, setNetworkState] = useState<StellarNetwork>(() => readNetwork());
  const [toast, setToast] = useState('');

  function updateData(updater: (current: AppData) => AppData) {
    setData((current) => {
      const next = updater(current);
      persistData(next);
      return next;
    });
  }

  const value = useMemo<AppContextValue>(() => ({
    profile,
    data,
    network,
    toast,
    setNetwork: (nextNetwork) => {
      window.localStorage.setItem(NETWORK_KEY, nextNetwork);
      setNetworkState(nextNetwork);
      setToast(nextNetwork === 'testnet' ? 'Switched to Stellar Testnet.' : 'Switched to Stellar Mainnet.');
    },
    updateProfile: (nextProfile) => {
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
      setProfile(nextProfile);
      setToast('Profile updated.');
    },
    createPosition: (position) => {
      const startTime = new Date().toISOString();
      const record: ProtectionPosition = {
        ...position,
        id: createId('POS'),
        startTime,
        status: 'Active',
        claimableAmount: 0,
      };

      updateData((current) => ({
        positions: [record, ...current.positions],
        activity: [{ id: createId('ACT'), label: 'Protection Position created.', createdAt: nowLabel() }, ...current.activity],
      }));
      setToast('Protection Position created.');
      window.location.hash = 'app/positions';
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
            claimableAmount: status === 'Triggered' ? calculateClaimable(position.protectedAmount, currentPrice) : position.claimableAmount,
          };
        });
        return {
          ...current,
          positions,
          activity: [{ id: createId('ACT'), label: 'Current price updated.', createdAt: nowLabel() }, ...current.activity],
        };
      });
      setToast('Current price updated.');
    },
    claimPosition: (id) => {
      updateData((current) => ({
        positions: current.positions.map((position) => position.id === id ? { ...position, status: 'Claimed' } : position),
        activity: [{ id: createId('ACT'), label: 'Loss Payout claimed.', createdAt: nowLabel() }, ...current.activity],
      }));
      setToast('Loss Payout claimed.');
    },
    setToast,
  }), [data, network, profile, toast]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useDepositFree() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error('useDepositFree must be used inside AppProvider.');
  }

  return context;
}
