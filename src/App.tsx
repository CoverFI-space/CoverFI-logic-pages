import { useEffect, useState } from 'react';
import { AppProvider } from './context/AppContext';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';

export default function App() {
  const [route, setRoute] = useState(() => window.location.hash.replace('#', ''));

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash.replace('#', ''));

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (route === 'dashboard' || route.startsWith('app/')) {
    return (
      <AppProvider>
        <DashboardPage route={route === 'dashboard' ? 'app/dashboard' : route} />
      </AppProvider>
    );
  }

  return <LoginPage />;
}
