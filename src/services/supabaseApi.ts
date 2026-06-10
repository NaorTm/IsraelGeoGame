import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type {
  ActiveMatch,
  AppProfile,
  DistrictProgress,
  MatchParticipant,
  MatchRound,
  QueueState,
  SoloRoundRecord,
} from '../types';

function getClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  return supabase;
}

function mapProfile(row: Record<string, unknown>): AppProfile {
  return {
    id: String(row.id),
    email: String(row.email ?? ''),
    display_name: String(row.display_name ?? ''),
    avatar_url: row.avatar_url ? String(row.avatar_url) : null,
    username: row.username ? String(row.username) : null,
    preferred_language: String(row.preferred_language ?? 'he'),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

function mapParticipant(row: Record<string, unknown>): MatchParticipant {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    seat: Number(row.seat ?? 0),
    display_name: String(row.display_name ?? ''),
    username: row.username ? String(row.username) : null,
    avatar_url: row.avatar_url ? String(row.avatar_url) : null,
    ready_at: row.ready_at ? String(row.ready_at) : null,
    finished_at: row.finished_at ? String(row.finished_at) : null,
    final_score: Number(row.final_score ?? 0),
    total_misses: Number(row.total_misses ?? 0),
    successful_rounds: Number(row.successful_rounds ?? 0),
    accuracy_pct: Number(row.accuracy_pct ?? 0),
    completion_ms: row.completion_ms === null || row.completion_ms === undefined ? null : Number(row.completion_ms),
    result: String(row.result ?? 'pending') as MatchParticipant['result'],
    current_round_number: Number(row.current_round_number ?? 1),
    last_seen_at: String(row.last_seen_at ?? ''),
  };
}

function mapRound(row: Record<string, unknown>): MatchRound {
  return {
    round_number: Number(row.round_number ?? 0),
    settlement_id: String(row.settlement_id ?? ''),
  };
}

export async function getCurrentSession(): Promise<Session | null> {
  const client = getClient();
  const { data, error } = await client.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
}

export async function getCurrentUser(): Promise<User | null> {
  const client = getClient();
  const { data, error } = await client.auth.getUser();

  if (error) {
    throw error;
  }

  return data.user;
}

export async function signInWithGoogle() {
  const client = getClient();
  const redirectTo = `${window.location.origin}/auth/callback`;
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });

  if (error) {
    throw error;
  }
}

