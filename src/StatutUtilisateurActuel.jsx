// src/StatutUtilisateurActuel.jsx
import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Typography, Paper, Box } from '@mui/material';

function StatutUtilisateurActuel() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const { data } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
        setRole(data?.role);
      }
    };
    fetchData();
  }, []);

  return (
    <Paper elevation={2} sx={{ p: 2, bgcolor: 'transparent' }}>
      <Typography variant="h6">Mon Statut Actuel</Typography>
      <Box>
        <Typography><strong>Email:</strong> {user?.email || 'Non connecté'}</Typography>
        <Typography><strong>Rôle:</strong> {role || 'Indéfini'}</Typography>
        <Typography variant="caption">C'est avec ce rôle que la base de données évalue vos permissions.</Typography>
      </Box>
    </Paper>
  );
}
export default StatutUtilisateurActuel;