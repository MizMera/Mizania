import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import AjouterDetailFiche from './AjouterDetailFiche';
import { toast } from 'react-toastify';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Stack,
  TextField,
  Chip,
  Divider,
  CircularProgress,
  TableContainer
} from '@mui/material';
import { Print as PrintIcon, Payment as PaymentIcon, Edit, Save, Cancel, DeleteOutline } from '@mui/icons-material';

function DetailFiche() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [fiche, setFiche] = useState(null);
  const [details, setDetails] = useState([]);
  const [chargement, setChargement] = useState(true);
  // Invoice settings
  const [businessName, setBusinessName] = useState('Mizania+');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0,10));
  const [tvaPercent, setTvaPercent] = useState(20);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({ description: '', quantite: 1, prixTotal: 0 });

  const handleFinaliser = async () => {
    const totalFinal = calculerTotal();
    if (totalFinal <= 0) {
      toast.error("Impossible de finaliser une facture vide.");
      return;
    }
    
    if (!window.confirm(`Confirmez-vous la facturation de ${totalFinal.toFixed(2)} DT ?`)) {
      return;
    }
    
    try {
      // Récupération de l'utilisateur pour journaliser la transaction
      const { data: { user } } = await supabase.auth.getUser();

      // Marquer la fiche comme terminée
      const { error: ficheError } = await supabase
        .from('fiches_reparation')
        .update({ statut: 'Terminé' })
        .eq('id', fiche.id);
      if (ficheError) throw ficheError;

      // Pièces utilisées sur la fiche
      const piecesUtilisees = details.filter(d => d.type_element === 'Pièce');

      // Mettre à jour le stock pour chaque pièce utilisée
      for (const piece of piecesUtilisees) {
        if (piece.element_id) {
          const { data: inventaireActuel } = await supabase
            .from('inventaire')
            .select('quantite_stock')
            .eq('id', piece.element_id)
            .single();
          
          if (inventaireActuel) {
            const nouveauStock = inventaireActuel.quantite_stock - piece.quantite;
            await supabase
              .from('inventaire')
              .update({ quantite_stock: nouveauStock })
              .eq('id', piece.element_id);
          }
        }
      }

      // Calculer le coût total des pièces (prix_achat)
      let coutTotalReparation = 0;
      const pieceIds = piecesUtilisees.map(p => p.element_id).filter(Boolean);
      if (pieceIds.length > 0) {
        const { data: piecesData, error: coutsError } = await supabase
          .from('inventaire')
          .select('id, prix_achat')
          .in('id', pieceIds);
        if (coutsError) throw coutsError;
        const prixAchatMap = new Map(piecesData.map(p => [p.id, p.prix_achat || 0]));
        coutTotalReparation = piecesUtilisees.reduce((sum, item) => sum + ((prixAchatMap.get(item.element_id) || 0) * item.quantite), 0);
      }
      
      // Créer la transaction financière avec le coût total
      const { error: transactionError } = await supabase
        .from('transactions')
        .insert({
          type: 'Revenu',
          source: 'Paiement Réparation',
          montant: totalFinal,
          cout_total: coutTotalReparation,
          description: `Facture pour fiche de réparation #${fiche.id} | Client: ${fiche.clients?.nom || '—'} | Articles: ${details.map(d => `${d.description} x${d.quantite}`).join(', ')}`,
          user_id: user?.id || null
        });
      if (transactionError) throw transactionError;

      toast.success('Réparation finalisée et facturée avec succès !');
      navigate('/reparations');

    } catch (error) {
      toast.error("Erreur lors de la finalisation: " + error.message);
    }
  };

  // Fonction pour récupérer toutes les données de la fiche
  const getFicheDetails = async () => {
    try {
      setChargement(true);
      // Récupérer la fiche et les infos client
      const { data: ficheData, error: ficheError } = await supabase
        .from('fiches_reparation')
        .select('*, clients(*)')
        .eq('id', id)
        .single();
      if (ficheError) throw ficheError;
      setFiche(ficheData);

      // Récupérer les lignes de détails (pièces et main d'oeuvre)
      const { data: detailsData, error: detailsError } = await supabase
        .from('details_fiche')
        .select('*')
        .eq('fiche_id', id);
      if (detailsError) throw detailsError;
      setDetails(detailsData);

    } catch (error) {
      console.error(error.message);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    getFicheDetails();
  }, [id]);

  const calculerTotal = () => {
    return details.reduce((total, item) => total + item.prix * item.quantite, 0);
  };

  // Impression de la facture en PDF
  const handlePrint = () => {
    try {
      if (!fiche) return;
      
      const doc = new jsPDF();

      // Header
      doc.setFont('helvetica','bold');
      doc.setFontSize(18);
      doc.text(`${businessName} - Facture #${fiche.id}`, 14, 20);
      doc.setLineWidth(0.5);
      doc.line(14, 24, 196, 24);
      // Metadata
      doc.setFont('helvetica','normal');
      doc.setFontSize(12);
      doc.text(`Date: ${invoiceDate}`, 14, 32);
      
      // Client & device
      if (fiche.clients) {
        doc.text(`Client: ${fiche.clients.nom || ''}`, 14, 40);
      }
      doc.text(`Appareil: ${fiche.appareil_description || ''}`, 14, 48);

      // Items table with totals and TVA in footer
      const totalHT = calculerTotal();
      const montantTVA = totalHT * (tvaPercent / 100);
      const totalTTC = totalHT + montantTVA;
      const tableData = details.map(d => [
        d.description,
        d.quantite.toString(),
        `${Number(d.prix).toFixed(2)} DT`,
        `${(Number(d.prix) * Number(d.quantite)).toFixed(2)} DT`
      ]);
      autoTable(doc, {
        startY: 56,
        theme: 'grid',
        head: [['Description', 'Quantité', 'Prix Unitaire', 'Total']],
        body: tableData,
        foot: [
          ['Total HT', '', '', `${totalHT.toFixed(2)} DT`],
          [`TVA (${tvaPercent}%)`, '', '', `${montantTVA.toFixed(2)} DT`],
          ['Total TTC', '', '', `${totalTTC.toFixed(2)} DT`]
        ],
        styles: { fontSize: 10, textColor: 40 },
        headStyles: { fillColor: [99,102,241], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [99,102,241], textColor: 255, fontStyle: 'bold' },
        bodyStyles: { textColor: 30 },
        columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } }
      });

      // Signature line below table
      const finalY = doc.lastAutoTable.finalY || 56;
      const sigY = finalY + 20;
      doc.setLineWidth(0.1);
      doc.line(14, sigY, 80, sigY);
      doc.text('Signature', 14, sigY + 5);
      
      const filename = `facture-${fiche.id}.pdf`;
      doc.save(filename);
      
    } catch (error) {
      console.error('Error printing invoice:', error);
      alert('Erreur lors de l\'impression de la facture: ' + error.message);
    }
  };

  const startEdit = (detail) => {
    setEditingId(detail.id);
    setEditValues({ description: detail.description, quantite: detail.quantite, prixTotal: detail.prix });
  };
  const cancelEdit = () => { setEditingId(null); };
  const saveEdit = async (detail) => {
    try {
      const quantite = Math.max(1, Number(editValues.quantite) || 1);
      const prixTotal = Math.max(0, Number(editValues.prixTotal) || 0);
      const { error } = await supabase
        .from('details_fiche')
        .update({ description: editValues.description, quantite, prix: prixTotal })
        .eq('id', detail.id);
      if (error) throw error;
      toast.success('Ligne mise à jour');
      setEditingId(null);
      // Optimistic update
      setDetails(prev => prev.map(d => d.id === detail.id ? { ...d, description: editValues.description, quantite, prix: prixTotal } : d));
    } catch (e) {
      toast.error('Erreur mise à jour: ' + e.message);
    }
  };
  const deleteDetail = async (detail) => {
    if (!window.confirm('Supprimer cet élément ?')) return;
    try {
      const { error } = await supabase.from('details_fiche').delete().eq('id', detail.id);
      if (error) throw error;
      toast.success('Ligne supprimée');
      setDetails(prev => prev.filter(d => d.id !== detail.id));
    } catch (e) {
      toast.error('Erreur suppression: ' + e.message);
    }
  };

  if (chargement) {
    return (
      <Box sx={{ 
        height: 'calc(100vh - 100px)', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center' 
      }}>
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (!fiche) {
    return (
      <Box sx={{ 
        height: 'calc(100vh - 100px)', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center' 
      }}>
        <Typography variant="h6" color="error">Fiche non trouvée.</Typography>
      </Box>
    );
  }

  const getStatutChip = (statut) => {
    const map = {
      'Reçu': { color: 'info', label: 'Reçu' },
      'En cours': { color: 'warning', label: 'En cours' },
      'Terminé': { color: 'success', label: 'Terminé' },
    };
    const cfg = map[statut] || { color: 'default', label: statut };
    return <Chip size="small" color={cfg.color} label={cfg.label} variant="filled" />;
  };

  return (
    <Box sx={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Invoice settings */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 1 }}>
        <TextField
          label="Entreprise"
          size="small"
          value={businessName}
          onChange={e => setBusinessName(e.target.value)}
        />
        <TextField
          label="Date"
          type="date"
          size="small"
          value={invoiceDate}
          onChange={e => setInvoiceDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="TVA (%)"
          type="number"
          size="small"
          inputProps={{ min: 0, max: 100 }}
          value={tvaPercent}
          onChange={e => setTvaPercent(parseFloat(e.target.value) || 0)}
          sx={{ width: 100 }}
        />
      </Stack>
      {/* Header */}
      <Box sx={{ flexShrink: 0 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={2}>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Fiche #{fiche.id}
          </Typography>
          <Stack direction="row" spacing={1.5} alignItems="center">
            {getStatutChip(fiche.statut)}
            <Button 
              variant="outlined" 
              startIcon={<PrintIcon />} 
              onClick={handlePrint}
              size="small"
              color="secondary"
            >
              Imprimer Facture
            </Button>
            <Button 
              variant="contained" 
              color="success"
              startIcon={<PaymentIcon />}
              onClick={handleFinaliser} 
              disabled={fiche.statut === 'Terminé'}
              size="small"
              disableElevation
            >
              {fiche.statut === 'Terminé' ? 'Déjà Facturée' : 'Finaliser et Encaisser'}
            </Button>
          </Stack>
        </Stack>
      </Box>

      {/* Main Content */}
      <Box sx={{ flex: 1, display: 'flex', gap: 2, overflow: 'hidden', flexDirection: { xs: 'column', md: 'row' } }}>
        {/* Left Side - Client Info and Details */}
        <Box sx={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
          {/* Client Information */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Informations Client</Typography>
              <Stack spacing={1}>
                <Typography><strong>Nom:</strong> {fiche.clients.nom}</Typography>
                <Typography><strong>Téléphone:</strong> {fiche.clients.telephone}</Typography>
                <Typography><strong>Appareil:</strong> {fiche.appareil_description}</Typography>
                <Typography><strong>Problème Signalé:</strong> {fiche.probleme_signale}</Typography>
              </Stack>
            </CardContent>
          </Card>

          {/* Details Table */}
          <Card sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Typography variant="h6" gutterBottom>Pièces et Main d'œuvre</Typography>
              <Box sx={{ flex: 1, overflow: 'auto' }}>
                <TableContainer sx={{ maxHeight: { xs: 300, md: 420 } }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 'bold' }}>Quantité</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold', display: { xs: 'none', sm: 'table-cell' } }}>Prix Unitaire</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Total</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {details.map(d => (
                        <TableRow key={d.id} hover>
                          <TableCell sx={{ width: '35%' }}>
                            {editingId === d.id ? (
                              <TextField
                                fullWidth
                                size="small"
                                value={editValues.description}
                                onChange={e => setEditValues(v => ({ ...v, description: e.target.value }))
                                }
                              />
                            ) : (
                              d.description
                            )}
                          </TableCell>
                          <TableCell align="center" sx={{ width: 90 }}>
                            {editingId === d.id ? (
                              <TextField
                                type="number"
                                size="small"
                                inputProps={{ min: 1, style: { textAlign: 'center' } }}
                                value={editValues.quantite}
                                onChange={e => setEditValues(v => ({ ...v, quantite: e.target.value }))
                                }
                                sx={{ width: 70 }}
                              />
                            ) : (
                              d.quantite
                            )}
                          </TableCell>
                          <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' }, width: 140 }}>
                            {editingId === d.id ? (
                              <TextField
                                type="number"
                                size="small"
                                inputProps={{ min: 0, step: 0.01, style: { textAlign: 'right' } }}
                                value={ (Number(editValues.prixTotal) / Math.max(1, Number(editValues.quantite)||1)).toFixed(2) }
                                onChange={e => {
                                  const unit = Number(e.target.value) || 0;
                                  setEditValues(v => ({ ...v, prixTotal: unit * Math.max(1, Number(v.quantite)||1) }))
                                }}
                                sx={{ width: 110 }}
                              />
                            ) : (
                              (d.prix / d.quantite).toFixed(2) + ' DT'
                            )}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold', width: 120 }}>
                            {editingId === d.id ? (
                              <TextField
                                type="number"
                                size="small"
                                inputProps={{ min: 0, step: 0.01, style: { textAlign: 'right' } }}
                                value={editValues.prixTotal}
                                onChange={e => setEditValues(v => ({ ...v, prixTotal: e.target.value }))
                                }
                                sx={{ width: 110 }}
                              />
                            ) : (
                              d.prix.toFixed(2) + ' DT'
                            )}
                          </TableCell>
                          <TableCell align="center" sx={{ width: 160 }}>
                            {editingId === d.id ? (
                              <Stack direction="row" spacing={1} justifyContent="center">
                                <Button size="small" color="success" variant="contained" startIcon={<Save />} onClick={() => saveEdit(d)}>Sauver</Button>
                                <Button size="small" color="inherit" variant="outlined" startIcon={<Cancel />} onClick={cancelEdit}>Annuler</Button>
                              </Stack>
                            ) : (
                              <Stack direction="row" spacing={1} justifyContent="center">
                                <Button size="small" variant="outlined" startIcon={<Edit />} onClick={() => startEdit(d)}>Modifier</Button>
                                <Button size="small" color="error" variant="outlined" startIcon={<DeleteOutline />} onClick={() => deleteDetail(d)}>Supprimer</Button>
                              </Stack>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {details.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                            Aucun élément ajouté
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
              <Divider sx={{ my: 2 }} />
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="h6">Total Provisoire:</Typography>
                <Typography variant="h4" sx={{ fontWeight: 800, color: 'primary.main' }}>
                  {calculerTotal().toFixed(2)} DT
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Box>

        {/* Right Side - Add Element Form */}
        <Card sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Typography variant="h6" gutterBottom>Ajouter un Élément</Typography>
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              <AjouterDetailFiche ficheId={id} onDetailAjoute={getFicheDetails} />
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

export default DetailFiche;