// src/App.jsx
import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import AjouterProduitForm from './AjouterProduitForm';
import './App.css';
import { Box, Paper, Typography, Table, TableHead, TableRow, TableCell, TableBody, TextField, IconButton, Button } from '@mui/material';
import { Delete, Edit, Save, Cancel, PictureAsPdf } from '@mui/icons-material';
import Grid from '@mui/material/Grid';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function App() {
  const [inventaire, setInventaire] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});

  const getInventaire = async () => {
    try {
      setChargement(true);
      let { data, error } = await supabase.from('inventaire').select('*');
      if (error) throw error;
      if (data) setInventaire(data);
    } catch (error) {
      console.error("Erreur lors de la récupération de l'inventaire:", error.message);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    getInventaire();
  }, []);

  const handleProduitAjoute = () => {
    getInventaire();
  };

  const handleDelete = async (id) => {
    try {
      const { error } = await supabase.from('inventaire').delete().eq('id', id);
      if (error) throw error;
      getInventaire();
    } catch (error) {
      console.error("Erreur lors de la suppression:", error.message);
    }
  };

  const handleEdit = (produit) => {
    setEditingId(produit.id);
    setEditValues({
      nom: produit.nom,
      sku: produit.sku,
      quantite_stock: produit.quantite_stock,
      prix_achat: produit.prix_achat,
      prix_vente: produit.prix_vente,
      type_article: produit.type_article
    });
  };

  const handleSave = async (id) => {
    try {
      const { error } = await supabase
        .from('inventaire')
        .update({
          nom: editValues.nom,
          sku: editValues.sku,
          quantite_stock: parseInt(editValues.quantite_stock),
          prix_achat: parseFloat(editValues.prix_achat),
          prix_vente: parseFloat(editValues.prix_vente),
          type_article: editValues.type_article
        })
        .eq('id', id);
      
      if (error) throw error;
      setEditingId(null);
      setEditValues({});
      getInventaire();
    } catch (error) {
      console.error("Erreur lors de la mise à jour:", error.message);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditValues({});
  };

  const filteredInventaire = inventaire.filter(produit =>
    produit.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (produit.sku && produit.sku.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const generatePDF = () => {
    const doc = new jsPDF();
    
    // Header with app name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Mizania+ - Rapport d\'Inventaire', 14, 22);
    doc.setLineWidth(0.5);
    doc.line(14, 26, 196, 26);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    
    // Date
    doc.setFontSize(12);
    doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 14, 32);
    doc.text(`Nombre de produits: ${filteredInventaire.length}`, 14, 40);
    
    // Table data
    const tableData = filteredInventaire.map(produit => {
      const pa = Number(produit.prix_achat || 0);
      const pv = Number(produit.prix_vente || 0);
      const marge = pv - pa;
      
      return [
        produit.nom,
        produit.sku || '—',
        produit.quantite_stock.toString(),
        `${pa.toFixed(2)} €`,
        `${pv.toFixed(2)} €`,
        `${marge.toFixed(2)} €`,
        produit.type_article
      ];
    });
    
    // Generate table
    autoTable(doc, {
      head: [['Nom', 'SKU', 'Stock', 'Prix Achat', 'Prix Vente', 'Marge', 'Type']],
      body: tableData,
      startY: 50,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] }
    });
    
    // Save PDF
    doc.save(`inventaire_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleExportPDF = () => {
    try {
      console.log('Starting PDF export...');
      
      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(16);
      doc.text('Rapport d\'Inventaire', 14, 20);
      
      doc.setFontSize(10);
      doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 14, 30);
      doc.text(`Total produits: ${filteredInventaire.length}`, 14, 35);
      
      console.log('Header added, checking autoTable availability...');
      console.log('autoTable type:', typeof autoTable);
      
      // Try to use autoTable, but fallback to simple text if it fails
      try {
        if (typeof autoTable === 'function') {
          console.log('autoTable available, creating table...');
          
          // Simple table data
          const tableData = filteredInventaire.map(produit => [
            produit.nom || '',
            produit.sku || '-',
            produit.quantite_stock?.toString() || '0',
            (produit.prix_achat || 0).toString() + ' €',
            (produit.prix_vente || 0).toString() + ' €',
            produit.type_article || ''
          ]);
          
          console.log('Table data prepared:', tableData.length, 'rows');
          
          // Create table
          autoTable(doc, {
            head: [['Nom', 'SKU', 'Stock', 'Prix Achat', 'Prix Vente', 'Type']],
            body: tableData,
            startY: 45,
            styles: { fontSize: 8 }
          });
          
          console.log('Table created with autoTable');
        } else {
          throw new Error('autoTable not available');
        }
      } catch (tableError) {
        console.log('autoTable failed, using simple text layout:', tableError.message);
        
        // Fallback: Simple text list
        let yPosition = 45;
        doc.setFontSize(8);
        
        // Headers
        doc.text('Nom', 14, yPosition);
        doc.text('SKU', 80, yPosition);
        doc.text('Stock', 120, yPosition);
        doc.text('Prix Achat', 140, yPosition);
        doc.text('Prix Vente', 170, yPosition);
        
        yPosition += 10;
        
        // Data rows
        filteredInventaire.forEach((produit) => {
          if (yPosition > 280) { // New page if needed
            doc.addPage();
            yPosition = 20;
          }
          
          doc.text(produit.nom || '', 14, yPosition);
          doc.text(produit.sku || '-', 80, yPosition);
          doc.text(produit.quantite_stock?.toString() || '0', 120, yPosition);
          doc.text((produit.prix_achat || 0).toString() + ' €', 140, yPosition);
          doc.text((produit.prix_vente || 0).toString() + ' €', 170, yPosition);
          
          yPosition += 8;
        });
        
        console.log('Simple text list created');
      }
      
      console.log('Saving PDF...');
      
      // Save the PDF
      const filename = `inventaire-${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
      
      console.log('PDF saved:', filename);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Erreur lors de la génération du PDF: ' + error.message);
    }
  };

  return (
    <Box sx={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header */}
      <Box sx={{ flexShrink: 0 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 2 }}>
          Gestion de l'Inventaire
        </Typography>
        
        {/* Search Bar */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder="Rechercher par nom ou SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            size="small"
          />
          <Button
            variant="outlined"
            startIcon={<PictureAsPdf />}
            onClick={handleExportPDF}
            sx={{ minWidth: 160 }}
          >
            Export PDF
          </Button>
        </Box>
      </Box>

      {/* Main Content - Horizontal Layout */}
      <Box sx={{ 
        flex: 1, 
        display: 'flex', 
        gap: 2, 
        minHeight: 0,
        flexDirection: { xs: 'column', lg: 'row' }
      }}>
        {/* Add Product Form - Left Side */}
        <Box sx={{ 
          width: { xs: '100%', lg: '300px' },
          flexShrink: 0
        }}>
          <Paper sx={{ p: 2, height: '100%', overflow: 'auto' }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              Ajouter un Produit
            </Typography>
            <AjouterProduitForm onProduitAjoute={handleProduitAjoute} />
          </Paper>
        </Box>

        {/* Inventory Table - Right Side */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Paper sx={{ 
            height: '100%',
            display: 'flex', 
            flexDirection: 'column', 
            overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(15,23,42,0.06)' 
          }}>
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Inventaire ({filteredInventaire.length} produits)
              </Typography>
            </Box>
            
            {chargement ? (
              <Box sx={{ 
                flex: 1, 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center' 
              }}>
                <Typography>Chargement...</Typography>
              </Box>
            ) : (
              <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold', bgcolor: 'background.paper' }}>Nom</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', bgcolor: 'background.paper' }}>SKU</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', bgcolor: 'background.paper' }}>Stock</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'background.paper' }}>Prix d'achat (€)</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'background.paper' }}>Prix de Vente (€)</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'background.paper' }}>Marge (€)</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', bgcolor: 'background.paper' }}>Type</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', bgcolor: 'background.paper' }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredInventaire.map((produit) => {
                      const pa = Number(produit.prix_achat || 0);
                      const pv = Number(produit.prix_vente || 0);
                      const marge = pv - pa;
                      const isEditing = editingId === produit.id;
                      
                      return (
                        <TableRow key={produit.id} hover>
                          <TableCell>
                            {isEditing ? (
                              <TextField
                                size="small"
                                value={editValues.nom || ''}
                                onChange={(e) => setEditValues({...editValues, nom: e.target.value})}
                                sx={{ minWidth: 120 }}
                              />
                            ) : (
                              produit.nom
                            )}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <TextField
                                size="small"
                                value={editValues.sku || ''}
                                onChange={(e) => setEditValues({...editValues, sku: e.target.value})}
                                sx={{ minWidth: 100 }}
                              />
                            ) : (
                              produit.sku || '—'
                            )}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <TextField
                                size="small"
                                type="number"
                                value={editValues.quantite_stock || ''}
                                onChange={(e) => setEditValues({...editValues, quantite_stock: e.target.value})}
                                sx={{ minWidth: 80 }}
                              />
                            ) : (
                              <Box sx={{ 
                                color: produit.quantite_stock < 5 ? '#EF4444' : 'inherit',
                                fontWeight: produit.quantite_stock < 5 ? 'bold' : 'normal'
                              }}>
                                {produit.quantite_stock}
                              </Box>
                            )}
                          </TableCell>
                          <TableCell align="right">
                            {isEditing ? (
                              <TextField
                                size="small"
                                type="number"
                                value={editValues.prix_achat || ''}
                                onChange={(e) => setEditValues({...editValues, prix_achat: e.target.value})}
                                sx={{ minWidth: 100 }}
                              />
                            ) : (
                              `${pa.toFixed(2)} €`
                            )}
                          </TableCell>
                          <TableCell align="right">
                            {isEditing ? (
                              <TextField
                                size="small"
                                type="number"
                                value={editValues.prix_vente || ''}
                                onChange={(e) => setEditValues({...editValues, prix_vente: e.target.value})}
                                sx={{ minWidth: 100 }}
                              />
                            ) : (
                              `${pv.toFixed(2)} €`
                            )}
                          </TableCell>
                          <TableCell align="right" sx={{ 
                            color: marge > 0 ? '#22C55E' : '#EF4444',
                            fontWeight: 'bold'
                          }}>
                            {marge.toFixed(2)} €
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <TextField
                                size="small"
                                select
                                SelectProps={{ native: true }}
                                value={editValues.type_article || ''}
                                onChange={(e) => setEditValues({...editValues, type_article: e.target.value})}
                                sx={{ minWidth: 140 }}
                              >
                                <option value="Produit de Vente">Produit de Vente</option>
                                <option value="Service">Service</option>
                                <option value="Pièce Détachée">Pièce Détachée</option>
                              </TextField>
                            ) : (
                              produit.type_article
                            )}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Box sx={{ display: 'flex', gap: 0.5 }}>
                                <IconButton 
                                  size="small" 
                                  color="primary"
                                  onClick={() => handleSave(produit.id)}
                                >
                                  <Save />
                                </IconButton>
                                <IconButton 
                                  size="small" 
                                  color="secondary"
                                  onClick={handleCancel}
                                >
                                  <Cancel />
                                </IconButton>
                              </Box>
                            ) : (
                              <Box sx={{ display: 'flex', gap: 0.5 }}>
                                <IconButton 
                                  size="small" 
                                  color="primary"
                                  onClick={() => handleEdit(produit)}
                                >
                                  <Edit />
                                </IconButton>
                                <IconButton 
                                  size="small" 
                                  color="error"
                                  onClick={() => handleDelete(produit.id)}
                                >
                                  <Delete />
                                </IconButton>
                              </Box>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredInventaire.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                          {searchTerm ? 'Aucun produit trouvé pour cette recherche' : 'Aucun produit dans l\'inventaire'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>
            )}
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}

export default App;