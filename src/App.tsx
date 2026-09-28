import { useEffect, useState } from 'react';
import Kiosk from './Kiosk';
import Admin from './Admin';

export default function App() {
  const [route, setRoute] = useState(location.hash);
  useEffect(() => {
    const on = () => setRoute(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route.startsWith('#/admin') ? <Admin /> : <Kiosk />;
}
