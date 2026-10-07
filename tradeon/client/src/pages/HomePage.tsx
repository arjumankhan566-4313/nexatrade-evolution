import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { socket } from '../lib/socket';
import { useAuthStore } from '../stores/authStore';
import { useConnectionStore } from '../stores/connectionStore';
import '../styles/home.css';

// Module status panel: proves the REST endpoint, the Socket.io realtime pipe
// and the Auth session are wired end to end. Replaced page by page as
// modules land.
export default function HomePage() {
  const { socketStatus, apiHealth, lastTick, setSocketStatus, setApiHealth, setLastTick } =
    useConnectionStore();
  const { user, status, logout } = useAuthStore();

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((body) => setApiHealth(JSON.stringify(body)))
      .catch(() => setApiHealth('unreachable'));

    setSocketStatus('connecting');
    socket.on('connect', () => setSocketStatus('connected'));
    socket.on('disconnect', () => setSocketStatus('disconnected'));
    socket.on('tick:demo', (tick: { seq: number; symbol: string; price: number }) =>
      setLastTick(tick)
    );
    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('tick:demo');
    };
  }, [setApiHealth, setLastTick, setSocketStatus]);

  return (
    <main className="home">
      <h1>
        TRADEON <span>V2</span>
      </h1>
      <p className="subtitle">
        Module 1 — skeleton · Module 2 — auth · <Link to="/chart">Module 3 — canvas chart</Link>
      </p>

      <section className="panel">
        <div className="row">
          <span>Auth session</span>
          <code>
            {status === 'loading'
              ? 'loading…'
              : user
                ? `${user.fullName} (${user.email}) · ${user.role} · demo $${user.balanceDemo.toLocaleString()}`
                : 'guest · '}
            {!user && status !== 'loading' && (
              <span>
                <Link to="/login">sign in</Link> · <Link to="/register">register</Link>
              </span>
            )}
          </code>
        </div>
        {user && (
          <div className="row">
            <span />
            <button type="button" className="link-btn" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        )}
        <div className="row">
          <span>REST /api/health</span>
          <code>{apiHealth ?? 'loading…'}</code>
        </div>
        <div className="row">
          <span>Socket.io status</span>
          <code data-status={socketStatus}>{socketStatus}</code>
        </div>
        <div className="row">
          <span>Last pushed tick</span>
          <code>
            {lastTick
              ? `${lastTick.symbol} @ ${lastTick.price.toFixed(2)} · seq ${lastTick.seq}`
              : 'waiting…'}
            </code>
        </div>
      </section>
    </main>
  );
}
