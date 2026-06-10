import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  formatDuration,
  getDistrictDisplayName,
  getParticipantLabel,
} from '../lib/gameSession';
import {
  loadSettlementCatalog,
  preloadSettlementCatalog,
} from '../lib/settlementCatalog';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import {
  fetchActiveMatch,
  setMatchReady,
  submitPvpGuess,
} from '../services/supabaseApi';
import type { ActiveMatch, MapViewport, Settlement } from '../types';
import { preloadBoundaryCollectionsForDistrictIds } from '../utils/settlementBoundaries';
import { getSettlementDistrictId } from '../utils/districts';

const GameMap = lazy(() => import('../components/GameMap'));

const DEFAULT_MAP_VIEWPORT: MapViewport = {
  center: [31.5, 35.0],
  zoom: 7,
};

const FALLBACK_MATCH_POLL_MS = 4000;
const SYNC_STALE_MS = 12000;

function isPresenceStale(timestamp?: string | null, now = Date.now()) {
  if (!timestamp) {
    return true;
  }

  return now - new Date(timestamp).getTime() > 30000;
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

function getMatchErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : '';

  if (
    message.includes('PGRST116') ||
    message.toLowerCase().includes('0 rows') ||
    message.includes('JSON object requested')
  ) {
    return 'המשחק הזה כבר לא זמין או שכבר הושלם. אפשר לחזור למסך PvP ולהתחיל חיפוש חדש.';
  }

  if (message.includes('JWT') || message.toLowerCase().includes('expired')) {
    return 'פג תוקף ההתחברות. צריך להתחבר מחדש כדי להמשיך למשחק הרשמי.';
  }

  return message || fallback;
}

function MatchMapFallback({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div
      className="surface-card loading-panel loading-panel-compact"
      data-testid="pvp-map-loading"
    >
      <strong>
        {loading ? 'מכין את מפת הדו־קרב...' : 'המפה עדיין לא מוכנה להצגה'}
      </strong>
      <span>
        {error
          ? error
          : 'טוען ישובים, גבולות מדויקים ונתוני המחוז כדי שהסיבוב יתחיל בלי קפיצות מיותרות.'}
      </span>
      {error && onRetry && (
        <button
          type="button"
          className="ghost-btn compact"
          data-testid="pvp-map-retry"
          onClick={onRetry}
        >
          נסה לטעון שוב
        </button>
      )}
    </div>
  );
}

