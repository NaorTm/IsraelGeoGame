import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthCard from '../components/app/AuthCard';
import { regions } from '../data/regions';
import { PVP_RULESET_VERSION } from '../lib/gameSession';
import { preloadSettlementCatalog } from '../lib/settlementCatalog';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import {
  cancelMatchmaking,
  fetchQueueState,
  queuePvpMatch,
} from '../services/supabaseApi';
import type { QueueState } from '../types';
import { preloadBoundaryCollectionsForDistrictIds } from '../utils/settlementBoundaries';

const FALLBACK_QUEUE_POLL_MS = 4000;
const SYNC_STALE_MS = 12000;

function formatQueueElapsed(createdAt?: string | null) {
  if (!createdAt) {
    return 'כרגע';
  }

  const elapsedMs = Date.now() - new Date(createdAt).getTime();
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}ש׳`;
  }

  return `${Math.floor(elapsedSeconds / 60)}ד׳ ${elapsedSeconds % 60}ש׳`;
}

function formatSyncElapsed(lastSyncAt?: number | null) {
  if (!lastSyncAt) {
    return 'כרגע';
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - lastSyncAt) / 1000));

  if (elapsedSeconds < 10) {
    return 'לפני רגע';
  }

  if (elapsedSeconds < 60) {
    return `לפני ${elapsedSeconds} שניות`;
  }

  return `לפני ${Math.floor(elapsedSeconds / 60)} דק'`;
}

function getQueueErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';

  if (message.includes('JWT') || message.toLowerCase().includes('expired')) {
    return 'פג תוקף ההתחברות. צריך להתחבר מחדש כדי להמשיך לחפש יריב.';
  }

  return message || 'רענון מצב התור נכשל זמנית.';
}

