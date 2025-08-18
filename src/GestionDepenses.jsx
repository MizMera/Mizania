// src/GestionDepenses.jsx
import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { toast } from 'react-toastify';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
  Button,
  Stack,
  Grid,
  Card,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Alert,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  Save,
  Cancel,
  PictureAsPdf,
  Refresh,
  TrendingDown,
  Receipt,
  DeleteOutline
} from '@mui/icons-material';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function GestionDepenses() {
  const [depenses, setDepenses] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Date filters
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  // Add new expense form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newExpense, setNewExpense] = useState({
    montant: '',
    description: '',
    categorie: 'Général',
    wallet: 'Caisse'
  });

  // Edit functionality
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});

  // Delete functionality
  const [deleteDialog, setDeleteDialog] = useState({ open: false, expense: null });

  // Categories for expenses
  const categories = [
    'Général',
    'Fournitures',
    'Équipement',
    'Marketing',
    'Transport',
    'Charges',
    'Maintenance',
    'Louer',
    'Autres'
  ];
  const walletOptions = ['Caisse', 'Banque', 'Coffre'];

  // Load expenses
  const loadDepenses = async () => {
    try {
      setLoading(true);
      const startDate = new Date(dateFrom + 'T00:00:00').toISOString();
      const endDate = new Date(dateTo + 'T23:59:59').toISOString();

      // Try to exclude internal transfers when column exists
      let base = supabase
        .from('transactions')
        .select('*')
        .eq('type', 'Dépense')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

      let { data, error } = await base.neq('is_internal', true);
      if (error && String(error.message || '').toLowerCase().includes('is_internal')) {
        const retry = await base; // without neq filter
        data = retry.data; error = retry.error;
      }

      if (error) throw error;

      // Fallback filter: remove transfers if schema lacks is_internal
      const filtered = (data || []).filter(d => !/transfert/i.test(d.description || '') && !/transfert/i.test(d.source || ''));
      setDepenses(filtered);
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors du chargement des dépenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDepenses(); }, [dateFrom, dateTo]);

  // Calculate totals
  const totals = useMemo(() => {
    const total = depenses.reduce((sum, d) => sum + Number(d.montant || 0), 0);
    const byCategory = categories.reduce((acc, cat) => {
      acc[cat] = depenses
        .filter(d => (d.source || 'Général') === cat)
        .reduce((sum, d) => sum + Number(d.montant || 0), 0);
      return acc;
    }, {});
    return { total, byCategory };
  }, [depenses]);

  // Add new expense
  const handleAddExpense = async (e) => {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        type: 'Dépense',
        source: newExpense.categorie,
        montant: parseFloat(newExpense.montant),
        description: newExpense.description,
        user_id: user?.id || null
      };
      // Try with wallet + is_internal=false, fallback if columns missing
      let { error } = await supabase.from('transactions').insert({ ...payload, wallet: newExpense.wallet, is_internal: false });
      if (error && String(error.message || '').toLowerCase().includes('column')) {
        const retry = await supabase.from('transactions').insert(payload);
        error = retry.error;
      }
      if (error) throw error;
      toast.success('Dépense ajoutée avec succès');
      setNewExpense({ montant: '', description: '', categorie: 'Général', wallet: 'Caisse' });
      setShowAddForm(false);
      loadDepenses();
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'ajout de la dépense");
    }
  };

  // Edit
  const startEdit = (expense) => {
    setEditingId(expense.id);
    setEditValues({
      montant: expense.montant,
      description: expense.description || '',
      categorie: expense.source || 'Général',
      wallet: expense.wallet || 'Caisse'
    });
  };
  const cancelEdit = () => { setEditingId(null); setEditValues({}); };
  const saveEdit = async () => {
    try {
      let { error } = await supabase
        .from('transactions')
        .update({
          montant: Number(editValues.montant),
          description: editValues.description,
          source: editValues.categorie,
          wallet: editValues.wallet
        })
        .eq('id', editingId);
      if (error && String(error.message || '').toLowerCase().includes('column')) {
        const retry = await supabase
          .from('transactions')
          .update({
            montant: Number(editValues.montant),
            description: editValues.description,
            source: editValues.categorie
          })
          .eq('id', editingId);
        error = retry.error;
      }
      if (error) throw error;
      toast.success('Dépense modifiée avec succès');
      setEditingId(null);
      setEditValues({});
      loadDepenses();
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de la modification');
    }
  };

  // Delete
  const openDeleteDialog = (expense) => setDeleteDialog({ open: true, expense });
  const closeDeleteDialog = () => setDeleteDialog({ open: false, expense: null });
  const confirmDelete = async () => {
    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', deleteDialog.expense.id);
      if (error) throw error;
      toast.success('Dépense supprimée avec succès');
      closeDeleteDialog();
      loadDepenses();
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de la suppression');
    }
  };

  // Format date time
  const fmtDateTime = (value) => {
    const d = new Date(value);
    return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  // PDF
  const generatePDF = () => {
    try {
      const doc = new jsPDF();
      // Header
      doc.setFont('helvetica','bold');
      doc.setFontSize(18);
      doc.text('Mizania+ - Rapport des Dépenses', 14, 20);
      doc.setLineWidth(0.5);
      doc.line(14, 24, 196, 24);
      
      // Summary
      doc.setFont('helvetica','normal');
      doc.setFontSize(12);
      doc.text(`Période: ${new Date(dateFrom).toLocaleDateString('fr-FR')} - ${new Date(dateTo).toLocaleDateString('fr-FR')}`, 14, 32);
      doc.text(`Généré le: ${new Date().toLocaleString('fr-FR')}`, 14, 40);
      doc.setFontSize(14);
      doc.text('Résumé:', 14, 55);
      doc.setFontSize(11);
      doc.text(`Nombre de dépenses: ${depenses.length}`, 20, 65);
      doc.text(`Total des dépenses: ${totals.total.toFixed(2)} DT`, 20, 73);
      let yPos = 85;
      doc.text('Répartition par catégorie:', 20, yPos);
      yPos += 8;
      Object.entries(totals.byCategory).forEach(([cat, amount]) => {
        if (amount > 0) {
          doc.text(`${cat}: ${amount.toFixed(2)} DT`, 25, yPos);
          yPos += 6;
        }
      });
      autoTable(doc, {
        startY: yPos + 10,
        head: [['Date', 'Catégorie', 'Description', 'Montant (DT)']],
        body: depenses.map(d => [
          new Date(d.created_at).toLocaleDateString('fr-FR'),
          d.source || 'Général',
          d.description || '-',
          Number(d.montant).toFixed(2)
        ]),
        styles: { fontSize: 9 }
      });
      const filename = `depenses-${dateFrom}-${dateTo}.pdf`;
      doc.save(filename);
      toast.success('Rapport PDF généré avec succès!');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Erreur lors de la génération du PDF');
    }
  };

  return (
    <Box sx={{ minHeight: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', gap: 2, mx: { xs: -2, sm: -3 } }}>
      {/* Header */}
      <Box sx={{ flexShrink: 0, px: { xs: 2, sm: 3 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h4" sx={{ fontWeight: 800 }}>Gestion des Dépenses</Typography>
          <Button variant="contained" startIcon={<Add />} onClick={() => setShowAddForm(true)} size="small">Nouvelle Dépense</Button>
        </Stack>
      </Box>

      {/* Add Form */}
      {showAddForm && (
        <Paper sx={{ p: 2, mx: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>Ajouter une Dépense</Typography>
          <Box component="form" onSubmit={handleAddExpense}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
      <TextField label="Montant (DT)" type="number" value={newExpense.montant} onChange={(e) => setNewExpense({ ...newExpense, montant: e.target.value })} required inputProps={{ step: '0.01', min: '0' }} size="small" />
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Catégorie</InputLabel>
                <Select value={newExpense.categorie} onChange={(e) => setNewExpense({ ...newExpense, categorie: e.target.value })} label="Catégorie">
                  {categories.map(cat => (<MenuItem key={cat} value={cat}>{cat}</MenuItem>))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Portefeuille</InputLabel>
                <Select value={newExpense.wallet} onChange={(e) => setNewExpense({ ...newExpense, wallet: e.target.value })} label="Portefeuille">
                  {walletOptions.map(w => (<MenuItem key={w} value={w}>{w}</MenuItem>))}
                </Select>
              </FormControl>
              <TextField label="Description" value={newExpense.description} onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })} required fullWidth size="small" />
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button type="submit" variant="contained" startIcon={<Save />} size="small">Enregistrer</Button>
              <Button onClick={() => setShowAddForm(false)} variant="outlined" size="small">Annuler</Button>
            </Stack>
          </Box>
        </Paper>
      )}

      {/* Filters */}
      <Paper sx={{ p: 2, mx: { xs: 2, sm: 3 } }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
          <TextField type="date" label="Du" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} InputLabelProps={{ shrink: true }} size="small" />
          <TextField type="date" label="Au" value={dateTo} onChange={(e) => setDateTo(e.target.value)} InputLabelProps={{ shrink: true }} size="small" />
          <Button variant="contained" onClick={loadDepenses} startIcon={<Refresh />} size="small">Actualiser</Button>
          <Button variant="outlined" startIcon={<PictureAsPdf />} onClick={generatePDF} size="small">Export PDF</Button>
        </Stack>
      </Paper>

      {/* Summary Cards */}
      <Box sx={{ flexShrink: 0, px: { xs: 2, sm: 3 } }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Card sx={{ p: 2, textAlign: 'center', bgcolor: 'error.dark' }}>
              <TrendingDown sx={{ fontSize: 40, color: 'error.main', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">Total Dépenses</Typography>
              <Typography variant="h4" sx={{ fontWeight: 'bold', color: 'error.main' }}>{totals.total.toFixed(2)} DT</Typography>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card sx={{ p: 2, textAlign: 'center' }}>
              <Receipt sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">Nombre de Dépenses</Typography>
              <Typography variant="h4" sx={{ fontWeight: 'bold', color: 'primary.main' }}>{depenses.length}</Typography>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">Moyenne par Dépense</Typography>
                <Typography variant="h4" sx={{ fontWeight: 'bold', color: 'text.primary' }}>
                {depenses.length > 0 ? (totals.total / depenses.length).toFixed(2) : '0.00'} DT
              </Typography>
            </Card>
          </Grid>
        </Grid>
      </Box>

      {/* Categories Summary */}
      <Paper sx={{ p: 2, mx: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Répartition par Catégorie</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {Object.entries(totals.byCategory).map(([cat, amount]) => (
            amount > 0 && (
          <Chip key={cat} label={`${cat}: ${amount.toFixed(2)} DT`} variant="outlined" color="primary" />
            )
          ))}
        </Stack>
      </Paper>

      {/* Table */}
      <Paper sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', mx: { xs: 2, sm: 3 } }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6">Liste des Dépenses ({depenses.length}){editingId && (<Chip label="Mode édition" color="warning" size="small" sx={{ ml: 2 }} />)}</Typography>
        </Box>
        <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
          <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', width: '100%' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', width: '8%' }}>ID</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '15%' }}>Date/Heure</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '10%' }}>Portefeuille</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '12%' }}>Catégorie</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '33%' }}>Description</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', width: '12%' }}>Montant (DT)</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold', width: '10%' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>Chargement...</TableCell>
                </TableRow>
              )}
              {!loading && depenses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>Aucune dépense trouvée</TableCell>
                </TableRow>
              )}
              {!loading && depenses.map(expense => {
                const isEditing = editingId === expense.id;
                return (
                  <TableRow key={expense.id} hover sx={{ bgcolor: isEditing ? 'rgba(255, 193, 7, 0.1)' : 'inherit' }}>
                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>#{expense.id}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace', fontSize: '0.8rem' }}>{fmtDateTime(expense.created_at)}</TableCell>
                    <TableCell>
                      {isEditing ? (
                        <FormControl size="small" fullWidth>
                          <Select value={editValues.wallet || 'Caisse'} onChange={(e) => setEditValues({ ...editValues, wallet: e.target.value })}>
                            {walletOptions.map(w => (<MenuItem key={w} value={w}>{w}</MenuItem>))}
                          </Select>
                        </FormControl>
                      ) : (
                        <Chip size="small" label={expense.wallet || 'Caisse'} />
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <FormControl size="small" fullWidth>
                          <Select value={editValues.categorie || ''} onChange={(e) => setEditValues({ ...editValues, categorie: e.target.value })}>
                            {categories.map(cat => (<MenuItem key={cat} value={cat}>{cat}</MenuItem>))}
                          </Select>
                        </FormControl>
                      ) : (
                        <Chip size="small" label={expense.source || 'Général'} variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <TextField value={editValues.description || ''} onChange={(e) => setEditValues({ ...editValues, description: e.target.value })} size="small" fullWidth multiline maxRows={2} />
                      ) : (
                        expense.description || '—'
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold', color: 'error.main' }}>
                      {isEditing ? (
                        <TextField type="number" value={editValues.montant || ''} onChange={(e) => setEditValues({ ...editValues, montant: e.target.value })} size="small" inputProps={{ step: '0.01' }} />
                      ) : (
                        Number(expense.montant).toFixed(2)
                      )}
                    </TableCell>
                    <TableCell align="center">
                      {isEditing ? (
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          <Tooltip title="Sauvegarder"><IconButton size="small" onClick={saveEdit} color="success"><Save fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Annuler"><IconButton size="small" onClick={cancelEdit} color="error"><Cancel fontSize="small" /></IconButton></Tooltip>
                        </Stack>
                      ) : (
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          <Tooltip title="Modifier"><IconButton size="small" onClick={() => startEdit(expense)} disabled={editingId !== null}><Edit fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Supprimer"><IconButton size="small" onClick={() => openDeleteDialog(expense)} color="error" disabled={editingId !== null}><Delete fontSize="small" /></IconButton></Tooltip>
                        </Stack>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {depenses.length > 0 && (
                <TableRow sx={{ bgcolor: 'rgba(244, 67, 54, 0.05)' }}>
                  <TableCell colSpan={4} align="right" sx={{ fontWeight: 700 }}>Total des Dépenses</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'error.main' }}>{totals.total.toFixed(2)} DT</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onClose={closeDeleteDialog}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <DeleteOutline color="error" />
          Confirmer la suppression
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Cette action est irréversible. Êtes-vous sûr de vouloir supprimer cette dépense ?
          </Alert>
          {deleteDialog.expense && (
            <Box>
              <Typography variant="body2"><strong>ID:</strong> #{deleteDialog.expense.id}</Typography>
              <Typography variant="body2"><strong>Date:</strong> {fmtDateTime(deleteDialog.expense.created_at)}</Typography>
              <Typography variant="body2"><strong>Catégorie:</strong> {deleteDialog.expense.source || 'Général'}</Typography>
              <Typography variant="body2"><strong>Montant:</strong> {Number(deleteDialog.expense.montant).toFixed(2)} DT</Typography>
              <Typography variant="body2"><strong>Description:</strong> {deleteDialog.expense.description || '—'}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteDialog}>Annuler</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">Supprimer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default GestionDepenses;
