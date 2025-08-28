import { useState } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Box, Button, TextField, Typography, Card, CardContent, Link } from '@mui/material';

function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignUp = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      toast.error(error.message);
    } else {
      // The trigger will handle profile creation automatically!
      toast.success('Inscription réussie ! Un administrateur doit approuver votre compte.');
      navigate('/login');
    }
    setLoading(false);
  };

  return (
    <Box sx={{ 
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      p: 2,
      background: 'radial-gradient(1200px 600px at 100% -10%, rgba(99,102,241,0.18), transparent), radial-gradient(800px 400px at -10% 100%, rgba(14,165,233,0.12), transparent), #0B1220'
    }}>
      <Card sx={{ 
        width: '100%',
        maxWidth: 440,
        p: 4,
        borderRadius: 3,
        bgcolor: 'rgba(2,6,23,0.6)',
        border: '1px solid rgba(148,163,184,0.16)',
        color: '#E5E7EB',
        boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
      }}>
        <CardContent>
          <Typography variant="h4" component="h1" gutterBottom sx={{ textAlign: 'center', fontWeight: 800 }}>
            Créer un compte
          </Typography>
          <Typography variant="body2" sx={{ textAlign: 'center', color: 'rgba(226,232,240,0.8)', mb: 3 }}>
            Après l'inscription, un administrateur devra approuver votre compte.
          </Typography>
          <form onSubmit={handleSignUp}>
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              margin="normal"
              required
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
              fullWidth
              margin="normal"
              required
              inputProps={{ minLength: 6 }}
              helperText="Doit contenir au moins 6 caractères."
              FormHelperTextProps={{ sx: { color: 'rgba(226,232,240,0.6)' } }}
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
              color="primary"
              fullWidth
              disabled={loading}
              size="large"
              sx={{ 
                mt: 2,
                py: 1.2,
                fontWeight: 700,
                background: 'linear-gradient(135deg, #6366F1, #0EA5E9)',
                boxShadow: '0 10px 24px rgba(14,165,233,0.35)',
              }}
            >
              {loading ? 'Chargement...' : 'S\'inscrire'}
            </Button>
          </form>
          <Typography variant="body2" sx={{ textAlign: 'center', mt: 3 }}>
            <Link component={RouterLink} to="/login" sx={{ color: 'rgba(226,232,240,0.8)' }}>
              Déjà un compte ? Se connecter
            </Link>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}

export default SignUp;