export async function signUpWithEmail(email: string, password: string) {
  const client = getClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signInWithPassword(email: string, password: string) {
  const client = getClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signInWithMagicLink(email: string) {
  const client = getClient();
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  if (error) {
    throw error;
  }
}

export async function signOut() {
  const client = getClient();
  const { error } = await client.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function exchangeCodeForSession(code: string) {
  const client = getClient();
  const { error } = await client.auth.exchangeCodeForSession(code);

  if (error) {
    throw error;
  }
}

export async function fetchProfile(userId: string): Promise<AppProfile | null> {
  const client = getClient();
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapProfile(data as Record<string, unknown>) : null;
}

export async function claimUsername(username: string): Promise<AppProfile> {
  const client = getClient();
  const { data, error } = await client.rpc('claim_username', {
    p_username: username,
  });

  if (error) {
    throw error;
  }

  return mapProfile(data as Record<string, unknown>);
}

export async function fetchProgress(): Promise<DistrictProgress[]> {
  const client = getClient();
  const { data, error } = await client
    .from('user_district_progress')
    .select('*')
    .order('last_played_at', { ascending: false, nullsFirst: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    district_id: String(row.district_id),
    games_played: Number(row.games_played ?? 0),
    best_score: Number(row.best_score ?? 0),
    best_streak: Number(row.best_streak ?? 0),
    total_rounds: Number(row.total_rounds ?? 0),
    successful_rounds: Number(row.successful_rounds ?? 0),
    total_misses: Number(row.total_misses ?? 0),
    accuracy_pct: Number(row.accuracy_pct ?? 0),
    last_played_at: row.last_played_at ? String(row.last_played_at) : null,
  }));
}

export async function recordSoloSession(params: {
  districtId: string;
  mode: string;
  roundResults: SoloRoundRecord[];
  totalScore: number;
  bestStreak: number;
}) {
  const client = getClient();
  const { data, error } = await client.rpc('record_solo_session', {
    p_district_id: params.districtId,
    p_mode: params.mode,
    p_ruleset_version: 'solo_client_v1',
    p_round_results: params.roundResults,
    p_total_score: params.totalScore,
    p_best_streak: params.bestStreak,
  });

  if (error) {
    throw error;
  }

  return data as string;
}

export async function queuePvpMatch(districtId: string) {
  const client = getClient();
  const { data, error } = await client.rpc('queue_pvp_match', {
    p_district_id: districtId,
    p_ruleset_version: 'pvp_fixed_10_v1',
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    queue_id: row?.queue_id ? String(row.queue_id) : null,
    session_id: row?.session_id ? String(row.session_id) : null,
    status: String(row?.status ?? 'searching') as QueueState['status'],
  };
}

export async function cancelMatchmaking(queueId?: string | null) {
  const client = getClient();
  const { error } = await client.rpc('cancel_matchmaking', {
    p_queue_id: queueId ?? null,
  });

  if (error) {
    throw error;
  }
}

export async function setMatchReady(sessionId: string) {
  const client = getClient();
  const { data, error } = await client.rpc('set_match_ready', {
    p_session_id: sessionId,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    session_id: String(row?.session_id ?? sessionId),
    status: String(row?.status ?? 'pending'),
    started_at: row?.started_at ? String(row.started_at) : null,
  };
}

export async function submitPvpGuess(sessionId: string, roundNumber: number, settlementId: string) {
  const client = getClient();
  const { data, error } = await client.rpc('submit_pvp_guess', {
    p_session_id: sessionId,
    p_round_number: roundNumber,
    p_selected_settlement_id: settlementId,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row;
}

export async function submitPvpTimeout(sessionId: string, roundNumber: number) {
  const client = getClient();
  const { data, error } = await client.rpc('submit_pvp_timeout', {
    p_session_id: sessionId,
    p_round_number: roundNumber,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row;
}

export async function fetchQueueState(): Promise<QueueState | null> {
  const client = getClient();
  const { data, error } = await client
    .from('matchmaking_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: String(data.id),
    district_id: String(data.district_id),
    ruleset_version: String(data.ruleset_version),
    status: String(data.status) as QueueState['status'],
    matched_session_id: data.matched_session_id ? String(data.matched_session_id) : null,
    created_at: String(data.created_at),
  };
}

export async function fetchActiveMatch(sessionId: string): Promise<ActiveMatch> {
  const client = getClient();
  const [{ data: session, error: sessionError }, { data: players, error: playersError }, { data: rounds, error: roundsError }] =
    await Promise.all([
      client.from('game_sessions').select('*').eq('id', sessionId).single(),
      client.from('session_players').select('*').eq('session_id', sessionId).order('seat', { ascending: true }),
      client.from('session_rounds').select('*').eq('session_id', sessionId).order('round_number', { ascending: true }),
    ]);

  if (sessionError) {
    throw sessionError;
  }

  if (playersError) {
    throw playersError;
  }

  if (roundsError) {
    throw roundsError;
  }

  return {
    id: String(session.id),
    session_type: String(session.session_type) as ActiveMatch['session_type'],
    mode: String(session.mode),
    district_id: String(session.district_id),
    ruleset_version: String(session.ruleset_version),
    status: String(session.status) as ActiveMatch['status'],
    question_count: Number(session.question_count ?? 0),
    winner_user_id: session.winner_user_id ? String(session.winner_user_id) : null,
    created_at: String(session.created_at),
    started_at: session.started_at ? String(session.started_at) : null,
    completed_at: session.completed_at ? String(session.completed_at) : null,
    participants: (players ?? []).map((row) => mapParticipant(row as Record<string, unknown>)),
    rounds: (rounds ?? []).map((row) => mapRound(row as Record<string, unknown>)),
  };
}
