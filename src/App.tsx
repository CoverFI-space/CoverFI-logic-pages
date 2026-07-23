import { useEffect, useState } from "react";
import { AppProvider } from "./context/AppContext";
import DashboardPage from "./pages/DashboardPage";
import AssetFlowPage from "./pages/AssetFlowPage";
import ProtocolStatusPage from "./pages/ProtocolStatusPage";
import LoginPage from "./pages/LoginPage";
import NotFoundPage from "./pages/NotFoundPage";
import ReceiptPage from "./pages/ReceiptPage";
import TermsPage from "./pages/TermsPage";
import { PrivateStorageGate } from "./components/PrivateStorageGate";
import { playRouteEnterTransition } from "./lib/pageTransitions";
import { clearStoredSession, getStoredSession } from "./lib/usernameStore";
import { clearEmbeddedWalletSession } from "./lib/embeddedWallet";
import { lockPrivateStorage } from "./lib/encryptedStorage";

const validAppRoutes = new Set([
  "app/dashboard",
  "app/portfolio",
  "app/protect",
  "app/asset-flow",
  "app/protocol-status",
  "app/positions",
  "app/claims",
  "app/pay-username",
  "app/history",
  "app/ai-chat",
  "app/qr-service",
  "app/profile",
]);

function getRouteFromLocation(location: Location) {
  const redirectPath = new URLSearchParams(location.search).get("redirect");
  const candidatePath = redirectPath
    ? decodeURIComponent(redirectPath)
    : location.pathname;
  const pathname = candidatePath.replace(/^\/+/, "").replace(/\/$/, "");
  const hash = location.hash
    .replace(/^#/, "")
    .replace(/^\/+/, "")
    .replace(/\/$/, "");

  if (hash) {
    if (hash === "login") return "login";
    if (hash === "dashboard") return "app/dashboard";
    return hash.startsWith("app/") ? hash : hash;
  }

  if (!pathname || pathname === "") return "login";
  if (pathname === "login") return "login";
  if (pathname === "terms" || pathname === "privacy") return "terms";
  if (pathname === "receipt") return "receipt";
  if (pathname === "dashboard") return "app/dashboard";
  if (pathname.startsWith("app/")) return pathname;

  return pathname;
}

export default function App() {
  const [route, setRoute] = useState(() =>
    getRouteFromLocation(window.location),
  );

  useEffect(() => {
    const onLocationChange = () =>
      setRoute(getRouteFromLocation(window.location));

    const redirectPath = new URLSearchParams(window.location.search).get(
      "redirect",
    );
    if (redirectPath) {
      const nextPath = decodeURIComponent(redirectPath);
      const normalizedPath = nextPath.startsWith("/")
        ? nextPath
        : `/${nextPath}`;
      window.history.replaceState({}, "", normalizedPath);
      setRoute(getRouteFromLocation(window.location));
    }

    window.addEventListener("popstate", onLocationChange);
    window.addEventListener("hashchange", onLocationChange);
    return () => {
      window.removeEventListener("popstate", onLocationChange);
      window.removeEventListener("hashchange", onLocationChange);
    };
  }, []);

  useEffect(() => {
    void playRouteEnterTransition();
  }, [route]);

  if (route === "login") {
    return <LoginPage />;
  }

  if (route === "terms" || route === "privacy") {
    return <TermsPage />;
  }

  if (route === "receipt") {
    return (
      <PrivateStorageGate>
        <ReceiptPage />
      </PrivateStorageGate>
    );
  }

  if (route.startsWith("app/") && !validAppRoutes.has(route)) {
    return <NotFoundPage />;
  }

  if (route === "dashboard" || validAppRoutes.has(route)) {
    return (
      <PrivateStorageGate>
        <AppProvider>
          {route === "app/asset-flow" ? (
            <AssetFlowPageBridge />
          ) : route === "app/protocol-status" ? (
            <ProtocolStatusPageBridge />
          ) : (
            <DashboardPage route={route === "dashboard" ? "app/dashboard" : route} />
          )}
        </AppProvider>
      </PrivateStorageGate>
    );
  }

  return <NotFoundPage />;
}

function AssetFlowPageBridge() {
  const [session] = useState(() => getStoredSession());
  if (!session) return <DashboardPage route="app/dashboard" />;
  return <AssetFlowPage username={session.username} walletAddress={session.walletAddress} onLogout={() => {
    lockPrivateStorage();
    clearEmbeddedWalletSession();
    clearStoredSession();
    window.history.replaceState({}, "", "/login");
    window.dispatchEvent(new Event("popstate"));
  }} />;
}

function ProtocolStatusPageBridge() {
  const [session] = useState(() => getStoredSession());
  if (!session) return <DashboardPage route="app/dashboard" />;
  return <ProtocolStatusPage username={session.username} walletAddress={session.walletAddress} onLogout={() => {
    lockPrivateStorage();
    clearEmbeddedWalletSession();
    clearStoredSession();
    window.history.replaceState({}, "", "/login");
    window.dispatchEvent(new Event("popstate"));
  }} />;
}
