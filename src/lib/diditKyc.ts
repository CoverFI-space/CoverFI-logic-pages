import { getApiUrl } from "./api";

type StartUserKycInput = {
  walletAddress: string;
  backendSessionToken: string;
  payoutUsd: number;
  callbackUrl?: string;
  onComplete?: (result: unknown) => void;
};

async function readJsonResponse(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || data?.error?.message || `Request failed with ${response.status}.`);
  }
  return data;
}

export async function getUserKycStatus(input: Pick<StartUserKycInput, "walletAddress" | "backendSessionToken">) {
  const response = await fetch(getApiUrl("/api/onboarding/kyc/status"), {
    headers: {
      Authorization: `Bearer ${input.backendSessionToken}`,
      "X-CoverFi-Wallet-Address": input.walletAddress,
    },
  });
  return readJsonResponse(response) as Promise<{
    provider: "didit";
    configured: boolean;
    workflowId: string;
    thresholdUsd: number;
    status: string;
    verified: boolean;
    session: null | {
      id: string;
      status: string;
      normalizedStatus: string;
      verificationUrl: string;
      payoutUsd: string | number | null;
      createdAt: string;
      updatedAt: string;
    };
  }>;
}

export async function createUserKycSession(input: StartUserKycInput) {
  const response = await fetch(getApiUrl("/api/onboarding/kyc/session"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.backendSessionToken}`,
      "X-CoverFi-Wallet-Address": input.walletAddress,
    },
    body: JSON.stringify({
      payoutUsd: input.payoutUsd,
      callbackUrl: input.callbackUrl || window.location.href,
    }),
  });
  return readJsonResponse(response) as Promise<{
    url: string;
    sessionId: string;
    status: string;
    normalizedStatus: string;
    workflowId: string;
  }>;
}

export async function startUserKycVerification(input: StartUserKycInput) {
  const session = await createUserKycSession(input);
  const diditModule = await import("@didit-protocol/sdk-web") as {
    DiditSdk: {
      shared: {
        onComplete?: (result: unknown) => void;
        startVerification: (options: { url: string }) => void;
      };
    };
  };

  if (input.onComplete) {
    diditModule.DiditSdk.shared.onComplete = input.onComplete;
  }
  diditModule.DiditSdk.shared.startVerification({ url: session.url });
  return session;
}
