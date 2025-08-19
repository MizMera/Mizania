import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { toast } from 'react-toastify';
import { TextField, Button, Box, Table, TableHead, TableRow, TableCell, TableBody, Paper, Typography, TableContainer } from '@mui/material';
import { Link } from 'react-router-dom';

function Clients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortDescByCount, setSortDescByCount] = useState(false);

  useEffect(() => {
    const fetchClients = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('clients')
        .select('id, nom, email, telephone, fiches_reparation(id, created_at)');
      if (error) {
        toast.error('Erreur chargement clients: ' + error.message);
      } else {
        setClients(data);
      }
      setLoading(false);
    };
    fetchClients();
  }, []);

  // derive filtered and sorted clients
  const displayedClients = useMemo(() => {
    let filtered = clients.filter(c =>
      c.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (c.telephone && c.telephone.includes(searchTerm))
    );
    if (sortDescByCount) {
      filtered.sort((a, b) => b.fiches_reparation.length - a.fiches_reparation.length);
    }
    return filtered;
  }, [clients, searchTerm, sortDescByCount]);

  return (
    <Box sx={{ minHeight: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', gap: 2, mx: { xs: -2, sm: -3 } }}>
      <Typography variant="h4" sx={{ fontWeight: 800 }}>Clients</Typography>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
        <TextField
          label="Rechercher..."
          variant="outlined"
          size="small"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Button
          variant="outlined"
          size="small"
          onClick={() => setSortDescByCount(prev => !prev)}
        >
          {sortDescByCount ? 'Réparations ↑' : 'Top Réparations ↓'}
        </Button>
      </Box>
      <Paper sx={{ flex: 1, p: 2, mx: { xs: 2, sm: 3 } }}>
        <TableContainer sx={{ maxHeight: { xs: 420, md: 600 }, overflowX: 'auto' }}>
          <Table stickyHeader size="small" sx={{ minWidth: 650 }}>
            <TableHead>
              <TableRow>
                <TableCell>Réparations</TableCell>
                <TableCell>Nom</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Email</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Téléphone</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} align="center">Chargement...</TableCell></TableRow>
              ) : displayedClients.length === 0 ? (
                <TableRow><TableCell colSpan={5} align="center">Aucun client</TableCell></TableRow>
              ) : (
                displayedClients.map(c => (
                  <TableRow key={c.id} hover>
                    <TableCell>{c.fiches_reparation.length}</TableCell>
                    <TableCell>{c.nom}</TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{c.email || '—'}</TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{c.telephone || '—'}</TableCell>
                    <TableCell>
                      <Button component={Link} to={`/clients/${c.id}`} variant="outlined" size="small">
                        Voir historique
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}

export default Clients;
