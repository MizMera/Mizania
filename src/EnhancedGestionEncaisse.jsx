// src/EnhancedGestionEncaisse.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { 
  Box, Paper, Typography, Stack, TextField, Button, Table, TableHead, TableRow, TableCell, TableBody, 
  Chip, Card, Grid, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Tooltip,
  FormControl, InputLabel, Select, MenuItem, Alert, TableContainer, Switch, FormControlLabel
} from '@mui/material';
import { 
  PictureAsPdf, Edit, Delete, Save, Cancel, Refresh, TrendingUp, AccountBalance, 
  DeleteOutline, SwapHoriz, Lock, CheckCircle, Warning, Info, Settings
} from '@mui/icons-material';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-toastify';

// BUSINESS CONFIGURATION
const CASH_MANAGEMENT_CONFIG = {
  STANDARD_OPENING_FUND: 100,     // Fixed daily opening fund
  AUTO_TRANSFER_THRESHOLD: 500,   // Auto-transfer excess to Coffre
  MIN_OPERATING_AMOUNT: 50,       // Minimum cash for operations
  RECONCILIATION_TOLERANCE: 1,    // 1 DT tolerance for differences
  AUTO_CLOSURE_TIME: 23,          // Auto-closure at 23:00
  WALLETS: {
    'Caisse': { name: 'Caisse', icon: '💰', isPhysical: true },
    'Banque': { name: 'Banque', icon: '🏦', isPhysical: false },
    'Coffre': { name: 'Coffre', icon: '🔒', isPhysical: true },
    'Carte Postal': { name: 'Carte Postal', icon: '📮', isPhysical: false },
    'Carte Banker': { name: 'Carte Banker', icon: '💳', isPhysical: false }
  }
};

