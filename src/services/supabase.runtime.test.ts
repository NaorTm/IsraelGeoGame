import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fetchActiveMatch, fetchProfile, fetchProgress } from './supabaseApi';
import { supabase } from '../lib/supabase';

interface RuntimeUserFixture {
  email: string;
  password: string;
  id: string;
  username: string;
}

interface RuntimeValidationFixture {
  districtId: string;
  users: {
    user1: RuntimeUserFixture;
    user2: RuntimeUserFixture;
    user3: RuntimeUserFixture;
  };
  queue2: Array<{
    session_id: string | null;
  }>;
}

const runtimeFixture = JSON.parse(
  readFileSync(resolve(process.cwd(), 'supabase/.temp/runtime-validation.json'), 'utf8')
) as RuntimeValidationFixture;

describe('supabase runtime integration', () => {
  beforeAll(() => {
    expect(supabase).not.toBeNull();
  });

  afterEach(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
  });

  it('reads profile, progress, and match data for a participant through the frontend client', async () => {
    const session = await supabase!.auth.signInWithPassword({
      email: runtimeFixture.users.user1.email,
      password: runtimeFixture.users.user1.password,
    });

    expect(session.error).toBeNull();

    const profile = await fetchProfile(runtimeFixture.users.user1.id);
    const progress = await fetchProgress();
    const match = await fetchActiveMatch(runtimeFixture.queue2[0].session_id!);

    expect(profile?.username).toBe(runtimeFixture.users.user1.username);
    expect(progress.some((entry) => entry.district_id === runtimeFixture.districtId && entry.best_score === 5)).toBe(true);
    expect(match.status).toBe('completed');
    expect(match.winner_user_id).toBe(runtimeFixture.users.user1.id);
    expect(match.participants).toHaveLength(2);
    expect(match.rounds).toHaveLength(2);
  });

  it('denies match reads for a non-participant through the frontend client', async () => {
    const session = await supabase!.auth.signInWithPassword({
      email: runtimeFixture.users.user3.email,
      password: runtimeFixture.users.user3.password,
    });

    expect(session.error).toBeNull();

    await expect(fetchActiveMatch(runtimeFixture.queue2[0].session_id!)).rejects.toMatchObject({
      code: 'PGRST116',
    });
  });
});
