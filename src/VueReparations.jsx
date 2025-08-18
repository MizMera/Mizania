// src/VueReparations.jsx
import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Box, Typography, Paper, Button, Table, TableHead, TableRow, TableCell, TableBody, Stack, Chip, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { PictureAsPdf, ArrowUpward, ArrowDownward } from '@mui/icons-material';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function VueReparations() {
  const [fiches, setFiches] = useState([]);
  const [chargement, setChargement] = useState(true);
  // Sorting state
  const [sortBy, setSortBy] = useState('created_at'); // 'created_at' | 'statut' | 'client' | 'id'
  const [sortDir, setSortDir] = useState('desc'); // 'asc' | 'desc'

  // Fonction pour récupérer les fiches (réutilisable)
  const getFiches = async () => {
    try {
      setChargement(true);
      const { data, error } = await supabase
        .from('fiches_reparation')
        .select(`
          *,
          clients ( nom, telephone )
        `)
        .order('created_at', { ascending: false }); // Trier par date de création
    
      if (error) throw error;
      setFiches(data || []);
    } catch (error) {
      console.error("Erreur:", error.message);
      toast.error("Erreur lors du chargement des fiches");
    } finally {
      setChargement(false);
    }
  };

  // Derived sorted list
  const sortedFiches = useMemo(() => {
    const arr = [...fiches];
    arr.sort((a, b) => {
      let va, vb, cmp = 0;
      switch (sortBy) {
        case 'client':
          va = (a.clients?.nom || '').toLowerCase();
          vb = (b.clients?.nom || '').toLowerCase();
          cmp = va.localeCompare(vb);
          break;
        case 'statut':
          va = (a.statut || '').toLowerCase();
          vb = (b.statut || '').toLowerCase();
          cmp = va.localeCompare(vb);
          break;
        case 'id':
          cmp = (a.id || 0) - (b.id || 0);
          break;
        case 'created_at':
        default:
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [fiches, sortBy, sortDir]);

  useEffect(() => {
    // Chargement initial
    getFiches();

    // Configuration de l'écoute en temps réel
    const channel = supabase
      .channel('fiches_reparation_changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Écouter tous les événements (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'fiches_reparation'
        },
        (payload) => {
          console.log('Changement détecté:', payload);
          
          switch (payload.eventType) {
            case 'INSERT':
              // Nouvelle fiche créée
              toast.info('Nouvelle fiche de réparation créée');
              getFiches(); // Recharger pour avoir les données complètes avec client  
              break;
              
            case 'UPDATE':
              // Fiche mise à jour
              setFiches(currentFiches => 
                currentFiches.map(fiche => 
                  fiche.id === payload.new.id 
                    ? { ...fiche, ...payload.new }
                    : fiche
                )
              );
              toast.info(`Fiche #${payload.new.id} mise à jour`);
              break;
              
            case 'DELETE':
              // Fiche supprimée
              setFiches(currentFiches => 
                currentFiches.filter(fiche => fiche.id !== payload.old.id)
              );
              toast.info(`Fiche #${payload.old.id} supprimée`);
              break;
              
            default:
              break;
          }
        }
      )
      .subscribe();

    // Nettoyage de la souscription au démontage du composant
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Fonction pour rafraîchir manuellement
  const handleRefresh = () => {
    toast.info('Actualisation en cours...');
    getFiches();
  };

  const generateRepairsPDF = () => {
    try {
      console.log('Starting PDF generation...');
      
      const doc = new jsPDF();
      
      // Header
      doc.setFont('helvetica','bold');
      doc.setFontSize(18);
      doc.text('Mizania+ - Rapport des Réparations', 14, 20);
      doc.setLineWidth(0.5);
      doc.line(14, 24, 196, 24);

      // Summary
      doc.setFont('helvetica','normal');
      doc.setFontSize(12);
      doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 14, 32);
      doc.text(`Nombre de fiches: ${fiches.length}`, 14, 40);
      // separator before stats
      doc.setLineWidth(0.5);
      doc.line(14, 44, 196, 44);

      // Statistics
      const stats = {
        enAttente: fiches.filter(f => f.statut === 'Reçu').length,
        enCours: fiches.filter(f => f.statut === 'En cours').length,
        termine: fiches.filter(f => f.statut === 'Terminé').length
      };

      doc.setFontSize(14);
      doc.text('Répartition par statut:', 14, 54);
      doc.setFontSize(11);
      doc.text(`Reçu: ${stats.enAttente}`, 20, 64);
      doc.text(`En cours: ${stats.enCours}`, 20, 72);
      doc.text(`Terminé: ${stats.termine}`, 20, 80);

      // Table
      autoTable(doc, {
        startY: 88,
        head: [['ID','Client','Appareil','Statut','Date']],
        body: sortedFiches.map(f => [
          String(f.id),
          f.clients?.nom || '—',
          f.appareil_description || '—',
          f.statut || '—',
          new Date(f.created_at).toLocaleDateString('fr-FR')
        ]),
        theme: 'striped',
        headStyles: { fillColor: [99,102,241], textColor: 255, halign: 'center' },
        styles: { fontSize: 9 }
      });

      console.log('Saving PDF...');
      doc.save(`reparations-${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('Rapport PDF généré avec succès!');
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Erreur lors de la génération du PDF: ' + error.message);
    }
  };

  const statutChip = (statut) => {
    const map = {
      'Reçu': { color: 'info', label: 'Reçu' },
      'En cours': { color: 'warning', label: 'En cours' },
      'Terminé': { color: 'success', label: 'Terminé' },
    };
    const cfg = map[statut] || { color: 'default', label: statut };
    return <Chip size="small" color={cfg.color} label={cfg.label} variant={cfg.color === 'default' ? 'outlined' : 'filled'} />;
  };

  if (chargement) {
    return (
      <Box sx={{ 
        height: 'calc(100vh - 100px)', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center' 
      }}>
        <Typography>Chargement des fiches de réparation...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header */}
      <Box sx={{ flexShrink: 0 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" sx={{ gap: 2 }}>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>Réparations</Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'stretch', md: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="sort-by-label">Trier par</InputLabel>
              <Select
                labelId="sort-by-label"
                id="sort-by"
                value={sortBy}
                label="Trier par"
                onChange={(e) => setSortBy(e.target.value)}
              >
                <MenuItem value="created_at">Date</MenuItem>
                <MenuItem value="statut">Statut</MenuItem>
                <MenuItem value="client">Client</MenuItem>
                <MenuItem value="id">ID</MenuItem>
              </Select>
            </FormControl>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
              startIcon={sortDir === 'asc' ? <ArrowUpward /> : <ArrowDownward />}
            >
              {sortDir === 'asc' ? 'Asc' : 'Desc'}
            </Button>
            <Button 
              variant="contained" 
              startIcon={<PictureAsPdf />} 
              onClick={generateRepairsPDF}
              color="error"
              size="small"
            >
              Export PDF
            </Button>
            <Button variant="outlined" onClick={getFiches}>Actualiser</Button>
            <Button component={Link} to="/reparations/nouveau" variant="contained">+ Nouvelle Fiche</Button>
          </Stack>
        </Stack>
      </Box>

      {/* Repairs Table */}
      <Paper sx={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(15,23,42,0.06)' 
      }}>
        {fiches.length === 0 ? (
          <Box sx={{ 
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center', 
            textAlign: 'center', 
            py: 6, 
            color: 'text.secondary' 
          }}>
            <Typography variant="h6" gutterBottom>Aucune fiche de réparation trouvée.</Typography>
            <Button component={Link} to="/reparations/nouveau" sx={{ mt: 2 }} variant="contained">
              Créer la première fiche
            </Button>
          </Box>
        ) : (
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>ID</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Client</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Téléphone</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Appareil</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Problème</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>Statut</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedFiches.map((fiche) => (
                  <TableRow key={fiche.id} hover>
                    <TableCell sx={{ fontWeight: 'bold' }}>#{fiche.id}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{fiche.clients?.nom || 'Client supprimé'}</TableCell>
                    <TableCell>{fiche.clients?.telephone || 'N/A'}</TableCell>
                    <TableCell>{fiche.appareil_description}</TableCell>
                    <TableCell sx={{ 
                      maxWidth: 300, 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      whiteSpace: 'nowrap' 
                    }}>
                      {fiche.probleme_signale}
                    </TableCell>
                    <TableCell align="center">{statutChip(fiche.statut)}</TableCell>
                    <TableCell align="center">
                      <Button 
                        size="small" 
                        component={Link} 
                        to={`/reparations/${fiche.id}`} 
                        variant="contained"
                      >
                        Voir Détails
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>
    </Box>
  );
}

export default VueReparations;