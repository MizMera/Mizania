// src/GestionInvitations.jsx
import { useState, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { toast } from 'react-toastify';
import { TextField, Button, Box, Typography, Paper, Card } from '@mui/material';

function GestionInvitations() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  // Redirect URL: prefer explicit site URL, fallback to current origin
  const redirectTo = useMemo(() => {
    return (import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/$/, '');
  }, []);

  const validateEmail = (val) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    return re.test(String(val).toLowerCase());
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!validateEmail(email)) {
      toast.error("Adresse e-mail invalide");
      return;
    }

    try {
      setLoading(true);
      // Send magic sign-in link to the invited user
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;

      // Optional: store invite in a tracking table (ignore error if table/policy missing)
      try {
        await supabase.from('invitations').insert({ email });
      } catch (_) {}

      toast.success(`Invitation envoyée à ${email}. Le lien redirige vers ${redirectTo}`);
      setEmail('');
    } catch (err) {
      const msg = String(err?.message || 'Erreur lors de l\'invitation');
      if (/redirect/.test(msg) && /(allow|whitelist)/i.test(msg)) {
        toast.error(
          `URL de redirection non autorisée: ${redirectTo}. Ajoutez-la dans Supabase > Authentication > URL Configuration.`
        );
      } else if (/signups not allowed|disabled/i.test(msg)) {
        toast.error("Les inscriptions par e-mail sont désactivées dans Supabase (Enable email signups).");
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
        height: 'calc(100vh - 100px)', 
        display: 'flex', 
        flexDirection: 'column',
        gap: 2
      }}
    >
      <Typography variant="h4" sx={{ fontWeight: 800 }}>Inviter un Nouvel Utilisateur</Typography>
      
      <Card sx={{ p: 4, maxWidth: 600, alignSelf: 'center', mt: 4 }}>
        <Box component="form" onSubmit={handleInvite} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Typography variant="h6" color="text.secondary" align="center">
            Envoyez une invitation par email (lien magique)
          </Typography>
          
          <TextField
            type="email"
            label="Email de l'utilisateur à inviter"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            fullWidth
            size="large"
            placeholder="utilisateur@exemple.com"
          />
          
          <Button 
            type="submit" 
            variant="contained" 
            size="large"
            sx={{ py: 1.5 }}
            disabled={loading}
          >
            {loading ? "Envoi en cours…" : "Envoyer l'invitation"}
          </Button>

          <Typography variant="body2" color="text.secondary" align="center">
            Redirection: {redirectTo}
          </Typography>
        </Box>
      </Card>
    </Box>
  );
}
export default GestionInvitations;