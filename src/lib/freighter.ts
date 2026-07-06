import { getAddress, isConnected, requestAccess } from '@stellar/freighter-api';

type FreighterResult<T> = T & {
  error?: {
    message?: string;
  };
};

function assertFreighterResponse<T>(response: FreighterResult<T>, fallbackMessage: string): T {
  if (response.error) {
    throw new Error(response.error.message || fallbackMessage);
  }

  return response;
}

export async function connectFreighterWallet() {
  const connection = assertFreighterResponse(await isConnected(), 'Freighter is not available.');

  if (!connection.isConnected) {
    throw new Error('Please install or unlock the Freighter wallet extension.');
  }

  const access = assertFreighterResponse(await requestAccess(), 'Freighter connection was rejected.');

  if (access.address) {
    return access.address;
  }

  const existingAddress = assertFreighterResponse(await getAddress(), 'Could not read your Freighter address.');
  return existingAddress.address;
}
