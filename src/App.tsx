import { useEffect, useState } from "react";
import { AppProvider } from "./context/AppContext";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import NotFoundPage from "./pages/NotFoundPage";

function getRouteFromLocation(location: Location) {
  const pathname = location.pathname.replace(/^\/+/, "").replace(/\/$/, "");
  const hash = location.hash
    .replace(/^#/, "")
    .replace(/^\/+/, "")
    .replace(/\/$/, "");

  if (hash) {
    if (hash === "login") return "login";
    if (hash === "dashboard") return "app/dashboard";
    return hash.startsWith("app/") ? hash : hash;
  }

  if (!pathname || pathname === "/") return "login";
  if (pathname === "login") return "login";
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

    window.addEventListener("popstate", onLocationChange);
    window.addEventListener("hashchange", onLocationChange);
    return () => {
      window.removeEventListener("popstate", onLocationChange);
      window.removeEventListener("hashchange", onLocationChange);
    };
  }, []);

  if (route === "login") {
    return <LoginPage />;
  }

  if (route === "dashboard" || route.startsWith("app/")) {
    return (
      <AppProvider>
        <DashboardPage
          route={route === "dashboard" ? "app/dashboard" : route}
        />
      </AppProvider>
    );
  }

  return <NotFoundPage />;
}
