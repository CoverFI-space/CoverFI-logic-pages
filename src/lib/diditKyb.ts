import { getApiUrl } from "./api";

type StartPartnerKybInput = {
  partnerId: string;
  walletAddress: string;
  backendSessionToken: string;
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

export async function createPartnerKybSession(input: StartPartnerKybInput) {
  const response = await fetch(
    getApiUrl(`/api/partner-dashboard/${encodeURIComponent(input.partnerId)}/kyb/session`),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${input.backendSessionToken}`,
        "X-CoverFi-Wallet-Address": input.walletAddress,
      },
      body: JSON.stringify({
        callbackUrl: input.callbackUrl || window.location.href,
      }),
    },
  );
  return readJsonResponse(response) as Promise<{
    url: string;
    sessionId: string;
    status: string;
    normalizedStatus: string;
    workflowId: string;
  }>;
}

export async function startPartnerKybVerification(input: StartPartnerKybInput) {
  const session = await createPartnerKybSession(input);
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
