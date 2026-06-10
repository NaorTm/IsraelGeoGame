import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AuthCard from '../components/app/AuthCard';
import {
  APPROXIMATE_SETTLEMENT_COUNT,
  PLAYABLE_SETTLEMENT_COUNT,
  SOURCE_BACKED_SETTLEMENT_COUNT,
} from '../lib/catalog';
import { getDistrictDisplayName, getProgressHeadline } from '../lib/gameSession';
import { useAuth } from '../providers/AuthProvider';
import { fetchProgress } from '../services/supabaseApi';
import type { DistrictProgress } from '../types';

export default function HomePage() {
  const auth = useAuth();
  const [progress, setProgress] = useState<DistrictProgress[]>([]);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.configured) {
      return;
    }

    let active = true;

    void fetchProgress().then((rows) => {
      if (active) {
        setProgress(rows);
      }
    });

    return () => {
      active = false;
    };
  }, [auth.configured, auth.isAuthenticated]);

  const featuredProgress = progress[0] ?? null;
  const totalGamesPlayed = useMemo(
    () => progress.reduce((sum, entry) => sum + entry.games_played, 0),
    [progress]
  );
  const accountTitle = auth.isAuthenticated
    ? auth.profile?.username
      ? `@${auth.profile.username}`
      : 'חשבון מחובר'
    : 'משחק אורח';

  return (
    <section className="home-page home-lobby-page">
      <div className="home-lobby-grid">
        <div className="surface-card home-command-card">
          <div className="home-command-top">
            <div>
              <span className="eyebrow">Game Lobby</span>
              <h1>Israel Geo Game</h1>
            </div>
            <div className="home-live-chip">מוכן למשחק</div>
          </div>

          <p className="home-command-subtitle">
            לובי קצר וברור: בוחרים מצב, נכנסים למפה, ומשחקים בלי מסך פתיחה כבד.
          </p>

          <div className="home-launch-row">
            <Link to="/solo" className="primary-btn home-launch-btn">
              התחלת סולו
            </Link>
            <Link to="/pvp" className="secondary-btn home-launch-btn">
              דו קרב PvP
            </Link>
            <Link to="/profile" className="ghost-btn home-launch-btn">
              פרופיל וסטטיסטיקה
            </Link>
          </div>

          <div className="home-mode-grid">
            <Link to="/solo" className="home-mode-card home-mode-card-solo">
              <strong>סולו</strong>
              <span>Rounds, endless, time attack, survival, mastery.</span>
            </Link>
            <Link to="/pvp" className="home-mode-card home-mode-card-pvp">
              <strong>PvP</strong>
              <span>אותו seed, אותו סדר שאלות, הכרעה שרתית.</span>
            </Link>
            <Link to="/profile" className="home-mode-card home-mode-card-profile">
              <strong>החשבון שלך</strong>
              <span>שיאים, דיוק, היסטוריה ופרופיל ציבורי.</span>
            </Link>
          </div>

          <div className="home-stat-strip">
            <div className="home-stat-pill">
              <strong>{PLAYABLE_SETTLEMENT_COUNT}</strong>
              <span>יישובים פעילים</span>
            </div>
            <div className="home-stat-pill">
              <strong>{SOURCE_BACKED_SETTLEMENT_COUNT}</strong>
              <span>פוליגונים מלאים</span>
            </div>
            <div className="home-stat-pill">
              <strong>{APPROXIMATE_SETTLEMENT_COUNT}</strong>
              <span>אזורים מקורבים</span>
            </div>
          </div>

          {featuredProgress && (
            <div className="home-active-progress">
              <strong>{getDistrictDisplayName(featuredProgress.district_id)}</strong>
              <span>{getProgressHeadline(featuredProgress)}</span>
            </div>
          )}
        </div>

        <div className="home-side-stack">
          <AuthCard />

          <div className="surface-card home-account-card">
            <div className="home-account-head">
              <div>
                <span className="eyebrow">Status</span>
                <h2>{accountTitle}</h2>
              </div>
              <div className={`status-chip ${auth.isAuthenticated ? '' : 'warning'}`}>
                {auth.isAuthenticated ? 'ענן פעיל' : 'אורח'}
              </div>
            </div>

            {!auth.isAuthenticated && (
              <p className="home-account-copy">
                אפשר להתחיל מיד כאורח. התחברות פותחת שמירה בענן, PvP, היסטוריה ופרופיל ציבורי.
              </p>
            )}

            {auth.isAuthenticated && (
              <div className="home-account-stats">
                <div className="home-mini-stat">
                  <strong>{totalGamesPlayed}</strong>
                  <span>משחקי סולו</span>
                </div>
                <div className="home-mini-stat">
                  <strong>{progress.length}</strong>
                  <span>מחוזות עם שמירה</span>
                </div>
              </div>
            )}

            <div className="home-session-note">
              {auth.isAuthenticated
                ? auth.user?.email ?? auth.profile?.email ?? 'החשבון מחובר'
                : 'אפשר להתחבר מהכרטיס שמעל.'}
            </div>
          </div>
        </div>
      </div>

      <div className="home-compact-grid">
        <div className="surface-card home-compact-card">
          <div className="home-card-header">
            <h2>מה יש במשחק</h2>
            <span className="home-card-kicker">Core Loop</span>
          </div>
          <div className="home-compact-features">
            <div className="home-compact-tile">
              <strong>בחירת מצב</strong>
              <span>סולו מהיר, ריצה ארוכה או PvP תחרותי.</span>
            </div>
            <div className="home-compact-tile">
              <strong>זיהוי על מפה</strong>
              <span>בלי שמות על hover ובלי רמזים מיותרים.</span>
            </div>
            <div className="home-compact-tile">
              <strong>שמירה אמיתית</strong>
              <span>התקדמות נשמרת לחשבון ונשארת בין סשנים.</span>
            </div>
            <div className="home-compact-tile">
              <strong>דו־קרב רשמי</strong>
              <span>אותם סיבובים לשני הצדדים והכרעה שרתית.</span>
            </div>
          </div>
        </div>

        <div className="surface-card home-compact-card">
          <div className="home-card-header">
            <h2>מסלול מהיר</h2>
            <span className="home-card-kicker">Quick Start</span>
          </div>
          <div className="home-quick-list">
            <Link to="/solo" className="home-quick-row">
              <strong>סולו קצר</strong>
              <span>5 סיבובים כדי להתחמם ולבדוק את המפה.</span>
            </Link>
            <Link to="/solo" className="home-quick-row">
              <strong>מרוץ זמן</strong>
              <span>כניסה מהירה למצב תחרותי נגד השעון.</span>
            </Link>
            <Link to="/pvp" className="home-quick-row">
              <strong>תור ל-PvP</strong>
              <span>להיכנס ל-matchmaking מול שחקן נוסף.</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
