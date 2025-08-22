// src/Transferts.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { toast } from 'react-toastify';
import {
  Box,
  Paper,
  Typography,
  Stack,
  TextField,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Card,
  CardContent,
  Avatar,
  Divider,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert
} from '@mui/material';
import { SwapHoriz, Send, AccountBalance, Delete, Edit } from '@mui/icons-material';
import { PictureAsPdf } from '@mui/icons-material';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const WALLET_OPTIONS = ['Caisse', 'Banque', 'Coffre', 'Carte Postal', 'Carte Banker'];

function Transferts() {
  const [fromWallet, setFromWallet] = useState('Caisse');
  const [toWallet, setToWallet] = useState('Banque');
  const [amount, setAmount] = useState('');
  // Month filter for transfers
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0,7));
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState([]);
  const [balances, setBalances] = useState(null); // {Caisse: number, Banque: number, Coffre: number} or null if unsupported
  const [deleteDialog, setDeleteDialog] = useState({ open: false, transactionId: null, description: '' });
  // Manual balance adjustment
  const [adjustmentDialog, setAdjustmentDialog] = useState({ 
    open: false, 
    wallet: '', 
    currentBalance: 0, 
    newBalance: '', 
    reason: '' 
  });

  const fmtDateTime = (value) => {
    const d = new Date(value);
    return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const amountNumber = useMemo(() => {
    if (amount === '' || amount === null || amount === undefined) return NaN;
    const normalized = String(amount).replace(',', '.');
    const n = Number(normalized);
    return n;
  }, [amount]);

  const decimalsOk = useMemo(() => {
    if (typeof amount !== 'string' && typeof amount !== 'number') return false;
    const s = String(amount).replace(',', '.');
    if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(s)) return false;
    return true;
  }, [amount]);

  const availableBalance = useMemo(() => {
    if (!balances) return null;
    return balances[fromWallet] ?? 0;
  }, [balances, fromWallet]);

  const canSubmit = useMemo(() => {
    const baseValid = Number.isFinite(amountNumber) && amountNumber > 0 && decimalsOk && fromWallet !== toWallet;
    if (!baseValid) return false;
    if (availableBalance === null) return true; // wallet column unsupported -> cannot check, allow
    return amountNumber <= (availableBalance + 1e-6);
  }, [amountNumber, decimalsOk, fromWallet, toWallet, availableBalance]);

  const loadTransfers = async () => {
    try {
      setLoading(true);
      // Prefer a single ilike on description to use index, then fallback to OR when needed
      let q1 = supabase
        .from('transactions')
        .select('id,type,montant,description,created_at,wallet')
        .ilike('description', '%Transfert%')
        .order('created_at', { ascending: false })
        .limit(100);
      let { data, error } = await q1;
      if (error) {
        // fallback to source OR description
        const q2 = await supabase
          .from('transactions')
          .select('id,type,montant,description,created_at,wallet,source')
          .or('source.ilike.%Transfert%,description.ilike.%Transfert%')
          .order('created_at', { ascending: false })
          .limit(100);
        data = q2.data; error = q2.error;
      }
      if (error) throw error;
      setEntries(data || []);
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors du chargement des transferts');
    } finally {
      setLoading(false);
    }
  };

  const loadBalances = async () => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('type,montant,wallet,description,source')
        .in('wallet', WALLET_OPTIONS);
        
      if (error) throw error;
      const rows = data || [];
      const balances = Object.fromEntries(WALLET_OPTIONS.map(w => [w, 0]));
      
      const toWallet = (r) => {
        if (r.wallet && WALLET_OPTIONS.includes(r.wallet)) return r.wallet;
        const src = (r.source || '').toLowerCase();
        const desc = (r.description || '').toLowerCase();
        if (src.includes('carte') || src.includes('cb') || src.includes('pos') || desc.includes('carte')) return 'Banque';
        return 'Caisse';
      };
      
      for (const r of rows) {
        const w = toWallet(r);
        const n = Number(r.montant) || 0;
        const isTransferOut = /transfert.*vers|transfer.*to/i.test(r.description || '');
        const isTransferIn = /transfert.*de|transfer.*from|reçu.*de/i.test(r.description || '');
        
        // Handle different transaction types
        if (r.type === 'Revenu' || isTransferIn) {
          balances[w] += n;
        } else if (r.type === 'Dépense' || isTransferOut) {
          balances[w] -= n;
        } else if (r.type === 'Transfert') {
          // Handle specific transfer type if it exists
          if (isTransferOut) {
            balances[w] -= n;
          } else if (isTransferIn) {
            balances[w] += n;
          }
        }
      }
      setBalances(balances);
    } catch (e) {
      console.warn('Balance calc skipped:', e?.message || e);
    }
  };

  useEffect(() => {
    // Run in parallel
    Promise.all([loadTransfers(), loadBalances()]).catch(() => {});
  }, []);

  const submitTransfer = async (e) => {
    e.preventDefault();
    // Strict validation with user feedback
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      toast.error('Montant invalide');
      return;
    }
    if (!decimalsOk) {
      toast.error('Montant invalide (2 décimales max)');
      return;
    }
    if (fromWallet === toWallet) {
      toast.error('Les portefeuilles doivent être différents');
      return;
    }
    if (availableBalance !== null && amountNumber > availableBalance + 1e-6) {
      toast.error(`Montant supérieur au solde ${fromWallet} (${availableBalance.toFixed(2)} DT)`);
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      const montant = amountNumber;
      const baseDesc = description?.trim() ? ` | ${description.trim()}` : '';
      const common = { source: 'Transfert', user_id: user?.id || null };

      // Try with wallet + is_internal
      let { error } = await supabase
        .from('transactions')
        .insert([
          {
            type: 'Dépense',
            montant,
            description: `Transfert vers ${toWallet}${baseDesc}`,
            wallet: fromWallet,
            is_internal: true,
            ...common
          },
          {
            type: 'Revenu',
            montant,
            description: `Transfert depuis ${fromWallet}${baseDesc}`,
            wallet: toWallet,
            is_internal: true,
            ...common
          }
        ]);

      if (error && String(error.message || '').toLowerCase().includes('column')) {
        // Fallback without custom columns
        const retry = await supabase
          .from('transactions')
          .insert([
            { type: 'Dépense', montant, description: `Transfert vers ${toWallet}${baseDesc}`, ...common },
            { type: 'Revenu', montant, description: `Transfert depuis ${fromWallet}${baseDesc}`, ...common }
          ]);
        error = retry.error;
      }
      if (error) throw error;

      toast.success('Transfert enregistré');
      setAmount('');
      setDescription('');
      loadTransfers();
      loadBalances();
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de l\'enregistrement du transfert');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (transactionId, description) => {
    setDeleteDialog({ open: true, transactionId, description });
  };

  const handleDeleteConfirm = async () => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', deleteDialog.transactionId);

      if (error) throw error;

      toast.success('Transfert supprimé');
      setDeleteDialog({ open: false, transactionId: null, description: '' });
      loadTransfers();
      loadBalances();
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de la suppression du transfert');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialog({ open: false, transactionId: null, description: '' });
  };

  const handleAdjustBalance = (wallet) => {
    const currentBalance = balances ? (balances[wallet] || 0) : 0;
    setAdjustmentDialog({
      open: true,
      wallet,
      currentBalance,
      newBalance: currentBalance.toString(),
      reason: ''
    });
  };

  const handleAdjustmentConfirm = async () => {
    try {
      setLoading(true);
      const { wallet, currentBalance, newBalance, reason } = adjustmentDialog;
      const newBalanceNum = Number(newBalance);
      
      if (isNaN(newBalanceNum)) {
        toast.error('Veuillez saisir un montant valide');
        return;
      }

      if (!reason.trim()) {
        toast.error('Veuillez indiquer la raison de l\'ajustement');
        return;
      }

      const difference = newBalanceNum - currentBalance;
      
      if (Math.abs(difference) < 0.01) {
        toast.info('Aucun changement détecté');
        setAdjustmentDialog({ open: false, wallet: '', currentBalance: 0, newBalance: '', reason: '' });
        return;
      }

      // Create adjustment transaction
      const transactionType = difference > 0 ? 'Revenu' : 'Dépense';
      const amount = Math.abs(difference);
      
      const { data: { user } } = await supabase.auth.getUser();
      
      const payload = {
        type: transactionType,
        source: 'Ajustement Manuel',
        montant: amount,
        description: `Ajustement manuel de ${wallet}: ${currentBalance.toFixed(2)} DT → ${newBalanceNum.toFixed(2)} DT. Raison: ${reason}`,
        user_id: user?.id || null,
        wallet,
        is_internal: true
      };

      let { error } = await supabase
        .from('transactions')
        .insert(payload);

      if (error && String(error.message || '').toLowerCase().includes('column')) {
        // Fallback if custom columns not present
        const { wallet: _, is_internal: __, ...fallbackPayload } = payload;
        const retry = await supabase.from('transactions').insert(fallbackPayload);
        error = retry.error;
      }

      if (error) throw error;

      toast.success(`Balance de ${wallet} ajustée: ${difference > 0 ? '+' : ''}${difference.toFixed(2)} DT`);
      setAdjustmentDialog({ open: false, wallet: '', currentBalance: 0, newBalance: '', reason: '' });
      loadBalances();
      loadTransfers();
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de l\'ajustement: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustmentCancel = () => {
    setAdjustmentDialog({ open: false, wallet: '', currentBalance: 0, newBalance: '', reason: '' });
  };

  const walletChip = (w) => {
    const map = { Caisse: 'success', Banque: 'info', Coffre: 'warning', 'Carte Postal': 'primary', 'Carte Banker': 'secondary' };
    const color = map[w] || 'default';
    return <Chip size="small" color={color} label={w} variant={color === 'default' ? 'outlined' : 'filled'} />;
  };

  const BalanceCards = () => {
    if (!balances) return null;
    const colorMap = { Caisse: '#22C55E', Banque: '#3B82F6', Coffre: '#F59E0B', 'Carte Postal': '#06B6D4', 'Carte Banker': '#8B5CF6' };
    const cartePostaleBalance = balances['Carte Postal'] || 0;
    const isLowBalance = cartePostaleBalance < 10;
    
    return (
      <Paper sx={{ p: { xs: 2, sm: 3 }, mx: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>Soldes Portefeuilles</Typography>
        {isLowBalance && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Attention: Solde Carte Postale faible ({cartePostaleBalance.toFixed(2)} DT). Pensez à la recharger pour continuer les services d'inscription.
          </Alert>
        )}
        <Grid container spacing={2}>
          {Object.entries(balances).map(([w, val]) => (
            <Grid item xs={12} sm={4} key={w}>
              <Card sx={{ 
                boxShadow: '0 8px 24px rgba(15,23,42,0.08)',
                border: w === 'Carte Postal' && val < 10 ? '2px solid #f97316' : 'none'
              }}>
                <CardContent>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Avatar sx={{ bgcolor: colorMap[w] || 'primary.main', width: 36, height: 36 }}>
                        <AccountBalance sx={{ fontSize: '1rem' }} />
                      </Avatar>
                      <Box>
                        <Typography color="text.secondary" variant="overline">{w}</Typography>
                        <Typography 
                          variant="h5" 
                          sx={{ 
                            fontWeight: 800,
                            color: w === 'Carte Postal' && val < 10 ? '#f97316' : 'inherit'
                          }}
                        >
                          {Number(val).toFixed(2)} DT
                        </Typography>
                      </Box>
                    </Stack>
                    <IconButton 
                      size="small" 
                      onClick={() => handleAdjustBalance(w)}
                      sx={{ color: 'text.secondary' }}
                      title="Ajuster le solde"
                    >
                      <Edit fontSize="small" />
                    </IconButton>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Paper>
    );
  };

  // Filter entries by selected month
  const filteredEntries = useMemo(() => {
    if (!selectedMonth) return entries;
    const [year, month] = selectedMonth.split('-').map(Number);
    return entries.filter(e => {
      const d = new Date(e.created_at);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
  }, [entries, selectedMonth]);

  // PDF Export for transfers
  const exportTransfersPDF = () => {
    try {
      const doc = new jsPDF();
      // Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('Mizania+ - Transferts', 14, 20);
      doc.setLineWidth(0.5);
      doc.line(14, 24, 196, 24);
      // Summary
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 14, 32);
      doc.text(`Nombre de transferts: ${filteredEntries.length}`, 14, 40);
      // Table
      autoTable(doc, {
        startY: 48,
        head: [['Date', 'Type', 'Portefeuille', 'Description', 'Montant (DT)']],
        body: filteredEntries.map(e => [
          fmtDateTime(e.created_at),
          e.type,
          e.wallet || '',
          e.description || '',
          `${Number(e.montant).toFixed(2)} DT`
        ]),
        theme: 'striped',
        headStyles: { fillColor: [99,102,241], textColor: 255, halign: 'center' },
        styles: { fontSize: 9 }
      });
      doc.save(`transferts-${selectedMonth}.pdf`);

      toast.success('Rapport PDF généré avec succès!');
    } catch (error) {
      console.error('Error generating Transferts PDF:', error);
      toast.error('Erreur lors de la génération du PDF: ' + error.message);
    }
  };

  return (
    <Box sx={{ minHeight: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', gap: 2, mx: { xs: -2, sm: -3 } }}>
      {/* Header */}
      <Box sx={{ flexShrink: 0, px: { xs: 2, sm: 3 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>Transferts de Caisse</Typography>
            <Typography variant="body2" color="text.secondary">
              Gérez vos transferts entre portefeuilles et ajustez les soldes si nécessaire
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              type="month"
              label="Mois"
              size="small"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 140 }}
            />
            <Button
              variant="outlined"
              startIcon={<PictureAsPdf />}
              onClick={exportTransfersPDF}
              disabled={filteredEntries.length === 0}
            >
              Exporter PDF
            </Button>
          </Stack>
        </Stack>
      </Box>

      {/* Wallet balances */}
      {balances && <BalanceCards />}

      {/* Main two-column layout */}
      <Grid container spacing={2} sx={{ px: { xs: 2, sm: 3 } }}>
        {/* Left: form */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>Nouveau Transfert</Typography>
            <form onSubmit={submitTransfer}>
              <Stack spacing={2}>
                <FormControl fullWidth size="medium">
                  <InputLabel>De</InputLabel>
                  <Select label="De" value={fromWallet} onChange={(e) => setFromWallet(e.target.value)}>
                    {WALLET_OPTIONS.map(w => <MenuItem key={w} value={w}>{w}</MenuItem>)}
                  </Select>
                </FormControl>

                <FormControl fullWidth size="medium">
                  <InputLabel>Vers</InputLabel>
                  <Select label="Vers" value={toWallet} onChange={(e) => setToWallet(e.target.value)}>
                    {WALLET_OPTIONS.map(w => <MenuItem key={w} value={w}>{w}</MenuItem>)}
                  </Select>
                </FormControl>

                <TextField
                  label="Montant (DT)"
                  type="text"
                  required
                  size="medium"
                  fullWidth
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
                  inputProps={{ inputMode: 'decimal' }}
                  helperText={availableBalance !== null ? `Solde: ${availableBalance.toFixed(2)} DT` : ''}
                  error={availableBalance !== null && Number.isFinite(amountNumber) && amountNumber > (availableBalance + 1e-6)}
                />

                <TextField
                  label="Description"
                  size="medium"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  fullWidth
                  multiline
                  minRows={3}
                  maxRows={8}
                  placeholder="Motif du transfert..."
                />

                <Button type="submit" variant="contained" startIcon={<Send />} disabled={!canSubmit || loading} fullWidth>
                  Transférer
                </Button>
              </Stack>
            </form>
          </Paper>
        </Grid>

        {/* Right: recent movements */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: { xs: 2, sm: 3 }, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>Derniers mouvements</Typography>
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Portefeuille</TableCell>
                    <TableCell>Description</TableCell>
                <TableCell align="right">Montant (DT)</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading && (
                    <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}>Chargement...</TableCell></TableRow>
                  )}
                  {!loading && filteredEntries.length === 0 && (
                    <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>Aucun transfert</TableCell></TableRow>
                  )}
                  {!loading && filteredEntries.map(e => (
                    <TableRow key={e.id} hover>
                      <TableCell>{fmtDateTime(e.created_at)}</TableCell>
                      <TableCell>
                        <Chip size="small" color={e.type === 'Revenu' ? 'success' : 'error'} label={e.type} />
                      </TableCell>
                      <TableCell>{walletChip(e.wallet || 'Caisse')}</TableCell>
                      <TableCell>{e.description || '-'}</TableCell>
                      <TableCell align="right">{Number(e.montant).toFixed(2)} DT</TableCell>
                      <TableCell align="center">
                        <IconButton 
                          size="small" 
                          color="error" 
                          onClick={() => handleDeleteClick(e.id, e.description || '')}
                          title="Supprimer ce transfert"
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onClose={handleDeleteCancel}>
        <DialogTitle>Confirmer la suppression</DialogTitle>
        <DialogContent>
          <Typography>
            Êtes-vous sûr de vouloir supprimer ce transfert ?
          </Typography>
          {deleteDialog.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Description: {deleteDialog.description}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>Annuler</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Supprimer
          </Button>
        </DialogActions>
      </Dialog>

      {/* Balance Adjustment Dialog */}
      <Dialog open={adjustmentDialog.open} onClose={handleAdjustmentCancel} maxWidth="sm" fullWidth>
        <DialogTitle>Ajuster le solde - {adjustmentDialog.wallet}</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Solde actuel: {adjustmentDialog.currentBalance.toFixed(2)} DT
              </Typography>
            </Box>
            
            <TextField
              label="Nouveau solde (DT)"
              type="number"
              value={adjustmentDialog.newBalance}
              onChange={(e) => setAdjustmentDialog(prev => ({ ...prev, newBalance: e.target.value }))}
              inputProps={{ step: '0.01', min: '0' }}
              fullWidth
              helperText={`Différence: ${adjustmentDialog.newBalance ? 
                (Number(adjustmentDialog.newBalance) - adjustmentDialog.currentBalance).toFixed(2) : '0.00'} DT`}
            />
            
            <TextField
              label="Raison de l'ajustement"
              value={adjustmentDialog.reason}
              onChange={(e) => setAdjustmentDialog(prev => ({ ...prev, reason: e.target.value }))}
              placeholder="Ex: Correction d'erreur, Ajustement inventaire, etc."
              multiline
              rows={3}
              fullWidth
              required
            />

            <Alert severity="warning">
              <Typography variant="body2">
                Cette action créera une transaction d'ajustement pour corriger le solde. 
                Assurez-vous que la raison est claire pour les audits.
              </Typography>
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleAdjustmentCancel}>Annuler</Button>
          <Button 
            onClick={handleAdjustmentConfirm} 
            variant="contained"
            disabled={!adjustmentDialog.reason.trim() || !adjustmentDialog.newBalance}
          >
            Ajuster
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Transferts;