// src/AjouterDetailFiche.jsx
import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { toast } from 'react-toastify';
import { Box, Stack, TextField, FormControl, InputLabel, Select, MenuItem, Button, Typography, InputAdornment, CircularProgress } from '@mui/material';
import { AddCircleOutline } from '@mui/icons-material';

function AjouterDetailFiche({ ficheId, onDetailAjoute }) {
  const [typeElement, setTypeElement] = useState('Pièce');
  const [piecesDisponibles, setPiecesDisponibles] = useState([]);
  const [loadingPieces, setLoadingPieces] = useState(false);
  
  const [pieceId, setPieceId] = useState('');
  const [description, setDescription] = useState('');
  const [quantite, setQuantite] = useState(1);
  const [prix, setPrix] = useState(0);

  useEffect(() => {
    async function chargerPieces() {
      try {
        setLoadingPieces(true);
        const { data, error } = await supabase
          .from('inventaire')
          .select('*')
          .eq('type_article', 'Pièce de Réparation');
        if (error) throw error;
        setPiecesDisponibles(data || []);
      } catch (err) {
        console.error(err);
        toast.error("Erreur lors du chargement des pièces.");
      } finally {
        setLoadingPieces(false);
      }
    }
    chargerPieces();
  }, []);

  useEffect(() => {
    if (typeElement === 'Pièce' && pieceId) {
      const pieceChoisie = piecesDisponibles.find(p => p.id === parseInt(pieceId));
      if (pieceChoisie) {
        setPrix(pieceChoisie.prix_vente);
        setDescription(pieceChoisie.nom);
      }
    }
  }, [pieceId, typeElement, piecesDisponibles]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description || Number(quantite) <= 0 || Number(prix) < 0) {
      toast.error("Veuillez renseigner une description, une quantité (>0) et un prix (≥0).");
      return;
    }

    try {
      const { error } = await supabase.from('details_fiche').insert({
        fiche_id: ficheId,
        type_element: typeElement,
        description: description,
        quantite: parseInt(quantite),
        prix: parseFloat(prix),
        element_id: typeElement === 'Pièce' ? pieceId : null,
      });

      if (error) throw error;
      toast.success("Élément ajouté à la fiche !");
      onDetailAjoute?.();
      setPieceId('');
      setDescription('');
      setQuantite(1);
      setPrix(0);
    } catch (error) {
      toast.error("Erreur : " + error.message);
    }
  };

  const pieceChoisie = piecesDisponibles.find(p => p.id === parseInt(pieceId));

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Ajouter à la Facture</Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <FormControl fullWidth size="small">
          <InputLabel id="type-element-label">Type</InputLabel>
          <Select
            labelId="type-element-label"
            value={typeElement}
            label="Type"
            onChange={(e) => {
              setTypeElement(e.target.value);
              // Reset fields when switching type
              setPieceId('');
              if (e.target.value !== 'Pièce') {
                setDescription('');
                setPrix(0);
              }
            }}
          >
            <MenuItem value="Pièce">Pièce Détachée</MenuItem>
            <MenuItem value="Main d'œuvre">Main d'œuvre</MenuItem>
          </Select>
        </FormControl>

        {typeElement === 'Pièce' ? (
          <FormControl fullWidth size="small" disabled={loadingPieces}>
            <InputLabel id="piece-label">Pièce</InputLabel>
            <Select
              labelId="piece-label"
              value={pieceId}
              label="Pièce"
              onChange={(e) => setPieceId(e.target.value)}
              required
            >
              <MenuItem value=""><em>-- Choisir une pièce --</em></MenuItem>
              {piecesDisponibles.map(p => (
                <MenuItem key={p.id} value={String(p.id)}>
                  {p.nom} — Stock: {p.quantite_stock}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : (
          <TextField
            fullWidth
            size="small"
            label="Description (ex: Installation Windows)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        )}
      </Stack>

      {typeElement === 'Pièce' && (
        <Typography variant="caption" color="text.secondary">
          {loadingPieces ? 'Chargement du stock…' : pieceChoisie ? `Stock disponible: ${pieceChoisie.quantite_stock}` : 'Sélectionnez une pièce pour voir le stock et le prix.'}
        </Typography>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          fullWidth
          size="small"
          type="number"
          label="Quantité"
          value={quantite}
          onChange={(e) => setQuantite(e.target.value)}
          inputProps={{ min: 1 }}
          required
        />
        <TextField
          fullWidth
          size="small"
          type="number"
          label="Prix Unitaire"
          value={prix}
          onChange={(e) => setPrix(e.target.value)}
          inputProps={{ min: 0, step: 0.01 }}
          InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }}
          required
        />
      </Stack>

      <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={1}>
        {loadingPieces && <CircularProgress size={18} />}
        <Button type="submit" variant="contained" startIcon={<AddCircleOutline />} size="small" disableElevation>
          Ajouter
        </Button>
      </Stack>
    </Box>
  );
}

export default AjouterDetailFiche;