import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/app/AppShell';
import { AuthProvider } from './providers/AuthProvider';
import './App.css';

const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const PvpMatchPage = lazy(() => import('./pages/PvpMatchPage'));
const PvpQueuePage = lazy(() => import('./pages/PvpQueuePage'));
const SoloPage = lazy(() => import('./pages/SoloPage'));

function RouteFallback() {
  return (
    <section className="surface-card loading-panel" data-testid="route-loading">
      <strong>{'\u05d8\u05d5\u05e2\u05df \u05d0\u05ea \u05d4\u05e2\u05de\u05d5\u05d3...'}</strong>
      <span>
        {
          '\u05d8\u05e2\u05d9\u05e0\u05ea \u05d4\u05e0\u05ea\u05d9\u05d1, \u05e0\u05ea\u05d5\u05e0\u05d9 \u05d4\u05d7\u05e9\u05d1\u05d5\u05df \u05d5\u05d4\u05de\u05de\u05e9\u05e7.'
        }
      </span>
    </section>
  );
}

function NotFoundPage() {
  return (
    <section className="surface-card">
      <h1>{'\u05d4\u05e2\u05de\u05d5\u05d3 \u05dc\u05d0 \u05e0\u05de\u05e6\u05d0'}</h1>
    </section>
  );
}

function WithFallback({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route
              index
              element={
                <WithFallback>
                  <HomePage />
                </WithFallback>
              }
            />
            <Route
              path="solo"
              element={
                <WithFallback>
                  <SoloPage />
                </WithFallback>
              }
            />
            <Route
              path="pvp"
              element={
                <WithFallback>
                  <PvpQueuePage />
                </WithFallback>
              }
            />
            <Route
              path="match/:matchId"
              element={
                <WithFallback>
                  <PvpMatchPage />
                </WithFallback>
              }
            />
            <Route
              path="profile"
              element={
                <WithFallback>
                  <ProfilePage />
                </WithFallback>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route
            path="/auth/callback"
            element={
              <WithFallback>
                <AuthCallbackPage />
              </WithFallback>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
