// src/Login.jsx
import { useState } from 'react';
import { supabase } from './supabaseClient';
import { TextField, Button, Box, Typography, Paper } from '@mui/material';
import { toast } from 'react-toastify';

function Login() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      toast.success('Vérifiez votre email pour le lien de connexion !');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      backgroundColor: '#f5f5f5'
    }}>
      <Paper elevation={3} sx={{ p: 4, maxWidth: 400, width: '100%' }}>
        <Box component="form" onSubmit={handleLogin} sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: 3,
          alignItems: 'center'
        }}>
          <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#1976d2', mb: 2 }}>
            Mizania+
          </Typography>
          <Typography variant="h6" color="textSecondary">
            Connexion
          </Typography>
          <TextField 
            label="Votre Email" 
            type="email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required 
            fullWidth
            variant="outlined"
          />
          <Button 
            type="submit" 
            variant="contained" 
            disabled={loading}
            fullWidth
            size="large"
            sx={{ mt: 2 }}
          >
            {loading ? 'Envoi en cours...' : 'Recevoir le lien magique'}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

export default Login;