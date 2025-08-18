// src/AjouterDepenseForm.jsx
import { useState } from 'react';
import { supabase } from './supabaseClient';
import { toast } from 'react-toastify';
import { Box, TextField, Button, Typography, Paper, Stack } from '@mui/material';

function AjouterDepenseForm({ onDepenseAjoutee }) {
  const [montant, setMontant] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('transactions').insert({
        type: 'Dépense',
        source: 'Manuel',
        montant: parseFloat(montant),
        description
      });
      if (error) throw error;
      toast.success('Dépense enregistrée !');
      setMontant('');
      setDescription('');
      onDepenseAjoutee && onDepenseAjoutee();
    } catch (error) {
      toast.error('Erreur : ' + error.message);
    }
  };

  return (
    <Paper elevation={0} sx={{ p: 2.5, border: '1px solid #E2E8F0', borderRadius: 2 }}>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>Enregistrer une Dépense</Typography>
      <Box component="form" onSubmit={handleSubmit}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
          <TextField
            label="Montant (€)"
            type="number"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            required
            fullWidth
            inputProps={{ step: '0.01', min: '0' }}
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            fullWidth
          />
        </Stack>
        <Button type="submit" variant="contained" size="large">
          Ajouter Dépense
        </Button>
      </Box>
    </Paper>
  );
}
export default AjouterDepenseForm;