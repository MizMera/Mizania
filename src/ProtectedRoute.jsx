// src/ProtectedRoute.jsx
import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import Login from './Login';
import Layout from './Layout';
import { CircularProgress, Box, Typography } from '@mui/material';

function ProtectedRoute() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  // Env-based allowlists (comma-separated)
  const allowedEmails = useMemo(() => (import.meta.env.VITE_ALLOWED_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean), []);
  const allowedDomains = useMemo(() => (import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean), []);
  const allowedOrigins = useMemo(() => (import.meta.env.VITE_ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean), []);

  const isOriginAllowed = (origin) => {
    if (!allowedOrigins.length) return true;
    try { return allowedOrigins.includes(String(origin || '').toLowerCase()); } catch { return true; }
  };
  const isEmailAllowed = (email) => {
    const em = String(email || '').trim().toLowerCase();
    if (allowedEmails.length && allowedEmails.includes(em)) return true;
    if (allowedDomains.length) {
      const domain = em.split('@')[1];
      if (domain && allowedDomains.includes(domain)) return true;
    }
    // If no allowlists provided, default allow
    return !(allowedEmails.length || allowedDomains.length) ? true : false;
  };

  useEffect(() => {
    let mounted = true;

    // Hard gate by origin (optional)
    if (!isOriginAllowed(window.location.origin)) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    // Restore session on app start (works after browser restart)
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      const u = session?.user ?? null;
      // Enforce email/domain allowlist
      if (u && !isEmailAllowed(u.email)) {
        await supabase.auth.signOut();
        setUser(null);
        setAccessDenied(true);
        setLoading(false);
        return;
      }
      setUser(u);
      setLoading(false);
    };
    init();

    // Listen for login/logout/refresh events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      const u = session?.user ?? null;
      if (u && !isEmailAllowed(u.email)) {
        await supabase.auth.signOut();
        setUser(null);
        setAccessDenied(true);
        setLoading(false);
        return;
      }
      setUser(u);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (accessDenied) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center', alignItems: 'center', height: '100vh', textAlign: 'center', px: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>Accès refusé</Typography>
        <Typography variant="body2" color="text.secondary">
          Cet environnement n'est pas autorisé. Veuillez contacter l'administrateur.
        </Typography>
      </Box>
    );
  }

  return user ? <Layout /> : <Login />;
}

export default ProtectedRoute;