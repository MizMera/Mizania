// src/Login.jsx
import { useState } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { TextField, Button, Box, Typography, Card, CardContent, Link } from '@mui/material';
import { toast } from 'react-toastify';

function Login() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (loginError) {
      toast.error(loginError.message);
      setLoading(false);
      return;
    }

    if (loginData.user) {
      // Fetch the full profile to ensure we get the latest data
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*') 
        .eq('id', loginData.user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') { // Ignore 'exact one row' error if profile is missing
        toast.error("Erreur de chargement du profil utilisateur.");
        await supabase.auth.signOut();
      } else if (!profile || !profile.approved) {
        toast.warn("Votre compte n'a pas encore été approuvé par un administrateur.");
        await supabase.auth.signOut();
      } else {
        toast.success('Connexion réussie !');
        navigate('/');
      }
    }
    setLoading(false);
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
      <Card
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
        <CardContent>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: 0.2 }}>
              Mizania+
            </Typography>
            <Typography variant="subtitle1" sx={{ color: 'rgba(226,232,240,0.8)' }}>
              Connexion
            </Typography>
          </Box>

          <Box component="form" onSubmit={handleLogin} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Votre e-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
              variant="outlined"
              InputLabelProps={{ sx: { color: '#9ca3af' } }}
              InputProps={{
                sx: {
                  bgcolor: 'rgba(148,163,184,0.08)',
                  color: '#E5E7EB',
                  '& fieldset': { borderColor: 'rgba(148,163,184,0.24)' },
                  '&:hover fieldset': { borderColor: 'rgba(148,163,184,0.36)' },
                },
              }}
            />
            
            <TextField
              label="Mot de passe"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              variant="outlined"
              InputLabelProps={{ sx: { color: '#9ca3af' } }}
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
                mt: 1,
                py: 1.2,
                fontWeight: 700,
                background: 'linear-gradient(135deg, #6366F1, #0EA5E9)',
                boxShadow: '0 10px 24px rgba(14,165,233,0.35)',
              }}
              fullWidth
            >
              {loading ? 'Connexion en cours…' : 'Se connecter'}
            </Button>
          </Box>
          <Typography variant="body2" sx={{ textAlign: 'center', mt: 3 }}>
            <Link component={RouterLink} to="/signup" sx={{ color: 'rgba(226,232,240,0.8)' }}>
              Pas de compte ? S'inscrire
            </Link>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}

export default Login;