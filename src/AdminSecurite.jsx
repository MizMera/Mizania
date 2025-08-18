// src/AdminSecurite.jsx
import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Typography, Box, CircularProgress, Paper, Divider, Card, Alert } from '@mui/material';

// Nous allons créer ces composants juste après
import GestionInvitations from './GestionInvitations';
import GestionRoles from './GestionRoles';
import StatutUtilisateurActuel from './StatutUtilisateurActuel';

function AdminSecurite() {
  const [loading, setLoading] = useState(true);
  const [profil, setProfil] = useState(null);

  useEffect(() => {
    async function getProfile() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        
        if (error) console.error("Erreur de profil:", error);
        setProfil(data);
      }
      setLoading(false);
    }
    getProfile();
  }, []);

  if (loading) {
    return (
      <Box sx={{ 
        height: 'calc(100vh - 100px)', 
        display: 'flex', 
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ 
      minHeight: 'calc(100vh - 100px)', 
      display: 'flex', 
      flexDirection: 'column',
      gap: 2,
      mx: { xs: -2, sm: -3 }
    }}>
      <Typography variant="h4" sx={{ fontWeight: 800 }}>
        Administration & Sécurité
      </Typography>

      <Box sx={{ flexGrow: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 3, px: { xs: 2, sm: 3 } }}>
        {/* SECTION VISIBLE PAR TOUS */}
        <Card sx={{ p: 5, bgcolor: 'background.default', alignSelf: 'center' }}>
          <StatutUtilisateurActuel />
        </Card>

        {/* SECTION VISIBLE UNIQUEMENT PAR LES ADMINS */}
        {profil?.role === 'admin' ? (
          <Card sx={{ p: 2, flexGrow: 0, maxWidth: 3000, alignSelf: 'center' }}>
            <Typography variant="h5" color="primary" sx={{ mb: 3, fontWeight: 600 }}>
              Panneau d'Administration
            </Typography>
            
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Paper sx={{ p: 3, bgcolor: 'background.default' }}>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                  Gestion des Invitations
                </Typography>
                <GestionInvitations />
              </Paper>
              
              <Paper sx={{ p: 3, bgcolor: 'background.default', flexGrow: 1 }}>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                  Gestion des Rôles
                </Typography>
                <GestionRoles />
              </Paper>
            </Box>
          </Card>
        ) : (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Vous n'avez pas les droits nécessaires pour accéder au panneau d'administration.
          </Alert>
        )}
      </Box>
    </Box>
  );
}

export default AdminSecurite;