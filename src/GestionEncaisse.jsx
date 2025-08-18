// src/GestionEncaisse.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { 
  Box, Paper, Typography, Stack, TextField, Button, Table, TableHead, TableRow, TableCell, TableBody, 
  Chip, Card, Grid, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Tooltip,
  FormControl, InputLabel, Select, MenuItem, Alert
} from '@mui/material';
import { 
  PictureAsPdf, Edit, Delete, Save, Cancel, Refresh, TrendingUp, AccountBalance, 
  DeleteOutline 
} from '@mui/icons-material';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-toastify';

function fmtDateTimeLocal(d) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function GestionEncaisse() {
  const now = new Date();
  
  // View mode: 'daily' for single day (like ClotureCaisse) or 'range' for date range (like HistoriqueEncaisse)
  const [viewMode, setViewMode] = useState('daily');
  
  // Date filters
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setHours(0,0,0,0);
    return d.toISOString().slice(0,10);
  });
  const [from, setFrom] = useState(() => {
    const d = new Date(now.getTime() - 7 * 86400000);
    d.setHours(0,0,0,0);
    return fmtDateTimeLocal(d);
  });
  const [to, setTo] = useState(() => fmtDateTimeLocal(now));
  const [paymentMode, setPaymentMode] = useState('Tous'); // Tous | Espèces | Carte
  
  // Cash management (for daily mode)
  const [fondCaisse, setFondCaisse] = useState('0');
  
  // Data
  const [transactions, setTransactions] = useState([]);
  const [depenses, setDepenses] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Edit/Delete functionality
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [deleteDialog, setDeleteDialog] = useState({ open: false, transaction: null });
  
  // Format date + time as dd/MM/yyyy HH:mm (local)
  const fmtDateTime = (value) => {
    const d = new Date(value);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  };

  const load = async () => {
    try {
      setLoading(true);
      let start, end;
      if (viewMode === 'daily') {
        start = new Date(date + 'T00:00:00');
        end = new Date(date + 'T23:59:59');
      } else {
        start = new Date(from);
        end = new Date(to);
      }

      // Revenus (exclude internal if possible)
      let transQuery = supabase
        .from('transactions')
        .select('*')
        .eq('type', 'Revenu')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false });
      try { transQuery = transQuery.neq('is_internal', true); } catch (_) {}
      let { data: transData, error: transError } = await transQuery;
      if (transError && String(transError.message || '').toLowerCase().includes('is_internal')) {
        const retry = await supabase
          .from('transactions')
          .select('*')
          .eq('type', 'Revenu')
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .order('created_at', { ascending: false });
        transData = retry.data; transError = retry.error;
      }
      if (transError) throw transError;
      setTransactions(transData || []);

      // Dépenses (daily)
      if (viewMode === 'daily') {
        let depBase = supabase
          .from('transactions')
          .select('*')
          .eq('type', 'Dépense')
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .order('created_at', { ascending: true });
        try { depBase = depBase.neq('is_internal', true); } catch (_) {}
        let { data: depData, error: depErr } = await depBase;
        if (depErr && String(depErr.message || '').toLowerCase().includes('is_internal')) {
          const retry = await supabase
            .from('transactions')
            .select('*')
            .eq('type', 'Dépense')
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString())
            .order('created_at', { ascending: true });
          depData = retry.data; depErr = retry.error;
        }
        if (depErr) throw depErr;
        setDepenses(depData || []);
      } else {
        setDepenses([]);
      }
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors du chargement des données.');
    } finally {
      setLoading(false);
    }
  };

  // Load data when filters change
  useEffect(() => {
    load();
  }, [viewMode, date, from, to, paymentMode]);

  const totals = useMemo(() => {
    // Only use explicit wallet for wallet flows
    const getWallet = (r) => r?.wallet;

    const revenusNonInternal = transactions.filter(r => !r.is_internal);
    const depensesNonInternal = depenses.filter(d => !d.is_internal);

    const total = revenusNonInternal.reduce((s, r) => s + Number(r.montant || 0), 0);
    const couts = revenusNonInternal.reduce((s, r) => s + Number(r.cout_total || 0), 0);
    const netVentes = total - couts;
    const totalDepenses = depensesNonInternal.reduce((s, r) => s + Number(r.montant || 0), 0);

    const caisseIn = transactions.filter(r => getWallet(r) === 'Caisse').reduce((s, r) => s + Number(r.montant || 0), 0);
    const caisseOut = depenses.filter(d => getWallet(d) === 'Caisse').reduce((s, r) => s + Number(r.montant || 0), 0);
    const caisseTheorique = Number(fondCaisse || 0) + caisseIn - caisseOut;

    const netCaisse = netVentes - totalDepenses;

    return { total, couts, netVentes, totalDepenses, caisseTheorique, netCaisse, profit: netVentes };
  }, [transactions, depenses, fondCaisse]);

  // Edit functionality
  const startEdit = (transaction) => {
    setEditingId(transaction.id);
    setEditValues({
      montant: transaction.montant,
      cout_total: transaction.cout_total || 0,
      source: transaction.source || '',
      description: transaction.description || ''
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const saveEdit = async () => {
    try {
      const { error } = await supabase
        .from('transactions')
        .update({
          montant: Number(editValues.montant),
          cout_total: Number(editValues.cout_total),
          source: editValues.source,
          description: editValues.description
        })
        .eq('id', editingId);

      if (error) throw error;
      
      toast.success('Transaction modifiée avec succès');
      setEditingId(null);
      setEditValues({});
      load(); // Reload data
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de la modification');
    }
  };

  // Delete functionality
  const openDeleteDialog = (transaction) => {
    setDeleteDialog({ open: true, transaction });
  };

  const closeDeleteDialog = () => {
    setDeleteDialog({ open: false, transaction: null });
  };

  const confirmDelete = async () => {
    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', deleteDialog.transaction.id);

      if (error) throw error;
      
      toast.success('Transaction supprimée avec succès');
      closeDeleteDialog();
      load(); // Reload data
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de la suppression');
    }
  };

  // Cash management functions (for daily mode)
  const enregistrerFondOuverture = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const montant = parseFloat(fondCaisse || '0');
      await supabase.from('transactions').insert({
        type: 'Fond',
        source: 'Ouverture',
        montant,
        description: `Fond de caisse ${date}`,
        user_id: user?.id || null
      });
      toast.success('Fond de caisse enregistré.');
    } catch (e) {
      toast.error('Erreur enregistrement fond de caisse.');
      console.error(e);
    }
  };

  const enregistrerCloture = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('transactions').insert({
        type: 'Cloture',
        source: 'Caisse',
        montant: totals.caisseTheorique,
        description: `Clôture du ${date} | Net: ${totals.netCaisse.toFixed(2)} DT`,
        user_id: user?.id || null
      });
      toast.success('Clôture enregistrée.');
    } catch (e) {
      toast.error('Erreur enregistrement de la clôture.');
      console.error(e);
    }
  };

  // PDF Export
  const generatePDF = () => {
    try {
      const doc = new jsPDF();
      // Header
      doc.setFont('helvetica','bold');
      doc.setFontSize(18);
      const title = viewMode === 'daily' ? 'Rapport de Clôture de Caisse' : 'Historique des Encaissements';
      doc.text(`Mizania+ - ${title}`, 14, 20);
      doc.setLineWidth(0.5);
      doc.line(14, 24, 196, 24);
      
      // Summary
      doc.setFont('helvetica','normal');
      doc.setFontSize(12);
      if (viewMode === 'daily') {
        doc.text(`Date: ${new Date(date).toLocaleDateString('fr-FR')}`, 14, 32);
      } else {
        doc.text(`Période: ${new Date(from).toLocaleDateString('fr-FR')} - ${new Date(to).toLocaleDateString('fr-FR')}`, 14, 32);
        doc.text(`Mode de paiement: ${paymentMode}`, 14, 40);
      }
      doc.text(`Généré le: ${new Date().toLocaleString('fr-FR')}`, 14, viewMode === 'daily' ? 40 : 48);
      
      // Summary
      doc.setFontSize(14);
      doc.text('Résumé:', 14, viewMode === 'daily' ? 55 : 62);
      
      doc.setFontSize(11);
      let yPos = viewMode === 'daily' ? 65 : 72;
      if (viewMode === 'daily') {
        doc.text(`Fond de caisse initial: ${Number(fondCaisse).toFixed(2)} DT`, 20, yPos);
        yPos += 8;
      }
      doc.text(`Nombre de transactions: ${transactions.length}`, 20, yPos);
      doc.text(`Total encaissé: ${totals.total.toFixed(2)} DT`, 20, yPos + 8);
      doc.text(`Coûts totaux: ${totals.couts.toFixed(2)} DT`, 20, yPos + 16);
      doc.text(`Profit net: ${totals.profit.toFixed(2)} DT`, 20, yPos + 24);
      
      if (viewMode === 'daily') {
        doc.text(`Total dépenses: ${totals.totalDepenses.toFixed(2)} DT`, 20, yPos + 32);
        doc.text(`Caisse théorique: ${totals.caisseTheorique.toFixed(2)} DT`, 20, yPos + 40);
        doc.text(`Bénéfice net caisse: ${totals.netCaisse.toFixed(2)} DT`, 20, yPos + 48);
      }
      
      // Transactions table
      const tableStartY = viewMode === 'daily' ? yPos + 60 : yPos + 40;
      autoTable(doc, {
        startY: tableStartY,
        head: [['Date/Heure', 'Source', 'Montant (DT)', 'Coût (DT)', 'Profit (DT)']],
        body: transactions.map(r => {
          const profit = Number(r.montant || 0) - Number(r.cout_total || 0);
          return [
            fmtDateTime(r.created_at),
            r.source || '-',
            Number(r.montant).toFixed(2),
            Number(r.cout_total || 0).toFixed(2),
            profit.toFixed(2)
          ];
        }),
        styles: { fontSize: 9 }
      });
      
      const filename = viewMode === 'daily' 
        ? `cloture-caisse-${date}.pdf`
        : `encaissements-${new Date(from).toISOString().split('T')[0]}-${new Date(to).toISOString().split('T')[0]}.pdf`;
      
      doc.save(filename);
      toast.success('Rapport PDF généré avec succès!');
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Erreur lors de la génération du PDF: ' + error.message);
    }
  };

  return (
    <Box 
      sx={{ 
        minHeight: 'calc(100vh - 100px)', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: 2,
        // Full width layout
        mx: { xs: -2, sm: -3 }
      }}
    >
      {/* Header */}
      <Box sx={{ flexShrink: 0, px: { xs: 2, sm: 3 } }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          Gestion des Encaissements
        </Typography>
      </Box>

      {/* Controls */}
      <Paper sx={{ flexShrink: 0, p: 2, mx: { xs: 2, sm: 3 } }}>
        <Stack spacing={2}>
          {/* View Mode Toggle */}
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Mode d'affichage:</Typography>
            <Button 
              variant={viewMode === 'daily' ? 'contained' : 'outlined'}
              onClick={() => setViewMode('daily')}
              startIcon={<AccountBalance />}
              size="small"
            >
              Journalier
            </Button>
            <Button 
              variant={viewMode === 'range' ? 'contained' : 'outlined'}
              onClick={() => setViewMode('range')}
              startIcon={<TrendingUp />}
              size="small"
            >
              Historique
            </Button>
          </Stack>

          {/* Filters */}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
            {viewMode === 'daily' ? (
              <>
                <TextField 
                  type="date" 
                  label="Date" 
                  value={date} 
                  onChange={(e) => setDate(e.target.value)} 
                  InputLabelProps={{ shrink: true }} 
                  size="small"
                />
                <TextField 
                  label="Fond de caisse début (DT)" 
                  type="number" 
                  inputProps={{ step: '0.01' }} 
                  value={fondCaisse} 
                  onChange={(e) => setFondCaisse(e.target.value)} 
                  size="small"
                />
              </>
            ) : (
              <>
                <TextField
                  type="datetime-local"
                  label="Du"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                />
                <TextField
                  type="datetime-local"
                  label="Au"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                />
              </>
            )}
            
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Mode de paiement</InputLabel>
              <Select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                label="Mode de paiement"
              >
                <MenuItem value="Tous">Tous</MenuItem>
                <MenuItem value="Espèces">Espèces</MenuItem>
                <MenuItem value="Carte">Carte</MenuItem>
              </Select>
            </FormControl>

            <Button 
              variant="contained" 
              onClick={load} 
              startIcon={<Refresh />}
              size="small"
            >
              Actualiser
            </Button>
            <Button 
              variant="outlined" 
              startIcon={<PictureAsPdf />} 
              onClick={generatePDF}
              size="small"
            >
              Export PDF
            </Button>

            {/* Daily mode specific buttons */}
            {viewMode === 'daily' && (
              <>
                <Button 
                  variant="outlined" 
                  onClick={enregistrerFondOuverture} 
                  size="small"
                >
                  Enregistrer Fond
                </Button>
                <Button 
                  variant="contained" 
                  onClick={enregistrerCloture} 
                  color="success"
                  size="small"
                >
                  Clôturer
                </Button>
              </>
            )}
          </Stack>
        </Stack>
      </Paper>

      {/* Summary Cards */}
      <Box sx={{ flexShrink: 0, px: { xs: 2, sm: 3 } }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={3}>
            <Card sx={{ p: 2, textAlign: 'center', bgcolor: 'primary.dark' }}>
              <Typography variant="body2" color="text.secondary">Total Encaissé</Typography>
              <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                {totals.total.toFixed(2)} DT
              </Typography>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card sx={{ p: 2, textAlign: 'center', bgcolor: 'warning.dark' }}>
              <Typography variant="body2" color="text.secondary">Coûts Totaux</Typography>
              <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'warning.main' }}>
                {totals.couts.toFixed(2)} DT
              </Typography>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card sx={{ 
              p: 2, 
              textAlign: 'center', 
              bgcolor: totals.profit >= 0 ? 'success.dark' : 'error.dark' 
            }}>
              <Typography variant="body2" color="text.secondary">
                {viewMode === 'daily' ? 'Marge Brute' : 'Profit Net'}
              </Typography>
              <Typography variant="h5" sx={{ 
                fontWeight: 'bold', 
                color: totals.profit >= 0 ? 'success.main' : 'error.main' 
              }}>
                {totals.profit.toFixed(2)} DT
              </Typography>
            </Card>
          </Grid>
          {viewMode === 'daily' && (
            <Grid item xs={12} md={3}>
              <Card sx={{ 
                p: 2, 
                textAlign: 'center', 
                bgcolor: totals.netCaisse >= 0 ? 'success.dark' : 'error.dark' 
              }}>
                <Typography variant="body2" color="text.secondary">Caisse Théorique</Typography>
                <Typography variant="h5" sx={{ 
                  fontWeight: 'bold', 
                  color: totals.netCaisse >= 0 ? 'success.main' : 'error.main' 
                }}>
                  {totals.caisseTheorique.toFixed(2)} DT
                </Typography>
              </Card>
            </Grid>
          )}
        </Grid>
      </Box>

      {/* Transactions Table */}
      <Paper sx={{ 
        flexGrow: 1, 
        overflow: 'hidden', 
        display: 'flex', 
        flexDirection: 'column',
        mx: { xs: 2, sm: 3 }
      }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6">
            Transactions ({transactions.length})
            {editingId && (
              <Chip 
                label="Mode édition" 
                color="warning" 
                size="small" 
                sx={{ ml: 2 }}
              />
            )}
          </Typography>
        </Box>
        
        <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
          <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', width: '100%' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', width: '6%' }}>ID</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '15%' }}>Date/Heure</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '12%' }}>Ticket</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '12%' }}>Source</TableCell>
                {viewMode === 'daily' && (
                  <TableCell sx={{ fontWeight: 'bold', width: '20%' }}>Articles</TableCell>
                )}
                <TableCell sx={{ fontWeight: 'bold', width: viewMode === 'daily' ? '15%' : '25%' }}>Description</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', width: '8%' }}>Montant (DT)</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', width: '8%' }}>Coût (DT)</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', width: '8%' }}>Marge (DT)</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold', width: '6%' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={viewMode === 'daily' ? 10 : 9} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    Chargement...
                  </TableCell>
                </TableRow>
              )}
              {!loading && transactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={viewMode === 'daily' ? 10 : 9} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    Aucune transaction trouvée
                  </TableCell>
                </TableRow>
              )}
              {!loading && transactions.map(r => {
                const isEditing = editingId === r.id;
                const montant = isEditing ? Number(editValues.montant || 0) : Number(r.montant || 0);
                const cout = isEditing ? Number(editValues.cout_total || 0) : Number(r.cout_total || 0);
                const marge = montant - cout;
                const ticket = (r.description || '').match(/Ticket\s([^|]+)/)?.[1] || '—';
                const itemsMatch = (r.description || '').match(/Articles:\s([^|]+)/);
                const items = itemsMatch ? itemsMatch[1] : '—';
                
                return (
                  <TableRow key={r.id} hover sx={{ bgcolor: isEditing ? 'rgba(255, 193, 7, 0.1)' : 'inherit' }}>
                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>#{r.id}</TableCell>
                    <TableCell sx={{ 
                      whiteSpace: 'nowrap', 
                      fontVariantNumeric: 'tabular-nums', 
                      fontFamily: 'monospace',
                      fontSize: '0.8rem'
                    }}>
                      {fmtDateTime(r.created_at)}
                    </TableCell>
                    <TableCell><Chip size="small" label={ticket} /></TableCell>
                    <TableCell>
                      {isEditing ? (
                        <TextField
                          value={editValues.source || ''}
                          onChange={(e) => setEditValues({...editValues, source: e.target.value})}
                          size="small"
                          fullWidth
                        />
                      ) : (
                        r.source || '—'
                      )}
                    </TableCell>
                    {viewMode === 'daily' && (
                      <TableCell sx={{ 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        fontSize: '0.8rem'
                      }}>
                        {items}
                      </TableCell>
                    )}
                    <TableCell sx={{ 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      whiteSpace: 'nowrap',
                      fontSize: '0.8rem'
                    }}>
                      {isEditing ? (
                        <TextField
                          value={editValues.description || ''}
                          onChange={(e) => setEditValues({...editValues, description: e.target.value})}
                          size="small"
                          fullWidth
                          multiline
                          maxRows={2}
                        />
                      ) : (
                        r.description || '—'
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {isEditing ? (
                        <TextField
                          type="number"
                          value={editValues.montant || ''}
                          onChange={(e) => setEditValues({...editValues, montant: e.target.value})}
                          size="small"
                          inputProps={{ step: '0.01' }}
                        />
                      ) : (
                        montant.toFixed(2)
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {isEditing ? (
                        <TextField
                          type="number"
                          value={editValues.cout_total || ''}
                          onChange={(e) => setEditValues({...editValues, cout_total: e.target.value})}
                          size="small"
                          inputProps={{ step: '0.01' }}
                        />
                      ) : (
                        cout.toFixed(2)
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ 
                      color: marge > 0 ? 'success.main' : (marge < 0 ? 'error.main' : 'inherit'),
                      fontWeight: 'bold'
                    }}>
                      {marge.toFixed(2)}
                    </TableCell>
                    <TableCell align="center">
                      {isEditing ? (
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          <Tooltip title="Sauvegarder">
                            <IconButton size="small" onClick={saveEdit} color="success">
                              <Save fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Annuler">
                            <IconButton size="small" onClick={cancelEdit} color="error">
                              <Cancel fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      ) : (
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          <Tooltip title="Modifier">
                            <IconButton 
                              size="small" 
                              onClick={() => startEdit(r)}
                              disabled={editingId !== null}
                            >
                              <Edit fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Supprimer">
                            <IconButton 
                              size="small" 
                              onClick={() => openDeleteDialog(r)}
                              color="error"
                              disabled={editingId !== null}
                            >
                              <Delete fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {transactions.length > 0 && (
                <TableRow sx={{ bgcolor: 'rgba(99, 102, 241, 0.05)' }}>
                  <TableCell colSpan={viewMode === 'daily' ? 6 : 5} align="right" sx={{ fontWeight: 700 }}>
                    Totaux
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{totals.total.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{totals.couts.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{totals.profit.toFixed(2)}</TableCell>
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
            Cette action est irréversible. Êtes-vous sûr de vouloir supprimer cette transaction ?
          </Alert>
          {deleteDialog.transaction && (
            <Box>
              <Typography variant="body2"><strong>ID:</strong> #{deleteDialog.transaction.id}</Typography>
              <Typography variant="body2"><strong>Date:</strong> {fmtDateTime(deleteDialog.transaction.created_at)}</Typography>
              <Typography variant="body2"><strong>Montant:</strong> {Number(deleteDialog.transaction.montant).toFixed(2)} DT</Typography>
              <Typography variant="body2"><strong>Description:</strong> {deleteDialog.transaction.description || '—'}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteDialog}>Annuler</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">
            Supprimer
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default GestionEncaisse;
