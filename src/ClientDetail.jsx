import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { toast } from 'react-toastify';
import { Box, Paper, Typography, TextField, Button, List, ListItemButton, ListItemText } from '@mui/material';

function ClientDetail() {
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [fiches, setFiches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        setLoading(true);
        const { data: c, error: errClient } = await supabase.from('clients').select('*').eq('id', id).single();
        if (errClient) throw errClient;
        setClient(c);
        const { data: fichesData, error: errFiches } = await supabase
          .from('fiches_reparation')
          .select('*')
          .eq('client_id', id);
        if (errFiches) throw errFiches;
        setFiches(fichesData);
      } catch (error) {
        toast.error('Erreur chargement historique: ' + error.message);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [id]);

  if (loading) return <Typography>Chargement...</Typography>;
  if (!client) return <Typography>Aucun client trouvé</Typography>;

  // filter and sort fiches without hooks
  let displayedFiches = fiches.filter(f =>
    f.appareil_description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.statut.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.id.toString().includes(searchTerm)
  );
  displayedFiches.sort((a, b) => sortDesc
    ? new Date(b.created_at) - new Date(a.created_at)
    : new Date(a.created_at) - new Date(b.created_at)
  );

  return (
    <Box sx={{ minHeight: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', gap: 2, mx: { xs: -2, sm: -3 } }}>
      <Typography variant="h4" sx={{ fontWeight: 800 }}>Historique: {client.nom}</Typography>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
        <TextField
          label="Filtrer fiches..."
          variant="outlined"
          size="small"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
        <Button variant="outlined" size="small" onClick={() => setSortDesc(prev => !prev)}>
          Date {sortDesc ? '↓' : '↑'}
        </Button>
      </Box>
      <Paper sx={{ p: 2, mx: { xs: 2, sm: 3 } }}>
        <Typography><strong>Email:</strong> {client.email || '—'}</Typography>
        <Typography><strong>Téléphone:</strong> {client.telephone || '—'}</Typography>
      </Paper>
      <Paper sx={{ flex: 1, p: 2, mx: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Fiches de Réparation</Typography>
        <List>
          {displayedFiches.length === 0 ? (
            <Typography>Aucune fiche trouvée</Typography>
          ) : displayedFiches.map(f => (
            <ListItemButton
              key={f.id}
              component={Link}
              to={`/reparations/${f.id}`}
              divider
            >
              <ListItemText
                primary={`#${f.id} - ${f.appareil_description}`}
                secondary={`${new Date(f.created_at).toLocaleDateString('fr-FR')} - ${f.statut}`}
              />
            </ListItemButton>
          ))}
        </List>
      </Paper>
    </Box>
  );
}

export default ClientDetail;
