// src/ProtectedRoute.jsx
import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Login from './Login';
import Layout from './Layout';
import { CircularProgress, Box } from '@mui/material';

function ProtectedRoute() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Restore session on app start (works after browser restart)
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      setUser(session?.user ?? null);
      setLoading(false);
    };
    init();

    // Listen for login/logout/refresh events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
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

  return user ? <Layout /> : <Login />;
}

export default ProtectedRoute;