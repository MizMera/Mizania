// src/AjouterProduitForm.jsx
import { useState } from 'react';
import { supabase } from './supabaseClient';
import { toast } from 'react-toastify';

// Importer les composants MUI
import { TextField, Button, Select, MenuItem, FormControl, InputLabel, Box, Typography } from '@mui/material';

function AjouterProduitForm({ onProduitAjoute }) {
  const [nom, setNom] = useState('');
  const [sku, setSku] = useState('');
  const [prix_vente, setPrixVente] = useState('');
  const [prix_achat, setPrixAchat] = useState('');
  const [quantite_stock, setQuantiteStock] = useState('');
  const [type_article, setTypeArticle] = useState('Produit de Vente');

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const payload = {
        nom,
        sku,
        prix_vente: parseFloat(prix_vente || 0),
        prix_achat: parseFloat(prix_achat || 0),
        quantite_stock: parseInt(quantite_stock || 0, 10),
        type_article
      };

      const { error } = await supabase
        .from('inventaire')
        .insert([payload]);
      
      if (error) throw error;
      
      toast.success('Produit ajouté avec succès !');
      setNom('');
      setSku('');
      setPrixVente('');
      setPrixAchat('');
      setQuantiteStock('');
      setTypeArticle('Produit de Vente');

      if (onProduitAjoute) {
        onProduitAjoute();
      } 

    } catch (error) {   
      toast.error("Erreur lors de l'ajout du produit: " + error.message);
    }
  };

  return (
    <Box 
      component="form" 
      onSubmit={handleSubmit} 
      sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: 1.5
      }}
    >
      <TextField 
        label="Nom du produit" 
        variant="outlined" 
        value={nom} 
        onChange={(e) => setNom(e.target.value)} 
        required 
        fullWidth
        size="small"
      />
      
      <TextField 
        label="SKU (Référence)" 
        variant="outlined" 
        value={sku} 
        onChange={(e) => setSku(e.target.value)} 
        fullWidth
        size="small"
      />
      
        <TextField
            label="Prix d'achat (DT)"
        type="number" 
        variant="outlined" 
        value={prix_achat}
        onChange={(e) => setPrixAchat(e.target.value)} 
        required 
        fullWidth
        inputProps={{ step: "0.01", min: "0" }}
        size="small"
      />

        <TextField
            label="Prix de vente (DT)"
        type="number" 
        variant="outlined" 
        value={prix_vente} 
        onChange={(e) => setPrixVente(e.target.value)} 
        required 
        fullWidth
        inputProps={{ step: "0.01", min: "0" }}
        size="small"
      />
      
      <TextField 
        label="Quantité en stock" 
        type="number" 
        variant="outlined" 
        value={quantite_stock} 
        onChange={(e) => setQuantiteStock(e.target.value)} 
        required 
        fullWidth
        inputProps={{ min: "0" }}
        size="small"
      />
      
      <FormControl fullWidth size="small">
        <InputLabel>Type d'article</InputLabel>
        <Select 
          value={type_article} 
          label="Type d'article" 
          onChange={(e) => setTypeArticle(e.target.value)}
        >
          <MenuItem value="Produit de Vente">Produit de Vente</MenuItem>
          <MenuItem value="Pièce de Réparation">Pièce de Réparation</MenuItem>
        </Select>
      </FormControl>
      
      <Button 
        type="submit" 
        variant="contained" 
        color="primary"
        size="small"
        sx={{ mt: 1 }}
      >
        Ajouter à l'inventaire
      </Button>
    </Box>
  );
}

export default AjouterProduitForm;