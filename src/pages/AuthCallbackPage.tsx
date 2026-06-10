import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { exchangeCodeForSession } from '../services/supabaseApi';

export default function AuthCallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const callbackParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const hashParams = useMemo(
    () => new URLSearchParams(window.location.hash.replace(/^#/, '')),
    []
  );

  const initialCode = callbackParams.get('code');
  const callbackError =
    callbackParams.get('error_description') ??
    hashParams.get('error_description') ??
    callbackParams.get('error');
  const hasHashSession =
    hashParams.has('access_token') ||
    hashParams.has('refresh_token') ||
    hashParams.get('type') === 'magiclink';

  const [message, setMessage] = useState(() => {
    if (callbackError) {
      return callbackError;
    }

    if (initialCode || hasHashSession) {
      return 'מסיים התחברות...';
    }

    return 'לא נמצא קוד התחברות. מעביר חזרה.';
  });

  useEffect(() => {
    if (callbackError) {
      return;
    }

    if (auth.isAuthenticated) {
      navigate('/profile', { replace: true });
      return;
    }

    if (!initialCode && !hasHashSession) {
      const timeout = window.setTimeout(() => navigate('/profile', { replace: true }), 800);
      return () => window.clearTimeout(timeout);
    }

    if (initialCode) {
      void exchangeCodeForSession(initialCode)
        .then(() => {
          navigate('/profile', { replace: true });
        })
        .catch((error) => {
          setMessage(error instanceof Error ? error.message : 'ההתחברות נכשלה.');
        });

      return;
    }

    const timeout = window.setTimeout(() => {
      if (auth.isAuthenticated) {
        navigate('/profile', { replace: true });
        return;
      }

      setMessage('ההתחברות נכשלה או שנגמר הזמן למסיים אישור.');
    }, 2500);

    return () => window.clearTimeout(timeout);
  }, [auth.isAuthenticated, callbackError, hasHashSession, initialCode, navigate]);

  return (
    <section className="surface-card" data-testid="auth-callback-screen">
      <h1>{message}</h1>
    </section>
  );
}
