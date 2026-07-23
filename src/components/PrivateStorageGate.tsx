import type { ReactNode } from "react";

// Private browser records are an optional convenience layer. They must never
// prevent access to the app or require an extra wallet signature.
export function PrivateStorageGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