export default function PvpMatchPage() {
  const { matchId = '' } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const [match, setMatch] = useState<ActiveMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [wrongGuessIds, setWrongGuessIds] = useState<string[]>([]);
  const [mapViewport, setMapViewport] = useState<MapViewport>(DEFAULT_MAP_VIEWPORT);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const lastSyncAtRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!match?.district_id || match.status === 'completed') {
      return;
    }

    void preloadSettlementCatalog({ districtIds: [match.district_id] }).catch(() => undefined);
    void preloadBoundaryCollectionsForDistrictIds([match.district_id]).catch(() => undefined);
  }, [match?.district_id, match?.status]);

  useEffect(() => {
    if (match?.status !== 'active') {
      setCatalogLoading(false);
      setMapLoadError(null);
      return;
    }

    let active = true;
    setCatalogLoading(true);
    setMapLoadError(null);

    void loadSettlementCatalog({
      districtIds: [match.district_id],
    })
      .then((catalog) => {
        if (!active) {
          return;
        }

        setSettlements(catalog.settlements);
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setMapLoadError(
          getMatchErrorMessage(error, 'טעינת מפת המשחק נכשלה. אפשר לנסות שוב.')
        );
      })
      .finally(() => {
        if (active) {
          setCatalogLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [match?.district_id, match?.status]);

  const refreshMatch = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!matchId) {
      return;
    }

    if (!options.silent) {
      setLoading(true);
    }

    try {
      const nextMatch = await fetchActiveMatch(matchId);
      setMatch(nextMatch);
      setLoadError(null);
      setSyncError(null);
      const syncTimestamp = Date.now();
      lastSyncAtRef.current = syncTimestamp;
      setLastSyncAt(syncTimestamp);
    } catch (error) {
      const friendlyMessage = getMatchErrorMessage(
        error,
        'טעינת המשחק נכשלה. אפשר לנסות שוב.'
      );

      if (options.silent) {
        setSyncError(friendlyMessage);
      } else {
        setLoadError(friendlyMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    if (!matchId || !auth.isAuthenticated || !auth.configured) {
      setLoading(false);
      return;
    }

    const client = supabase;
    let active = true;

    void refreshMatch().catch(() => undefined);

    const poller = window.setInterval(() => {
      if (
        lastSyncAtRef.current &&
        Date.now() - lastSyncAtRef.current < FALLBACK_MATCH_POLL_MS - 500
      ) {
        return;
      }

      void refreshMatch({ silent: true }).catch(() => undefined);
    }, FALLBACK_MATCH_POLL_MS);

    if (!client) {
      return () => {
        active = false;
        window.clearInterval(poller);
      };
    }

    const channel = client
      .channel(`match:${matchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${matchId}`,
        },
        () => {
          if (active) {
            void refreshMatch({ silent: true }).catch(() => undefined);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'session_players',
          filter: `session_id=eq.${matchId}`,
        },
        () => {
          if (active) {
            void refreshMatch({ silent: true }).catch(() => undefined);
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      window.clearInterval(poller);
      void client.removeChannel(channel);
    };
  }, [auth.configured, auth.isAuthenticated, matchId, refreshMatch]);

  const me = useMemo(
    () =>
      match?.participants.find((participant) => participant.user_id === auth.user?.id) ?? null,
    [auth.user?.id, match?.participants]
  );

  const opponent = useMemo(
    () =>
      match?.participants.find((participant) => participant.user_id !== auth.user?.id) ?? null,
    [auth.user?.id, match?.participants]
  );

  const districtSettlements = useMemo(
    () =>
      settlements.filter(
        (settlement) => getSettlementDistrictId(settlement) === match?.district_id
      ),
    [match?.district_id, settlements]
  );

  const currentRound = me?.current_round_number ?? 1;
  const currentRoundDefinition = match?.rounds.find(
    (round) => round.round_number === currentRound
  );
  const currentSettlement = districtSettlements.find(
    (settlement) => settlement.id === currentRoundDefinition?.settlement_id
  );
  const opponentPresenceStale = isPresenceStale(opponent?.last_seen_at, now);
  const syncLooksStale = lastSyncAt !== null && now - lastSyncAt > SYNC_STALE_MS;
  const finished =
    Boolean(me?.finished_at) ||
    (settlements.length > 0 && currentSettlement === undefined);

  useEffect(() => {
    setWrongGuessIds([]);
  }, [currentRoundDefinition?.round_number]);

  async function handleReady() {
    if (!matchId) {
      return;
    }

    try {
      setBusy(true);
      setMessage(null);
      await setMatchReady(matchId);
      await refreshMatch({ silent: true });
    } catch (error) {
      setMessage(
        getMatchErrorMessage(error, 'השרת לא אישר את הכניסה למשחק.')
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleGuess(settlementId: string) {
    if (!match || !me || !currentRoundDefinition || busy) {
      return;
    }

    if (wrongGuessIds.includes(settlementId)) {
      return;
    }

    try {
      setBusy(true);
      setMessage(null);
      const result = await submitPvpGuess(
        match.id,
        currentRoundDefinition.round_number,
        settlementId
      );

      if (!result?.round_complete) {
        setWrongGuessIds((previous) => [...previous, settlementId]);
        setMessage('נרשם פספוס. אפשר להמשיך לנסות באותו סיבוב.');
        return;
      }

      if (result?.is_correct) {
        setMessage('פגיעה נכונה. טוען את הסיבוב הבא.');
      } else {
        setMessage('אחרי 3 פספוסים הסיבוב נסגר עם 0 נקודות.');
      }

      setWrongGuessIds([]);
      await refreshMatch({ silent: true });
    } catch (error) {
      setMessage(
        getMatchErrorMessage(error, 'שליחת הניחוש נכשלה.')
      );
    } finally {
      setBusy(false);
    }
  }

  if (!auth.isAuthenticated) {
    return (
      <section className="surface-card">
        <h1>כדי להיכנס למשחק צריך להיות מחובר.</h1>
      </section>
    );
  }

  if (loading && !match) {
    return (
      <section className="surface-card loading-panel" data-testid="pvp-match-loading">
        <strong>טוען את הדו־קרב...</strong>
        <span>טוען את מצב המשחק, היריב, זמני הסנכרון והסיבוב הנוכחי.</span>
      </section>
    );
  }

  if (loadError && !match) {
    return (
      <section className="surface-card ready-card ready-card-polished">
        <span className="eyebrow">Match Recovery</span>
        <h1>לא הצלחנו לטעון את הדו־קרב</h1>
        <p>{loadError}</p>
        <div className="hero-actions">
          <button
            type="button"
            className="primary-btn"
            data-testid="pvp-match-retry"
            onClick={() => void refreshMatch()}
          >
            לנסות שוב
          </button>
          <Link to="/pvp" className="secondary-btn">
            חזרה ל-PvP
          </Link>
        </div>
      </section>
    );
  }

  if (!match || !me) {
    return (
      <section className="surface-card ready-card ready-card-polished">
        <span className="eyebrow">Match Recovery</span>
        <h1>לא נמצא משחק פעיל</h1>
        <p>ייתכן שהמשחק הושלם או שהעמוד נפתח בלי הרשאת גישה תקפה.</p>
        <div className="hero-actions">
          <button
            type="button"
            className="primary-btn"
            data-testid="pvp-match-retry"
            onClick={() => void refreshMatch()}
          >
            רענון ידני
          </button>
          <Link to="/pvp" className="secondary-btn">
            חזרה ל-PvP
          </Link>
        </div>
      </section>
    );
  }

  if (match.status === 'completed') {
    return (
      <section
        className="surface-card result-card result-card-polished"
        data-testid="pvp-result-screen"
      >
        <span className="eyebrow">Official Result</span>
        <h1>
          {match.winner_user_id === auth.user?.id
            ? 'ניצחת'
            : match.winner_user_id
              ? 'הפסדת'
              : 'שוויון'}
        </h1>
        <p>
          {`הדו־קרב במחוז ${getDistrictDisplayName(match.district_id)} הוכרע סופית על ידי השרת.`}
        </p>

        <div className="result-grid">
          {match.participants.map((participant) => (
            <div
              key={participant.id}
              className={`result-box ${
                participant.user_id === match.winner_user_id ? 'winner' : ''
              }`}
              data-testid={`pvp-result-participant-${participant.user_id}`}
            >
              <strong>{getParticipantLabel(participant)}</strong>
              <span>{`ניקוד: ${participant.final_score}`}</span>
              <span>{`פספוסים: ${participant.total_misses}`}</span>
              <span>{`דיוק: ${Math.round(participant.accuracy_pct)}%`}</span>
              <span>{`זמן: ${formatDuration(participant.completion_ms)}`}</span>
            </div>
          ))}
        </div>

        <div className="hero-actions">
          <button className="primary-btn" onClick={() => navigate('/pvp')}>
            משחק נוסף
          </button>
          <button className="secondary-btn" onClick={() => navigate('/solo')}>
            מעבר לסולו
          </button>
        </div>
      </section>
    );
  }

  if (match.status === 'pending') {
    return (
      <section
        className="surface-card ready-card ready-card-polished"
        data-testid="pvp-ready-screen"
      >
        <span className="eyebrow">Match Lobby</span>
        <h1>{`דו־קרב במחוז ${getDistrictDisplayName(match.district_id)}`}</h1>
        <p>
          המשחק יתחיל רק כששני הצדדים מוכנים. השרת יקבע זמן פתיחה אחד לכולם.
        </p>

        <div className="queue-inline-status">
          <div
            className={`status-chip ${syncError || syncLooksStale ? 'warning' : ''}`}
            data-testid="pvp-sync-status"
          >
            {syncError || (syncLooksStale ? 'ממתין לעדכון טרי מהשרת' : 'סנכרון תקין')}
          </div>
          <span className="field-help">עדכון אחרון: {formatSyncElapsed(lastSyncAt)}</span>
        </div>

        {syncError && (
          <div className="queue-box queue-box-warning" data-testid="pvp-sync-recovery">
            <strong>העמוד ממשיך להתעדכן ברקע</strong>
            <span>{syncError}</span>
            <span>אפשר להמתין לעדכון הבא או לרענן ידנית.</span>
          </div>
        )}

        <div className="result-grid">
          {match.participants.map((participant) => (
            <div
              key={participant.id}
              className={`result-box ${participant.ready_at ? 'winner' : ''}`}
              data-testid={`pvp-ready-participant-${participant.user_id}`}
            >
              <strong>{getParticipantLabel(participant)}</strong>
              <span>{participant.ready_at ? 'מוכן' : 'ממתין לאישור'}</span>
              <span>
                {isPresenceStale(participant.last_seen_at, now)
                  ? 'נראה לא פעיל כרגע'
                  : 'מחובר ללובי'}
              </span>
            </div>
          ))}
        </div>

        <div className="hero-actions">
          <button
            className="primary-btn"
            data-testid="pvp-ready-button"
            disabled={busy || Boolean(me.ready_at)}
            onClick={() => void handleReady()}
          >
            {me.ready_at ? 'ממתין ליריב...' : 'אני מוכן'}
          </button>
          <button
            type="button"
            className="ghost-btn"
            data-testid="pvp-match-retry"
            onClick={() => void refreshMatch()}
          >
            רענון ידני
          </button>
        </div>

        {message && (
          <p className="form-message" data-testid="pvp-match-message">
            {message}
          </p>
        )}
      </section>
    );
  }

  return (
    <>
      <div className="page-banner page-banner-inline" data-testid="pvp-match-banner">
        <div>
          <strong>מצב הדו־קרב</strong>
          <span>
            {finished
              ? 'סיימת את כל הסיבובים. התוצאה הרשמית תופיע ברגע שגם היריב יסיים.'
              : `סיבוב ${Math.min(currentRound, match.question_count)} מתוך ${match.question_count}.`}
          </span>
        </div>
        <div className="banner-actions">
          <div
            className={`status-chip ${
              syncError || syncLooksStale || opponentPresenceStale ? 'warning' : ''
            }`}
            data-testid="pvp-sync-status"
          >
            {syncError
              ? 'סנכרון מתעכב'
              : syncLooksStale
                ? 'ממתין לעדכון טרי מהשרת'
                : opponentPresenceStale
                  ? 'היריב נראה לא פעיל'
                  : 'Realtime פעיל'}
          </div>
          <button
            type="button"
            className="ghost-btn compact"
            data-testid="pvp-match-retry"
            onClick={() => void refreshMatch()}
          >
            רענן
          </button>
        </div>
      </div>

      <section className="match-page" data-testid="pvp-active-match">
        <div className="match-sidebar surface-card match-sidebar-polished">
          <span className="eyebrow">Official Match</span>
          <h2>{getDistrictDisplayName(match.district_id)}</h2>
          <p>אותו seed, אותו סדר שאלות והכרעה רשמית מהשרת.</p>

          <div className="match-phase-banner">
            <strong>
              {finished
                ? 'סיימת את כל הסיבובים'
                : `סיבוב ${Math.min(currentRound, match.question_count)} מתוך ${match.question_count}`}
            </strong>
            <span>
              {finished
                ? 'ממתין שהיריב יסיים כדי לחשב תוצאה רשמית.'
                : 'התקדמות היריב מתעדכנת בזמן אמת, עם polling איטי כגיבוי בלבד.'}
            </span>
          </div>

          {(syncError || mapLoadError) && (
            <div className="queue-box queue-box-warning" data-testid="pvp-match-recovery">
              <strong>הדו־קרב עדיין פעיל</strong>
              <span>{syncError ?? mapLoadError}</span>
              <span>אפשר להמשיך להמתין, לרענן ידנית, או לטעון שוב את המפה.</span>
            </div>
          )}

          <div className="queue-inline-status">
            <span className="field-help">עדכון אחרון: {formatSyncElapsed(lastSyncAt)}</span>
            {catalogLoading && <span className="field-help">מכין את מפת המחוז...</span>}
          </div>

          <div className="score-stack">
            <div className="score-row">
              <strong data-testid="pvp-me-label">{getParticipantLabel(me)}</strong>
              <span data-testid="pvp-me-round-progress">
                {`סיבוב: ${Math.min(me.current_round_number, match.question_count)}/${match.question_count}`}
              </span>
              <span>{`ניקוד: ${me.final_score}`}</span>
              <span>{`פספוסים: ${me.total_misses}`}</span>
            </div>
            {opponent && (
              <div className="score-row muted">
                <strong data-testid="pvp-opponent-label">
                  {getParticipantLabel(opponent)}
                </strong>
                <span data-testid="pvp-opponent-round-progress">
                  {`סיבוב: ${Math.min(opponent.current_round_number, match.question_count)}/${match.question_count}`}
                </span>
                <span>{`ניקוד: ${opponent.final_score}`}</span>
                <span>{`פספוסים: ${opponent.total_misses}`}</span>
                <span>
                  {opponentPresenceStale ? 'ייתכן שהיריב מנותק' : 'היריב פעיל'}
                </span>
              </div>
            )}
          </div>

          {finished ? (
            <div className="queue-box" data-testid="pvp-waiting-for-result">
              <strong>התוצאה תופיע כאן אוטומטית</strong>
              <span>
                אין צורך לרענן. אם משהו מתעכב, העמוד ממשיך לרענן את נתוני המשחק ברקע.
              </span>
            </div>
          ) : currentSettlement ? (
            <div className="target-card target-card-polished" data-testid="pvp-target-card">
              <span>איפה נמצא/ת:</span>
              <strong data-testid="pvp-current-settlement-he">
                {currentSettlement.name_he}
              </strong>
              <small>{currentSettlement.name_en}</small>
              <span className="progress-meta">
                {wrongGuessIds.length === 0
                  ? 'עדיין בלי פספוסים בסיבוב הזה'
                  : `${wrongGuessIds.length} פספוסים בסיבוב הנוכחי`}
              </span>
            </div>
          ) : (
            <div className="queue-box">
              <strong>חסר יעד פעיל לסיבוב</strong>
              <span>נתוני הסיבוב לא נטענו כראוי. אפשר להמתין לעדכון הבא או לרענן ידנית.</span>
            </div>
          )}

          {message && (
            <p className="form-message" data-testid="pvp-match-message">
              {message}
            </p>
          )}
        </div>

        <div className="match-map-shell">
          {settlements.length === 0 ? (
            <MatchMapFallback
              loading={catalogLoading}
              error={mapLoadError}
              onRetry={() => void refreshMatch()}
            />
          ) : (
            <Suspense
              fallback={
                <MatchMapFallback
                  loading={true}
                  error={mapLoadError}
                  onRetry={() => void refreshMatch()}
                />
              }
            >
              <GameMap
                settlements={districtSettlements}
                mapStyle="voyager"
                onMapStyleChange={() => {}}
                mapViewport={mapViewport}
                onMapViewportChange={setMapViewport}
                wrongGuessIds={wrongGuessIds}
                onSettlementSelect={
                  finished ? undefined : (settlementId) => void handleGuess(settlementId)
                }
                interactive={!finished}
              />
            </Suspense>
          )}
        </div>
      </section>
    </>
  );
}
