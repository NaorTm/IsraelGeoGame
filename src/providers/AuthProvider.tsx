import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { AppProfile } from '../types';
import {
  claimUsername as claimUsernameRequest,
  fetchProfile,
  getCurrentSession,
  signInWithPassword as signInWithPasswordRequest,
  signInWithGoogle as signInWithGoogleRequest,
  signInWithMagicLink as signInWithMagicLinkRequest,
  signUpWithEmail as signUpWithEmailRequest,
  signOut as signOutRequest,
} from '../services/supabaseApi';

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: AppProfile | null;
  isAuthenticated: boolean;
  signInWithGoogle: () => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  claimUsername: (username: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);

  async function loadProfile(userId: string | null) {
    if (!userId || !isSupabaseConfigured) {
      setProfile(null);
      return;
    }

    const nextProfile = await fetchProfile(userId);
    setProfile(nextProfile);
  }

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      return;
    }

    let active = true;

    void getCurrentSession()
      .then(async (currentSession) => {
        if (!active) {
          return;
        }

        setSession(currentSession);
        await loadProfile(currentSession?.user.id ?? null);
        if (active) {
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setLoading(false);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void loadProfile(nextSession?.user.id ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      profile,
      isAuthenticated: Boolean(session?.user),
      signInWithGoogle: signInWithGoogleRequest,
      signUpWithEmail: async (email: string, password: string) => {
        await signUpWithEmailRequest(email, password);
      },
      signInWithPassword: async (email: string, password: string) => {
        await signInWithPasswordRequest(email, password);
      },
      signInWithMagicLink: signInWithMagicLinkRequest,
      signOut: async () => {
        await signOutRequest();
        setProfile(null);
      },
      claimUsername: async (username: string) => {
        const nextProfile = await claimUsernameRequest(username);
        setProfile(nextProfile);
      },
      refreshProfile: async () => {
        await loadProfile(session?.user.id ?? null);
      },
    }),
    [loading, profile, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