export default function PvpQueuePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [selectedDistrict, setSelectedDistrict] = useState(regions[0]?.id ?? '');
  const [queueState, setQueueState] = useState<QueueState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [loadingQueueState, setLoadingQueueState] = useState(true);
  const [queueRefreshError, setQueueRefreshError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const lastSyncAtRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void preloadSettlementCatalog({ districtIds: [selectedDistrict] }).catch(() => undefined);
    void preloadBoundaryCollectionsForDistrictIds([selectedDistrict]).catch(() => undefined);
  }, [selectedDistrict]);

  const refreshQueueState = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) {
      setLoadingQueueState(true);
    }

    const row = await fetchQueueState();
    setQueueState(row);
    setQueueRefreshError(null);
    const syncTimestamp = Date.now();
    lastSyncAtRef.current = syncTimestamp;
    setLastSyncAt(syncTimestamp);
    setLoadingQueueState(false);

    if (row?.status === 'matched' && row.matched_session_id) {
      navigate(`/match/${row.matched_session_id}`);
    }
  }, [navigate]);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.configured || !supabase) {
      setLoadingQueueState(false);
      return;
    }

    const client = supabase;
    let active = true;

    void refreshQueueState().catch((error) => {
      if (!active) {
        return;
      }

      setQueueRefreshError(getQueueErrorMessage(error));
      setLoadingQueueState(false);
    });

    const poller = window.setInterval(() => {
      if (
        lastSyncAtRef.current &&
        Date.now() - lastSyncAtRef.current < FALLBACK_QUEUE_POLL_MS - 500
      ) {
        return;
      }

      void refreshQueueState({ silent: true }).catch((error) => {
        if (!active) {
          return;
        }

        setQueueRefreshError(getQueueErrorMessage(error));
        setLoadingQueueState(false);
      });
    }, FALLBACK_QUEUE_POLL_MS);

    const channel = client
      .channel(`matchmaking:${auth.user?.id ?? 'guest'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matchmaking_queue',
          filter: `user_id=eq.${auth.user?.id}`,
        },
        (payload) => {
          const next = (payload.new ?? payload.old) as Record<string, unknown>;
          const nextState: QueueState = {
            id: String(next.id),
            district_id: String(next.district_id),
            ruleset_version: String(next.ruleset_version),
            status: String(next.status) as QueueState['status'],
            matched_session_id: next.matched_session_id
              ? String(next.matched_session_id)
              : null,
            created_at: String(next.created_at ?? ''),
          };

          setQueueState(nextState);
          setQueueRefreshError(null);
          const syncTimestamp = Date.now();
          lastSyncAtRef.current = syncTimestamp;
          setLastSyncAt(syncTimestamp);
          setLoadingQueueState(false);

          if (nextState.status === 'matched' && nextState.matched_session_id) {
            navigate(`/match/${nextState.matched_session_id}`);
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      window.clearInterval(poller);
      void client.removeChannel(channel);
    };
  }, [auth.configured, auth.isAuthenticated, auth.user?.id, navigate, refreshQueueState]);

  const selectedRegionName = useMemo(
    () => regions.find((region) => region.id === selectedDistrict)?.name_he ?? selectedDistrict,
    [selectedDistrict]
  );
  const syncLooksStale = lastSyncAt !== null && now - lastSyncAt > SYNC_STALE_MS;

  async function handleQueue() {
    try {
      setBusy(true);
      setMessage(null);
      const result = await queuePvpMatch(selectedDistrict);

      const nextState: QueueState | null = result.queue_id
        ? {
            id: result.queue_id,
            district_id: selectedDistrict,
            ruleset_version: PVP_RULESET_VERSION,
            status: result.status,
            matched_session_id: result.session_id,
            created_at: new Date().toISOString(),
          }
        : null;

      setQueueState(nextState);
      setQueueRefreshError(null);
      const syncTimestamp = Date.now();
      lastSyncAtRef.current = syncTimestamp;
      setLastSyncAt(syncTimestamp);

      if (result.status === 'matched' && result.session_id) {
        navigate(`/match/${result.session_id}`);
        return;
      }

      setMessage('נכנסת לתור. ברגע שיימצא יריב באותו מחוז תועבר ישירות ללובי.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'הכניסה לתור נכשלה.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    try {
      setBusy(true);
      setMessage(null);
      await cancelMatchmaking(queueState?.id);
      setQueueState(null);
      setQueueRefreshError(null);
      const syncTimestamp = Date.now();
      lastSyncAtRef.current = syncTimestamp;
      setLastSyncAt(syncTimestamp);
      setMessage('החיפוש בוטל.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ביטול החיפוש נכשל.');
    } finally {
      setBusy(false);
    }
  }

  if (!auth.isAuthenticated) {
    return (
      <section className="page-grid">
        <div className="surface-card">
          <h1>PvP דורש חשבון</h1>
          <p>
            דו־קרב רשמי שומר תוצאה, ניקוד, פספוסים וזמן. לכן הוא פתוח רק למשתמשים
            מחוברים.
          </p>
        </div>
        <AuthCard />
      </section>
    );
  }

  if (!auth.profile?.username) {
    return (
      <section className="page-grid">
        <div className="surface-card">
          <h1>לפני PvP צריך שם משתמש ציבורי</h1>
          <p>
            שם המשתמש מוצג ליריב ונשמר לצד התוצאה הרשמית, לכן הוא חובה לפני כניסה לתור.
          </p>
        </div>
        <AuthCard />
      </section>
    );
  }

  return (
    <section className="pvp-page page-grid">
      <div className="page-banner page-banner-inline">
        <div>
          <strong>מצב התור</strong>
          <span>
            {queueState?.status === 'searching'
              ? `מחפש יריב ב-${selectedRegionName}.`
              : 'Realtime מעדכן ראשון, ו-polling איטי יותר נשאר רק כגיבוי.'}
          </span>
        </div>
        <div className="banner-actions">
          {loadingQueueState ? (
            <div className="status-chip" data-testid="pvp-queue-loading">
              מרענן את מצב התור...
            </div>
          ) : queueRefreshError ? (
            <>
              <div
                className="status-chip warning"
                data-testid="pvp-queue-sync-warning"
              >
                יש עיכוב זמני בסנכרון
              </div>
              <button
                type="button"
                className="ghost-btn compact"
                data-testid="pvp-queue-retry"
                onClick={() => void refreshQueueState()}
              >
                נסה לרענן
              </button>
            </>
          ) : (
            <div className={`status-chip ${syncLooksStale ? 'warning' : ''}`}>
              {syncLooksStale ? 'ממתין לעדכון טרי מהשרת' : 'סנכרון תקין'}
            </div>
          )}
        </div>
      </div>

      <div className="surface-card pvp-card-polished">
        <span className="eyebrow">1v1 District Duel</span>
        <h1>דו־קרב PvP רשמי</h1>
        <p>
          שני שחקנים, אותו מחוז, אותו seed ואותן שאלות. ההכרעה נעשית בשרת לפי ניקוד,
          פספוסים וזמן סיום.
        </p>

        <div className="rules-grid">
          <div className="rule-box">
            <strong>10 סיבובים</strong>
            <span>סדר אחיד לשני הצדדים.</span>
          </div>
          <div className="rule-box">
            <strong>3 פספוסים מקסימום</strong>
            <span>אחרי שלושה פספוסים הסיבוב נסגר על 0.</span>
          </div>
          <div className="rule-box">
            <strong>אותו seed</strong>
            <span>השרת מייצר את סדר הסיבובים וההכרעה הרשמית.</span>
          </div>
        </div>

        <div className="queue-setup-grid">
          <div className="feature-tile">
            <strong>מחוז נבחר</strong>
            <span>{selectedRegionName}</span>
          </div>
          <div className="feature-tile">
            <strong>כללי v1</strong>
            <span>תצוגת התקדמות ליריב ותוצאת סיום רשמית.</span>
          </div>
        </div>

        <label className="field-label" htmlFor="pvp-district">
          בחר מחוז
        </label>
        <select
          id="pvp-district"
          className="text-input"
          data-testid="pvp-district-select"
          value={selectedDistrict}
          onChange={(event) => setSelectedDistrict(event.target.value)}
          disabled={busy || queueState?.status === 'searching'}
        >
          {regions.map((region) => (
            <option key={region.id} value={region.id}>
              {region.name_he}
            </option>
          ))}
        </select>

        <div className="queue-actions">
          {queueState?.status === 'searching' ? (
            <button
              className="secondary-btn"
              data-testid="pvp-cancel-button"
              disabled={busy}
              onClick={() => void handleCancel()}
            >
              לבטל חיפוש
            </button>
          ) : (
            <button
              className="primary-btn"
              data-testid="pvp-queue-button"
              disabled={busy}
              onClick={() => void handleQueue()}
            >
              להתחיל חיפוש
            </button>
          )}
        </div>

        {queueState?.status === 'searching' && (
          <div className="queue-box queue-box-searching" data-testid="pvp-queue-searching">
            <strong>מחפש יריב ב-{selectedRegionName}</strong>
            <span>
              זמן המתנה: {formatQueueElapsed(queueState.created_at ?? new Date(now).toISOString())}
            </span>
            <span>עדכון אחרון: {formatSyncElapsed(lastSyncAt)}</span>
            <span>
              אם אין התאמה בזמן סביר אפשר לבטל ולנסות מחוז אחר. המערכת מתעדכנת קודם כל
              דרך Realtime ומשתמשת ב-polling איטי יותר רק כגיבוי.
            </span>
          </div>
        )}

        {queueRefreshError && (
          <div className="queue-box queue-box-warning" data-testid="pvp-queue-recovery">
            <strong>יש עיכוב זמני בעדכון התור</strong>
            <span>{queueRefreshError}</span>
            <span>
              גם בזמן העיכוב החיפוש ממשיך ברקע. אפשר לרענן ידנית או להמתין לעדכון הבא.
            </span>
          </div>
        )}

        {message && (
          <p className="form-message" data-testid="pvp-queue-message">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
