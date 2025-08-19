// src/Login.jsx
import { useState, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { TextField, Button, Box, Typography, Paper } from '@mui/material';
import { toast } from 'react-toastify';

function Login() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');

  // Configurable allowed domains (comma-separated), optional
  const allowedDomains = useMemo(() => {
    const raw = import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS || '';
    return raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }, []);

  // Redirect URL: prefer explicit site URL in env, fallback to current origin
  const redirectTo = useMemo(() => {
    return (import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/$/, '');
  }, []);

  const validateEmail = (val) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!re.test(String(val).toLowerCase())) {
      return 'Adresse e-mail invalide';
    }
    // Domain allowlist (client-side precheck for better UX)
    if (allowedDomains.length) {
      const domain = String(val.split('@')[1] || '').toLowerCase();
      if (!allowedDomains.includes(domain)) {
        return `Domaine non autorisé. Autorisés: ${allowedDomains.join(', ')}`;
      }
    }
    return '';
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const err = validateEmail(email);
    setEmailError(err);
    if (err) {
      toast.error(err);
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      toast.success('Vérifiez votre e-mail pour le lien de connexion. Pensez à vérifier vos spams.');
    } catch (error) {
      const msg = String(error?.message || 'Erreur de connexion');
      if (/redirect/.test(msg) && /(allow|whitelist)/i.test(msg)) {
        toast.error(
          `URL de redirection non autorisée: ${redirectTo}. Ajoutez-la dans Supabase > Authentication > URL Configuration (Site URL ou Additional Redirect URLs).`
        );
      } else if (/domain/i.test(msg)) {
        toast.error('Domaine e-mail non autorisé par la politique du projet.');
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        p: 2,
        background:
          'radial-gradient(1200px 600px at 100% -10%, rgba(99,102,241,0.18), transparent), radial-gradient(800px 400px at -10% 100%, rgba(14,165,233,0.12), transparent), #0B1220',
      }}
    >
      <Paper
        elevation={6}
        sx={{
          width: '100%',
          maxWidth: 440,
          p: 4,
          borderRadius: 3,
          bgcolor: 'rgba(2,6,23,0.6)',
          border: '1px solid rgba(148,163,184,0.16)',
          color: '#E5E7EB',
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
        }}
      >
        <Box component="form" onSubmit={handleLogin} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: 0.2 }}>
              Mizania+
            </Typography>
            <Typography variant="subtitle1" sx={{ color: 'rgba(226,232,240,0.8)' }}>
              Connexion par lien magique
            </Typography>
          </Box>

          <TextField
            label="Votre e-mail"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError(validateEmail(e.target.value));
            }}
            onBlur={() => setEmailError(validateEmail(email))}
            error={!!emailError}
            helperText={emailError || 'Nous vous enverrons un lien sécurisé.'}
            required
            fullWidth
            size="medium"
            variant="outlined"
            InputProps={{
              sx: {
                bgcolor: 'rgba(148,163,184,0.08)',
                color: '#E5E7EB',
                '& fieldset': { borderColor: 'rgba(148,163,184,0.24)' },
                '&:hover fieldset': { borderColor: 'rgba(148,163,184,0.36)' },
              },
            }}
          />

          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            size="large"
            sx={{
              py: 1.2,
              fontWeight: 700,
              background: 'linear-gradient(135deg, #6366F1, #0EA5E9)',
              boxShadow: '0 10px 24px rgba(14,165,233,0.35)',
            }}
            fullWidth
          >
            {loading ? 'Envoi en cours…' : 'Recevoir le lien magique'}
          </Button>

          <Box sx={{ textAlign: 'center', color: 'rgba(226,232,240,0.8)', fontSize: 13 }}>
            <div>Lien valide uniquement sur: {redirectTo}</div>
            {allowedDomains.length > 0 && <div>Domaines autorisés: {allowedDomains.join(', ')}</div>}
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}

export default Login;