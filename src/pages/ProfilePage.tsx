import { useEffect, useMemo, useState, type FormEvent } from 'react';
import AuthCard from '../components/app/AuthCard';
import { getDistrictDisplayName, isValidUsername, normalizeUsername } from '../lib/gameSession';
import { useAuth } from '../providers/AuthProvider';
import { fetchProgress } from '../services/supabaseApi';
import type { DistrictProgress } from '../types';

export default function ProfilePage() {
  const auth = useAuth();
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<DistrictProgress[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setUsername(auth.profile?.username ?? '');
  }, [auth.profile?.username]);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.configured) {
      setProgress([]);
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

  const totals = useMemo(
    () =>
      progress.reduce(
        (acc, item) => ({
          games: acc.games + item.games_played,
          bestScore: Math.max(acc.bestScore, item.best_score),
          bestAccuracy: Math.max(acc.bestAccuracy, Math.round(item.accuracy_pct)),
        }),
        { games: 0, bestScore: 0, bestAccuracy: 0 }
      ),
    [progress]
  );

  async function handleClaimUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeUsername(username);

    if (!isValidUsername(normalized)) {
      setMessage('שם המשתמש חייב להיות 3-20 תווים עם אותיות אנגליות, מספרים או קו תחתון.');
      return;
    }

    try {
      setSaving(true);
      setMessage(null);
      await auth.claimUsername(normalized);
      setUsername(normalized);
      setMessage('שם המשתמש נשמר.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'שמירת השם נכשלה.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="profile-page page-grid">
      <AuthCard />

      {auth.isAuthenticated && (
        <>
          <div className="surface-card profile-card">
            <span className="eyebrow">Profile</span>
            <h2>החשבון שלך</h2>

            <div className="profile-identity">
              <div className="profile-avatar">
                {auth.profile?.username?.slice(0, 2).toUpperCase() ??
                  auth.profile?.display_name?.slice(0, 1) ??
                  'IG'}
              </div>
              <div>
                <strong className="profile-name">
                  {auth.profile?.display_name || auth.user?.email || 'חשבון מחובר'}
                </strong>
                <p className="profile-subtitle">{auth.profile?.email ?? auth.user?.email ?? '—'}</p>
              </div>
            </div>

            <div className="profile-summary-grid">
              <div className="feature-tile">
                <strong>{totals.games}</strong>
                <span>משחקים שנשמרו</span>
              </div>
              <div className="feature-tile">
                <strong>{totals.bestScore}</strong>
                <span>שיא כללי</span>
              </div>
              <div className="feature-tile">
                <strong>{totals.bestAccuracy}%</strong>
                <span>דיוק שיא</span>
              </div>
            </div>

            <form
              className="username-form"
              data-testid="username-form"
              onSubmit={(event) => void handleClaimUsername(event)}
            >
              <label className="field-label" htmlFor="username">
                שם משתמש ציבורי
              </label>
              <input
                id="username"
                className="text-input"
                data-testid="username-input"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="naor_geo"
                disabled={saving}
              />
              <p className="field-help">זה השם שיופיע ב-PvP, בתוצאות רשמיות ובהמשך גם בדירוגים.</p>
              <button
                className="primary-btn"
                data-testid="username-submit"
                type="submit"
                disabled={saving}
              >
                שמירת שם משתמש
              </button>
              {message && (
                <p className="form-message" data-testid="username-message">
                  {message}
                </p>
              )}
            </form>
          </div>

          <div className="surface-card progress-card-polished" data-testid="progress-card">
            <span className="eyebrow">Cloud Progress</span>
            <h2>התקדמות לפי מחוז</h2>
            {progress.length === 0 ? (
              <p>עדיין לא נשמרו מחוזות. משחק סולו ראשון ישמור כאן שיאים ודיוק.</p>
            ) : (
              <div className="progress-list">
                {progress.map((item) => (
                  <div
                    key={item.district_id}
                    className="progress-row progress-row-polished"
                    data-testid={`progress-row-${item.district_id}`}
                  >
                    <div>
                      <strong>{getDistrictDisplayName(item.district_id)}</strong>
                      <span className="progress-meta">
                        {item.games_played} משחקים · דיוק {Math.round(item.accuracy_pct)}%
                      </span>
                    </div>
                    <div className="progress-values">
                      <span>שיא {item.best_score}</span>
                      <span>רצף {item.best_streak}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
