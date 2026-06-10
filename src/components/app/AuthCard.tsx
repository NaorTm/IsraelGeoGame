import { useState, type FormEvent } from 'react';
import { useAuth } from '../../providers/AuthProvider';

type AuthMode = 'password-login' | 'password-signup' | 'magic-link';

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function getAuthErrorMessage(error: unknown) {
  const fallback = 'הפעולה נכשלה. אפשר לנסות שוב.';

  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message.toLowerCase();

  if (message.includes('email not confirmed')) {
    return 'האימייל עדיין לא אומת. צריך לפתוח את הודעת האימות שנשלחה למייל ורק אחר כך להתחבר עם הסיסמה.';
  }

  if (message.includes('invalid login credentials')) {
    return 'האימייל או הסיסמה לא נכונים.';
  }

  if (message.includes('user already registered')) {
    return 'כבר קיים חשבון עם האימייל הזה. אפשר להתחבר עם הסיסמה או לבקש Magic Link.';
  }

  if (message.includes('password should be at least')) {
    return 'הסיסמה קצרה מדי. צריך לפחות 6 תווים.';
  }

  return error.message || fallback;
}

export default function AuthCard() {
  const auth = useAuth();
  const [authMode, setAuthMode] = useState<AuthMode>('password-login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleGoogleLogin() {
    try {
      setBusy(true);
      setMessage(null);
      await auth.signInWithGoogle();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'התחברות נכשלה.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      setMessage('צריך להזין כתובת אימייל.');
      return;
    }

    if (!password) {
      setMessage('צריך להזין סיסמה.');
      return;
    }

    if (password.length < 6) {
      setMessage('הסיסמה צריכה להכיל לפחות 6 תווים.');
      return;
    }

    if (password !== confirmPassword) {
      setMessage('אימות הסיסמה לא תואם.');
      return;
    }

    try {
      setBusy(true);
      setMessage(null);
      await auth.signUpWithEmail(normalizedEmail, password);
      setPassword('');
      setConfirmPassword('');
      setMessage('שלחנו מייל אימות. רק אחרי לחיצה על הקישור במייל יהיה אפשר להתחבר עם האימייל והסיסמה.');
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      setMessage('צריך להזין כתובת אימייל.');
      return;
    }

    if (!password) {
      setMessage('צריך להזין סיסמה.');
      return;
    }

    try {
      setBusy(true);
      setMessage(null);
      await auth.signInWithPassword(normalizedEmail, password);
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      setMessage('צריך להזין כתובת אימייל.');
      return;
    }

    try {
      setBusy(true);
      setMessage(null);
      await auth.signInWithMagicLink(normalizedEmail);
      setMessage('שלחנו קישור התחברות למייל.');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (!auth.configured) {
    return (
      <div className="surface-card auth-card" data-testid="auth-card-disabled">
        <h3>חיבור משתמשים עדיין לא פעיל</h3>
        <p>
          כדי להפעיל Google Login, התחברות במייל, שמירת התקדמות ו־PvP, צריך להגדיר
          `VITE_SUPABASE_URL` ו־`VITE_SUPABASE_ANON_KEY`.
        </p>
      </div>
    );
  }

  if (auth.isAuthenticated) {
    return (
      <div className="surface-card auth-card" data-testid="auth-card-authenticated">
        <h3>מחובר</h3>
        <p>
          {auth.profile?.username
            ? `נכנסת בתור @${auth.profile.username}.`
            : 'החשבון מחובר, נשאר לבחור שם משתמש ציבורי.'}
        </p>
      </div>
    );
  }

  return (
    <div className="surface-card auth-card" data-testid="auth-card">
      <h3>התחברות ושמירת התקדמות</h3>
      <p>סולו פתוח גם לאורחים. שמירה בענן ו־PvP דורשים חשבון. התחברות עם אימייל וסיסמה זמינה רק אחרי אימות המייל.</p>

      <button className="primary-btn" data-testid="google-login-button" disabled={busy} onClick={() => void handleGoogleLogin()}>
        התחברות עם Google
      </button>

      <div className="auth-mode-switcher" data-testid="auth-mode-switcher">
        <button
          type="button"
          className={authMode === 'password-login' ? 'secondary-btn auth-mode-btn active' : 'secondary-btn auth-mode-btn'}
          data-testid="auth-mode-password-login"
          disabled={busy}
          onClick={() => {
            setAuthMode('password-login');
            setMessage(null);
          }}
        >
          כניסה עם סיסמה
        </button>
        <button
          type="button"
          className={authMode === 'password-signup' ? 'secondary-btn auth-mode-btn active' : 'secondary-btn auth-mode-btn'}
          data-testid="auth-mode-password-signup"
          disabled={busy}
          onClick={() => {
            setAuthMode('password-signup');
            setMessage(null);
          }}
        >
          פתיחת חשבון
        </button>
        <button
          type="button"
          className={authMode === 'magic-link' ? 'secondary-btn auth-mode-btn active' : 'secondary-btn auth-mode-btn'}
          data-testid="auth-mode-magic-link"
          disabled={busy}
          onClick={() => {
            setAuthMode('magic-link');
            setMessage(null);
          }}
        >
          Magic Link
        </button>
      </div>

      {authMode === 'password-login' && (
        <form className="auth-form" data-testid="email-login-form" onSubmit={(event) => void handlePasswordLogin(event)}>
          <input
            className="text-input"
            type="email"
            data-testid="email-login-email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
          />
          <input
            className="text-input"
            type="password"
            data-testid="email-login-password"
            placeholder="סיסמה"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
          />
          <button className="secondary-btn" data-testid="email-login-submit" type="submit" disabled={busy}>
            כניסה עם אימייל וסיסמה
          </button>
        </form>
      )}

      {authMode === 'password-signup' && (
        <form className="auth-form" data-testid="email-signup-form" onSubmit={(event) => void handlePasswordSignup(event)}>
          <input
            className="text-input"
            type="email"
            data-testid="email-signup-email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
          />
          <input
            className="text-input"
            type="password"
            data-testid="email-signup-password"
            placeholder="סיסמה"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
          />
          <input
            className="text-input"
            type="password"
            data-testid="email-signup-confirm-password"
            placeholder="אימות סיסמה"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={busy}
          />
          <button className="secondary-btn" data-testid="email-signup-submit" type="submit" disabled={busy}>
            פתיחת חשבון עם אימייל
          </button>
        </form>
      )}

      {authMode === 'magic-link' && (
        <form className="auth-form" data-testid="magic-link-form" onSubmit={(event) => void handleMagicLink(event)}>
          <input
            className="text-input"
            type="email"
            data-testid="magic-link-email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
          />
          <button className="secondary-btn" data-testid="magic-link-submit" type="submit" disabled={busy}>
            שליחת Magic Link
          </button>
        </form>
      )}

      {message && <p className="form-message" data-testid="auth-message">{message}</p>}
    </div>
  );
}