function EnhancedGestionEncaisse() {
  const [date, setDate] = useState(() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  
  // Enhanced state management
  const [systemState, setSystemState] = useState({
    transactions: [],
    expenses: [],
    balances: {},
    dailyStatus: {
      isOpened: false,
      isClosed: false,
      openingFund: null,
      closureRecord: null
    },
    alerts: [],
    autoMode: true
  });
  
  const [uiState, setUiState] = useState({
    loading: false,
    editingId: null,
    editValues: {},
    deleteDialog: { open: false, transaction: null },
    reconciliationDialog: { open: false, physicalAmount: '' },
    settingsDialog: { open: false }
  });

  // Enhanced transaction processing
  const processTransactions = (transactions) => {
    const processed = {
      sales: [],
      expenses: [],
      transfers: [],
      internalOps: [],
      openingFund: null,
      closureRecord: null
    };
    
    transactions.forEach(tx => {
      const isInternal = tx.is_internal === true;
      const description = (tx.description || '').toLowerCase();
      const source = (tx.source || '').toLowerCase();
      
      // Categorize transactions
      if (isOpeningFund(tx)) {
        processed.openingFund = tx;
      } else if (source.includes('cloture') || description.includes('clôture')) {
        processed.closureRecord = tx;
      } else if (description.includes('transfert') || source.includes('transfert')) {
        processed.transfers.push(tx);
      } else if (isInternal) {
        processed.internalOps.push(tx);
      } else if (tx.type === 'Revenu') {
        processed.sales.push(tx);
      } else if (tx.type === 'Dépense') {
        processed.expenses.push(tx);
      }
    });
    
    return processed;
  };

  // Enhanced balance calculation
  const calculateRealTimeBalances = async () => {
    try {
      const { data: allTransactions, error } = await supabase
        .from('transactions')
        .select('type,montant,wallet,description,source,is_internal,method')
        .order('created_at', { ascending: true });
        
      if (error) throw error;
      
      const balances = Object.keys(CASH_MANAGEMENT_CONFIG.WALLETS).reduce((acc, wallet) => {
        acc[wallet] = 0;
        return acc;
      }, {});
      
      (allTransactions || []).forEach(tx => {
        const wallet = determineWallet(tx);
        const amount = Number(tx.montant) || 0;
        
        if (tx.type === 'Revenu') {
          balances[wallet] += amount;
        } else if (tx.type === 'Dépense') {
          balances[wallet] -= amount;
        }
      });
      
      return balances;
    } catch (error) {
      console.error('Error calculating balances:', error);
      return {};
    }
  };

  // Enhanced wallet determination
  const determineWallet = (transaction) => {
    // Use explicit wallet if available
    if (transaction.wallet && CASH_MANAGEMENT_CONFIG.WALLETS[transaction.wallet]) {
      return transaction.wallet;
    }
    
    // Smart inference from method/source/description
    const method = (transaction.method || '').toLowerCase();
    const source = (transaction.source || '').toLowerCase();
    const description = (transaction.description || '').toLowerCase();
    
    // Cash operations
    if (method.includes('espèces') || method.includes('cash') || source.includes('caisse')) {
      return 'Caisse';
    }
    
    // Card operations
    if (method.includes('carte') || source.includes('carte') || description.includes('carte')) {
      if (source.includes('postal') || description.includes('postal')) {
        return 'Carte Postal';
      }
      if (source.includes('banker') || description.includes('banker')) {
        return 'Carte Banker';
      }
      return 'Banque';
    }
    
    // Safe operations
    if (source.includes('coffre') || description.includes('coffre')) {
      return 'Coffre';
    }
    
    // Default to cash
    return 'Caisse';
  };

  // Check if transaction is opening fund
  const isOpeningFund = (tx) => {
    const source = (tx.source || '').toLowerCase();
    const description = (tx.description || '').toLowerCase();
    return (
      tx.is_internal === true && 
      tx.type === 'Revenu' &&
      (source.includes('ouverture') || description.includes('fond de caisse'))
    );
  };

  // Enhanced system status checking
  const checkSystemStatus = (processedData, balances) => {
    const alerts = [];
    const caisseBalance = balances['Caisse'] || 0;
    const now = new Date();
    const currentHour = now.getHours();
    
    // Cash level alerts
    if (caisseBalance > CASH_MANAGEMENT_CONFIG.AUTO_TRANSFER_THRESHOLD) {
      alerts.push({
        type: 'warning',
        message: `💰 Caisse élevée: ${caisseBalance.toFixed(2)} DT. Transfert recommandé vers le coffre.`,
        action: 'transfer_to_safe'
      });
    }
    
    if (caisseBalance < CASH_MANAGEMENT_CONFIG.MIN_OPERATING_AMOUNT) {
      alerts.push({
        type: 'error',
        message: `⚠️ Caisse insuffisante: ${caisseBalance.toFixed(2)} DT < ${CASH_MANAGEMENT_CONFIG.MIN_OPERATING_AMOUNT} DT requis.`,
        action: 'add_funds'
      });
    }
    
    // Opening status
    if (!processedData.openingFund) {
      alerts.push({
        type: 'info',
        message: '🌅 Ouverture journalière non effectuée.',
        action: 'daily_opening'
      });
    }
    
    // Closure status
    if (currentHour >= CASH_MANAGEMENT_CONFIG.AUTO_CLOSURE_TIME && !processedData.closureRecord) {
      alerts.push({
        type: 'warning',
        message: '🌙 Clôture journalière en attente.',
        action: 'daily_closure'
      });
    }
    
    return alerts;
  };

  // Automated daily opening
  const performAutomatedOpening = async () => {
    try {
      setUiState(prev => ({ ...prev, loading: true }));
      
      const { data: { user } } = await supabase.auth.getUser();
      const openingAmount = CASH_MANAGEMENT_CONFIG.STANDARD_OPENING_FUND;
      
      // Check current cash balance
      const currentBalance = systemState.balances['Caisse'] || 0;
      
      // If insufficient funds, try to get from Coffre
      if (currentBalance < openingAmount) {
        const coffreeBalance = systemState.balances['Coffre'] || 0;
        const needed = openingAmount - currentBalance;
        
        if (coffreeBalance >= needed) {
          // Transfer from Coffre to Caisse
          await performAutomatedTransfer('Coffre', 'Caisse', needed, 'Approvisionnement ouverture');
        } else {
          toast.warning(`Fonds insuffisants pour l'ouverture automatique. Requis: ${openingAmount} DT, Disponible: ${currentBalance} DT`);
          return;
        }
      }
      
      // Create opening fund transaction
      const { error } = await supabase.from('transactions').insert({
        type: 'Revenu',
        source: 'Ouverture',
        montant: openingAmount,
        description: `Ouverture automatique - ${new Date(date).toLocaleDateString('fr-FR')}`,
        wallet: 'Caisse',
        method: 'Espèces',
        is_internal: true,
        user_id: user?.id || null,
        created_at: new Date(date + 'T08:00:00').toISOString()
      });
      
      if (error) throw error;
      
      toast.success(`✅ Ouverture effectuée: ${openingAmount} DT`);
      loadSystemData();
      
    } catch (error) {
      console.error('Error performing automated opening:', error);
      toast.error('Erreur lors de l\'ouverture automatique');
    } finally {
      setUiState(prev => ({ ...prev, loading: false }));
    }
  };

  // Automated daily closure
  const performAutomatedClosure = async () => {
    try {
      setUiState(prev => ({ ...prev, loading: true }));
      
      const { data: { user } } = await supabase.auth.getUser();
      const caisseBalance = systemState.balances['Caisse'] || 0;
      const excessAmount = Math.max(0, caisseBalance - CASH_MANAGEMENT_CONFIG.STANDARD_OPENING_FUND);
      
      const transactions = [];
      
      // Create closure record
      transactions.push({
        type: 'Cloture',
        source: 'Caisse',
        montant: caisseBalance,
        description: `Clôture automatique - Solde: ${caisseBalance.toFixed(2)} DT - ${new Date(date).toLocaleDateString('fr-FR')}`,
        wallet: 'Caisse',
        is_internal: true,
        user_id: user?.id || null,
        created_at: new Date(date + 'T23:00:00').toISOString()
      });
      
      // Auto-transfer excess to Coffre
      if (excessAmount >= 10) { // Minimum 10 DT transfer
        transactions.push(
          {
            type: 'Dépense',
            source: 'Transfert',
            montant: excessAmount,
            description: `Transfert automatique clôture vers Coffre: ${excessAmount.toFixed(2)} DT`,
            wallet: 'Caisse',
            is_internal: true,
            user_id: user?.id || null,
            created_at: new Date(date + 'T23:01:00').toISOString()
          },
          {
            type: 'Revenu',
            source: 'Transfert',
            montant: excessAmount,
            description: `Réception clôture depuis Caisse: ${excessAmount.toFixed(2)} DT`,
            wallet: 'Coffre',
            is_internal: true,
            user_id: user?.id || null,
            created_at: new Date(date + 'T23:01:00').toISOString()
          }
        );
      }
      
      const { error } = await supabase.from('transactions').insert(transactions);
      if (error) throw error;
      
      const keptAmount = caisseBalance - excessAmount;
      toast.success(
        `✅ Clôture effectuée. Gardé: ${keptAmount.toFixed(2)} DT, Transféré: ${excessAmount.toFixed(2)} DT`
      );
      
      loadSystemData();
      
    } catch (error) {
      console.error('Error performing automated closure:', error);
      toast.error('Erreur lors de la clôture automatique');
    } finally {
      setUiState(prev => ({ ...prev, loading: false }));
    }
  };

  // Automated transfer between wallets
  const performAutomatedTransfer = async (fromWallet, toWallet, amount, reason = '') => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const description = reason || `Transfert automatique: ${fromWallet} → ${toWallet}`;
      
      const transactions = [
        {
          type: 'Dépense',
          source: 'Transfert',
          montant: amount,
          description: `${description} - Sortie ${fromWallet}`,
          wallet: fromWallet,
          is_internal: true,
          user_id: user?.id || null
        },
        {
          type: 'Revenu',
          source: 'Transfert',
          montant: amount,
          description: `${description} - Entrée ${toWallet}`,
          wallet: toWallet,
          is_internal: true,
          user_id: user?.id || null
        }
      ];
      
      const { error } = await supabase.from('transactions').insert(transactions);
      if (error) throw error;
      
      return true;
    } catch (error) {
      console.error('Error performing automated transfer:', error);
      return false;
    }
  };

  // Enhanced reconciliation
  const performReconciliation = async (physicalAmount) => {
    try {
      const theoreticalAmount = systemState.balances['Caisse'] || 0;
      const difference = physicalAmount - theoreticalAmount;
      const tolerance = CASH_MANAGEMENT_CONFIG.RECONCILIATION_TOLERANCE;
      
      if (Math.abs(difference) <= tolerance) {
        toast.success('✅ Caisse réconciliée - Écart acceptable');
        setUiState(prev => ({ ...prev, reconciliationDialog: { open: false } }));
        return;
      }
      
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('transactions').insert({
        type: difference > 0 ? 'Revenu' : 'Dépense',
        source: 'Ajustement',
        montant: Math.abs(difference),
        description: `Ajustement réconciliation - Écart: ${difference.toFixed(2)} DT (Théorique: ${theoreticalAmount.toFixed(2)} DT, Physique: ${physicalAmount.toFixed(2)} DT)`,
        wallet: 'Caisse',
        is_internal: true,
        user_id: user?.id || null
      });
      
      if (error) throw error;
      
      toast.success(`✅ Ajustement: ${difference > 0 ? '+' : ''}${difference.toFixed(2)} DT`);
      loadSystemData();
      setUiState(prev => ({ ...prev, reconciliationDialog: { open: false } }));
      
    } catch (error) {
      console.error('Error performing reconciliation:', error);
      toast.error('Erreur lors de la réconciliation');
    }
  };

  // Load complete system data
  const loadSystemData = async () => {
    try {
      setUiState(prev => ({ ...prev, loading: true }));
      
      // Load transactions for the selected date
      const startDate = new Date(date + 'T00:00:00').toISOString();
      const endDate = new Date(date + 'T23:59:59.999').toISOString();
      
      const [transactionsRes, expensesRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('*')
          .eq('type', 'Revenu')
          .gte('created_at', startDate)
          .lte('created_at', endDate)
          .order('created_at', { ascending: false }),
        
        supabase
          .from('transactions')
          .select('*')
          .eq('type', 'Dépense')
          .gte('created_at', startDate)
          .lte('created_at', endDate)
          .neq('is_internal', true)
          .order('created_at', { ascending: true })
      ]);
      
      if (transactionsRes.error) throw transactionsRes.error;
      if (expensesRes.error) throw expensesRes.error;
      
      const transactions = transactionsRes.data || [];
      const expenses = expensesRes.data || [];
      
      // Calculate real-time balances
      const balances = await calculateRealTimeBalances();
      
      // Process transactions
      const processedData = processTransactions([...transactions, ...expenses]);
      
      // Check system status
      const alerts = checkSystemStatus(processedData, balances);
      
      // Update system state
      setSystemState({
        transactions,
        expenses,
        balances,
        dailyStatus: {
          isOpened: !!processedData.openingFund,
          isClosed: !!processedData.closureRecord,
          openingFund: processedData.openingFund,
          closureRecord: processedData.closureRecord
        },
        alerts,
        autoMode: systemState.autoMode
      });
      
    } catch (error) {
      console.error('Error loading system data:', error);
      toast.error('Erreur lors du chargement des données');
    } finally {
      setUiState(prev => ({ ...prev, loading: false }));
    }
  };

  // Enhanced calculations
  const calculations = useMemo(() => {
    const salesTransactions = systemState.transactions.filter(tx => !isOpeningFund(tx));
    const allExpenses = systemState.expenses;
    
    // Sales calculations
    const totalSales = salesTransactions.reduce((sum, tx) => sum + (Number(tx.montant) || 0), 0);
    const totalCosts = salesTransactions.reduce((sum, tx) => sum + (Number(tx.cout_total) || 0), 0);
    const totalExpenses = allExpenses.reduce((sum, tx) => sum + (Number(tx.montant) || 0), 0);
    
    // Wallet-specific calculations
    const caisseTransactions = [...systemState.transactions, ...systemState.expenses]
      .filter(tx => determineWallet(tx) === 'Caisse');
    
    const caisseIn = caisseTransactions
      .filter(tx => tx.type === 'Revenu')
      .reduce((sum, tx) => sum + (Number(tx.montant) || 0), 0);
    
    const caisseOut = caisseTransactions
      .filter(tx => tx.type === 'Dépense')
      .reduce((sum, tx) => sum + (Number(tx.montant) || 0), 0);
    
    // Enhanced calculations
    const grossProfit = totalSales - totalCosts;
    const netProfit = grossProfit - totalExpenses;
    const theoreticalCash = caisseIn - caisseOut;
    const operationalCash = theoreticalCash - (systemState.dailyStatus.openingFund ? Number(systemState.dailyStatus.openingFund.montant) : 0);
    
    return {
      totalSales,
      totalCosts,
      totalExpenses,
      grossProfit,
      netProfit,
      theoreticalCash,
      operationalCash,
      transactionCount: salesTransactions.length,
      openingFund: systemState.dailyStatus.openingFund ? Number(systemState.dailyStatus.openingFund.montant) : 0
    };
  }, [systemState]);

  // Load data on mount and date change
  useEffect(() => {
    loadSystemData();
  }, [date]);

  // Format helpers
  const formatCurrency = (amount) => `${(amount || 0).toFixed(2)} DT`;
  const formatDateTime = (dateStr) => new Date(dateStr).toLocaleString('fr-FR');

  return (
    <Box sx={{ minHeight: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Enhanced Header */}
      <Box sx={{ px: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
          💰 Gestion des Encaissements Avancée
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Système de caisse intelligent avec gestion automatisée
        </Typography>
      </Box>

      {/* System Status Alerts */}
      {systemState.alerts.length > 0 && (
        <Paper sx={{ mx: 3, p: 2 }}>
          <Stack spacing={1}>
            {systemState.alerts.map((alert, index) => (
              <Alert 
                key={index} 
                severity={alert.type}
                action={
                  alert.action === 'daily_opening' ? (
                    <Button 
                      color="inherit" 
                      size="small" 
                      onClick={performAutomatedOpening}
                      disabled={uiState.loading}
                    >
                      OUVRIR
                    </Button>
                  ) : alert.action === 'daily_closure' ? (
                    <Button 
                      color="inherit" 
                      size="small" 
                      onClick={performAutomatedClosure}
                      disabled={uiState.loading}
                    >
                      CLÔTURER
                    </Button>
                  ) : null
                }
              >
                {alert.message}
              </Alert>
            ))}
          </Stack>
        </Paper>
      )}

      {/* Enhanced Controls */}
      <Paper sx={{ mx: 3, p: 3 }}>
        <Stack spacing={3}>
          {/* Main Controls */}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
            <TextField 
              type="date" 
              label="Date" 
              value={date} 
              onChange={(e) => setDate(e.target.value)} 
              InputLabelProps={{ shrink: true }} 
              size="small"
            />
            
            <FormControlLabel
              control={
                <Switch
                  checked={systemState.autoMode}
                  onChange={(e) => setSystemState(prev => ({ ...prev, autoMode: e.target.checked }))}
                />
              }
              label="Mode automatique"
            />
            
            <Button 
              variant="contained"
              startIcon={<AccountBalance />}
              onClick={performAutomatedOpening}
              disabled={systemState.dailyStatus.isOpened || uiState.loading}
              color="success"
            >
              Ouverture Auto
            </Button>
            
            <Button 
              variant="contained"
              startIcon={<Lock />}
              onClick={performAutomatedClosure}
              disabled={systemState.dailyStatus.isClosed || uiState.loading}
              color="warning"
            >
              Clôture Auto
            </Button>
            
            <Button
              variant="outlined"
              startIcon={<SwapHoriz />}
              onClick={() => setUiState(prev => ({ 
                ...prev, 
                reconciliationDialog: { 
                  open: true, 
                  physicalAmount: systemState.balances['Caisse'] || 0 
                }
              }))}
            >
              Réconciliation
            </Button>
            
            <Button 
              variant="outlined" 
              onClick={loadSystemData} 
              startIcon={<Refresh />}
              disabled={uiState.loading}
            >
              Actualiser
            </Button>
          </Stack>

          {/* Status Indicators */}
          <Stack direction="row" spacing={2}>
            <Chip 
              icon={systemState.dailyStatus.isOpened ? <CheckCircle /> : <Warning />}
              label={systemState.dailyStatus.isOpened ? 'Ouvert' : 'Non ouvert'}
              color={systemState.dailyStatus.isOpened ? 'success' : 'warning'}
              variant={systemState.dailyStatus.isOpened ? 'filled' : 'outlined'}
            />
            <Chip 
              icon={systemState.dailyStatus.isClosed ? <Lock /> : <Info />}
              label={systemState.dailyStatus.isClosed ? 'Clôturé' : 'En cours'}
              color={systemState.dailyStatus.isClosed ? 'info' : 'default'}
              variant={systemState.dailyStatus.isClosed ? 'filled' : 'outlined'}
            />
            <Chip 
              icon={<AccountBalance />}
              label={`Caisse: ${formatCurrency(systemState.balances['Caisse'])}`}
              color={systemState.balances['Caisse'] >= CASH_MANAGEMENT_CONFIG.MIN_OPERATING_AMOUNT ? 'success' : 'error'}
            />
          </Stack>
        </Stack>
      </Paper>

      {/* Enhanced Summary Cards */}
      <Box sx={{ px: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={2}>
            <Card sx={{ p: 2, textAlign: 'center', bgcolor: 'primary.dark' }}>
              <Typography variant="body2" color="text.secondary">Transactions</Typography>
              <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                {calculations.transactionCount}
              </Typography>
            </Card>
          </Grid>
          <Grid item xs={12} md={2}>
            <Card sx={{ p: 2, textAlign: 'center', bgcolor: 'success.dark' }}>
              <Typography variant="body2" color="text.secondary">Ventes</Typography>
              <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                {formatCurrency(calculations.totalSales)}
              </Typography>
            </Card>
          </Grid>
          <Grid item xs={12} md={2}>
            <Card sx={{ p: 2, textAlign: 'center', bgcolor: 'warning.dark' }}>
              <Typography variant="body2" color="text.secondary">Coûts</Typography>
              <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'warning.main' }}>
                {formatCurrency(calculations.totalCosts)}
              </Typography>
            </Card>
          </Grid>
          <Grid item xs={12} md={2}>
            <Card sx={{ p: 2, textAlign: 'center', bgcolor: 'error.dark' }}>
              <Typography variant="body2" color="text.secondary">Dépenses</Typography>
              <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'error.main' }}>
                {formatCurrency(calculations.totalExpenses)}
              </Typography>
            </Card>
          </Grid>
          <Grid item xs={12} md={2}>
            <Card sx={{ 
              p: 2, 
              textAlign: 'center', 
              bgcolor: calculations.grossProfit >= 0 ? 'success.dark' : 'error.dark' 
            }}>
              <Typography variant="body2" color="text.secondary">Marge Brute</Typography>
              <Typography variant="h5" sx={{ 
                fontWeight: 'bold', 
                color: calculations.grossProfit >= 0 ? 'success.main' : 'error.main' 
              }}>
                {formatCurrency(calculations.grossProfit)}
              </Typography>
            </Card>
          </Grid>
          <Grid item xs={12} md={2}>
            <Card sx={{ 
              p: 2, 
              textAlign: 'center', 
              bgcolor: calculations.netProfit >= 0 ? 'success.dark' : 'error.dark' 
            }}>
              <Typography variant="body2" color="text.secondary">Profit Net</Typography>
              <Typography variant="h5" sx={{ 
                fontWeight: 'bold', 
                color: calculations.netProfit >= 0 ? 'success.main' : 'error.main' 
              }}>
                {formatCurrency(calculations.netProfit)}
              </Typography>
            </Card>
          </Grid>
        </Grid>
      </Box>

      {/* Reconciliation Dialog */}
      <Dialog 
        open={uiState.reconciliationDialog.open} 
        onClose={() => setUiState(prev => ({ ...prev, reconciliationDialog: { open: false } }))}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>🔍 Réconciliation de Caisse</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <Alert severity="info">
              Comptez les espèces physiques et entrez le montant réel.
            </Alert>
            
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Solde théorique (système)
              </Typography>
              <Typography variant="h6">
                {formatCurrency(systemState.balances['Caisse'])}
              </Typography>
            </Box>
            
            <TextField
              label="Montant physique compté"
              type="number"
              fullWidth
              inputProps={{ step: '0.01', min: '0' }}
              value={uiState.reconciliationDialog.physicalAmount}
              onChange={(e) => setUiState(prev => ({
                ...prev,
                reconciliationDialog: {
                  ...prev.reconciliationDialog,
                  physicalAmount: e.target.value
                }
              }))}
            />
            
            {uiState.reconciliationDialog.physicalAmount !== '' && (
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Écart détecté
                </Typography>
                <Typography 
                  variant="h6"
                  color={
                    Math.abs(Number(uiState.reconciliationDialog.physicalAmount) - (systemState.balances['Caisse'] || 0)) <= CASH_MANAGEMENT_CONFIG.RECONCILIATION_TOLERANCE
                      ? 'success.main' 
                      : 'warning.main'
                  }
                >
                  {(Number(uiState.reconciliationDialog.physicalAmount) - (systemState.balances['Caisse'] || 0)) > 0 ? '+' : ''}
                  {formatCurrency(Number(uiState.reconciliationDialog.physicalAmount) - (systemState.balances['Caisse'] || 0))}
                </Typography>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setUiState(prev => ({ ...prev, reconciliationDialog: { open: false } }))}
          >
            Annuler
          </Button>
          <Button 
            variant="contained"
            onClick={() => performReconciliation(Number(uiState.reconciliationDialog.physicalAmount))}
            disabled={uiState.reconciliationDialog.physicalAmount === ''}
          >
            Réconcilier
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default EnhancedGestionEncaisse;
