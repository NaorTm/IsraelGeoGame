import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../providers/AuthProvider';

function getProfileLabel(username: string | null | undefined, displayName: string | null | undefined) {
  if (username) {
    return `@${username}`;
  }

  if (displayName) {
    return displayName;
  }

  return 'חשבון';
}

export default function AppShell() {
  const auth = useAuth();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const topbarRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const shell = shellRef.current;
    const topbar = topbarRef.current;

    if (!shell || !topbar) {
      return;
    }

    const updateTopbarHeight = () => {
      shell.style.setProperty('--topbar-height', `${topbar.offsetHeight}px`);
    };

    updateTopbarHeight();

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => updateTopbarHeight())
      : null;

    resizeObserver?.observe(topbar);
    window.addEventListener('resize', updateTopbarHeight);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateTopbarHeight);
    };
  }, []);

  return (
    <div className="app-shell" dir="rtl" ref={shellRef}>
      <header className="topbar" ref={topbarRef}>
        <Link to="/" className="brand">
          <span className="brand-mark">IGG</span>
          <span>
            <strong>Israel Geo Game</strong>
            <small>אימון, שמירה ו־PvP</small>
          </span>
        </Link>

        <nav className="main-nav">
          <NavLink to="/" end className="nav-link">
            בית
          </NavLink>
          <NavLink to="/solo" className="nav-link">
            סולו
          </NavLink>
          <NavLink to="/pvp" className="nav-link">
            PvP
          </NavLink>
          <NavLink to="/profile" className="nav-link">
            פרופיל
          </NavLink>
        </nav>

        <div className="topbar-profile">
          {!auth.configured && <span className="status-chip warning">Supabase לא מוגדר</span>}
          {auth.isAuthenticated ? (
            <>
              <Link to="/profile" className="profile-chip" data-testid="profile-chip">
                {getProfileLabel(auth.profile?.username, auth.profile?.display_name)}
              </Link>
              <button className="ghost-btn" data-testid="logout-button" onClick={() => void auth.signOut()}>
                התנתקות
              </button>
            </>
          ) : (
            <Link to="/profile" className="primary-btn compact" data-testid="topbar-login-link">
              התחברות
            </Link>
          )}
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
