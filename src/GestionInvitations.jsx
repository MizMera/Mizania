// src/GestionInvitations.jsx
import { useState } from 'react';
import { supabase } from './supabaseClient';
import { toast } from 'react-toastify';
import { TextField, Button, Box, Typography, Paper, Card } from '@mui/material';

function GestionInvitations() {
  const [email, setEmail] = useState('');

  const handleInvite = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('invitations').insert({ email: email });
    if (error) {
      toast.error('Erreur lors de l\'invitation: ' + error.message);
    } else {
      toast.success(`${email} a été invité avec succès !`);
      setEmail('');
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
            Envoyez une invitation par email
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
          >
            Envoyer l'invitation
          </Button>
        </Box>
      </Card>
    </Box>
  );
}
export default GestionInvitations;