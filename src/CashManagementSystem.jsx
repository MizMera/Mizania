// src/CashManagementSystem.jsx
import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { toast } from 'react-toastify';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  TextField,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  Alert,
  Stack,
  Divider,
  Switch,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TableContainer,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  AccountBalance,
  TrendingUp,
  TrendingDown,
  SwapHoriz,
  Settings,
  History,
  Lock,
  CheckCircle,
  Warning,
  Info,
  Refresh,
  PictureAsPdf
} from '@mui/icons-material';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// WALLET CONFIGURATION
const WALLETS = {
  'Caisse': { 
    name: 'Caisse', 
    icon: '💰', 
    description: 'Espèces physiques',
    autoTransferThreshold: 500, // Auto-transfer to Coffre when > 500 DT
    minOperatingAmount: 100,    // Minimum for daily operations
    isPhysical: true
  },
  'Banque': { 
    name: 'Banque', 
    icon: '🏦', 
    description: 'Compte bancaire principal',
    autoTransferThreshold: null,
    minOperatingAmount: 0,
    isPhysical: false
  },
  'Coffre': { 
    name: 'Coffre', 
    icon: '🔒', 
    description: 'Coffre-fort sécurisé',
    autoTransferThreshold: null,
    minOperatingAmount: 0,
    isPhysical: true
  },
  'Carte Postal': { 
    name: 'Carte Postal', 
    icon: '📮', 
    description: 'Carte postale tunisienne',
    autoTransferThreshold: null,
    minOperatingAmount: 0,
    isPhysical: false
  },
  'Carte Banker': { 
    name: 'Carte Banker', 
    icon: '💳', 
    description: 'Carte bancaire',
    autoTransferThreshold: null,
    minOperatingAmount: 0,
    isPhysical: false
  }
};

// BUSINESS RULES
const BUSINESS_RULES = {
  STANDARD_OPENING_FUND: 100,           // Fixed daily opening fund
  AUTO_CLOSURE_TIME: '23:00',          // Automatic daily closure
  SAFETY_THRESHOLD: 500,               // Transfer excess cash to Coffre
  MIN_TRANSFER_AMOUNT: 10,             // Minimum transfer amount
  RECONCILIATION_TOLERANCE: 1,         // 1 DT tolerance for reconciliation
  BACKUP_WALLETS: ['Coffre', 'Banque'] // Backup fund sources
};

function CashManagementSystem() {
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  
  // System state
  const [balances, setBalances] = useState({});
  const [dailyOperations, setDailyOperations] = useState({
    sales: [],
    expenses: [],
    transfers: [],
    openingFund: null,
    closureStatus: null
  });
  const [systemStatus, setSystemStatus] = useState({
    isOperational: true,
    lastReconciliation: null,
    autoClosureEnabled: true,
    alerts: []
  });
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState('Caisse');
  const [transferDialog, setTransferDialog] = useState({ open: false });
  const [reconciliationDialog, setReconciliationDialog] = useState({ open: false });
  const [settingsDialog, setSettingsDialog] = useState({ open: false });

  // Load complete financial state
  const loadFinancialState = async () => {
    try {
      setLoading(true);
      
      // Load transactions for selected date
      const startDate = new Date(date + 'T00:00:00').toISOString();
      const endDate = new Date(date + 'T23:59:59.999').toISOString();
      
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('*')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: true });
        
      if (error) throw error;
      
      // Calculate real-time balances
      await calculateRealTimeBalances();
      
      // Parse daily operations
      parseDailyOperations(transactions || []);
      
      // Check system status
      checkSystemStatus();
      
    } catch (error) {
      console.error('Error loading financial state:', error);
      toast.error('Erreur lors du chargement des données financières');
    } finally {
      setLoading(false);
    }
  };

  // Calculate real-time wallet balances
  const calculateRealTimeBalances = async () => {
    try {
      const { data: allTransactions, error } = await supabase
        .from('transactions')
        .select('type,montant,wallet,description,source,is_internal')
        .order('created_at', { ascending: true });
        
      if (error) throw error;
      
      const newBalances = Object.keys(WALLETS).reduce((acc, wallet) => {
        acc[wallet] = 0;
        return acc;
      }, {});
      
      // Process all transactions to get current balances
      (allTransactions || []).forEach(tx => {
        const wallet = getTransactionWallet(tx);
        const amount = Number(tx.montant) || 0;
        
        if (tx.type === 'Revenu') {
          newBalances[wallet] += amount;
        } else if (tx.type === 'Dépense') {
          newBalances[wallet] -= amount;
        }
      });
      
      setBalances(newBalances);
    } catch (error) {
      console.error('Error calculating balances:', error);
    }
  };

  // Determine wallet from transaction
  const getTransactionWallet = (transaction) => {
    if (transaction.wallet && WALLETS[transaction.wallet]) {
      return transaction.wallet;
    }
    
    // Fallback logic
    const method = (transaction.method || '').toLowerCase();
    const source = (transaction.source || '').toLowerCase();
    const description = (transaction.description || '').toLowerCase();
    
    if (method.includes('espèces') || source.includes('caisse')) return 'Caisse';
    if (method.includes('carte') || source.includes('carte') || description.includes('carte')) return 'Banque';
    if (source.includes('coffre')) return 'Coffre';
    if (source.includes('postal')) return 'Carte Postal';
    if (source.includes('banker')) return 'Carte Banker';
    
    return 'Caisse'; // Default
  };

  // Parse daily operations from transactions
  const parseDailyOperations = (transactions) => {
    const operations = {
      sales: [],
      expenses: [],
      transfers: [],
      openingFund: null,
      closureStatus: null
    };
    
    transactions.forEach(tx => {
      const isInternal = tx.is_internal === true;
      const description = tx.description || '';
      const source = tx.source || '';
      
      // Opening fund
      if (isOpeningFund(tx)) {
        operations.openingFund = tx;
      }
      // Closure
      else if (source.toLowerCase().includes('cloture') || description.toLowerCase().includes('clôture')) {
        operations.closureStatus = tx;
      }
      // Transfers
      else if (description.toLowerCase().includes('transfert') || source.toLowerCase().includes('transfert')) {
        operations.transfers.push(tx);
      }
      // Sales (non-internal revenue)
      else if (tx.type === 'Revenu' && !isInternal) {
        operations.sales.push(tx);
      }
      // Expenses (non-internal)
      else if (tx.type === 'Dépense' && !isInternal) {
        operations.expenses.push(tx);
      }
    });
    
    setDailyOperations(operations);
  };

  // Check if transaction is opening fund
  const isOpeningFund = (tx) => {
    const source = (tx.source || '').toLowerCase();
    const description = (tx.description || '').toLowerCase();
    return (
      tx.is_internal === true && 
      (source.includes('ouverture') || description.includes('fond de caisse'))
    );
  };

  // Check system status and generate alerts
  const checkSystemStatus = () => {
    const alerts = [];
    const caisseBalance = balances['Caisse'] || 0;
    
    // Check if cash is too high (security risk)
    if (caisseBalance > BUSINESS_RULES.SAFETY_THRESHOLD) {
      alerts.push({
        type: 'warning',
        message: `Caisse élevée: ${caisseBalance.toFixed(2)} DT > ${BUSINESS_RULES.SAFETY_THRESHOLD} DT. Transfert recommandé.`
      });
    }
    
    // Check if cash is too low for operations
    if (caisseBalance < WALLETS['Caisse'].minOperatingAmount) {
      alerts.push({
        type: 'error',
        message: `Caisse insuffisante: ${caisseBalance.toFixed(2)} DT < ${WALLETS['Caisse'].minOperatingAmount} DT requis.`
      });
    }
    
    // Check if opening fund exists for today
    if (!dailyOperations.openingFund) {
      alerts.push({
        type: 'info',
        message: 'Fond d\'ouverture non enregistré pour aujourd\'hui.'
      });
    }
    
    // Check if day is closed
    const now = new Date();
    const isAfterClosureTime = now.getHours() >= 23;
    if (isAfterClosureTime && !dailyOperations.closureStatus) {
      alerts.push({
        type: 'warning',
        message: 'Clôture journalière en attente.'
      });
    }
    
    setSystemStatus(prev => ({
      ...prev,
      alerts,
      isOperational: alerts.filter(a => a.type === 'error').length === 0
    }));
  };

  // Automated daily opening
  const performDailyOpening = async () => {
    try {
      setLoading(true);
      
      // Check if already opened
      if (dailyOperations.openingFund) {
        toast.info('Ouverture déjà effectuée pour cette date');
        return;
      }
      
      const { data: { user } } = await supabase.auth.getUser();
      const openingAmount = BUSINESS_RULES.STANDARD_OPENING_FUND;
      
      // Create opening fund transaction
      const { error } = await supabase.from('transactions').insert({
        type: 'Revenu',
        source: 'Ouverture',
        montant: openingAmount,
        description: `Ouverture automatique - Fond standard ${openingAmount} DT`,
        wallet: 'Caisse',
        method: 'Espèces',
        is_internal: true,
        user_id: user?.id || null,
        created_at: new Date(date + 'T08:00:00').toISOString()
      });
      
      if (error) throw error;
      
      toast.success(`Ouverture effectuée: ${openingAmount} DT ajoutés à la caisse`);
      loadFinancialState();
      
    } catch (error) {
      console.error('Error performing daily opening:', error);
      toast.error('Erreur lors de l\'ouverture');
    } finally {
      setLoading(false);
    }
  };

  // Automated daily closure
  const performDailyClosure = async () => {
    try {
      setLoading(true);
      
      // Check if already closed
      if (dailyOperations.closureStatus) {
        toast.info('Clôture déjà effectuée pour cette date');
        return;
      }
      
      const { data: { user } } = await supabase.auth.getUser();
      const caisseBalance = balances['Caisse'] || 0;
      const excessAmount = Math.max(0, caisseBalance - BUSINESS_RULES.STANDARD_OPENING_FUND);
      
      // Create closure record
      const closureTransaction = {
        type: 'Cloture',
        source: 'Caisse',
        montant: caisseBalance,
        description: `Clôture automatique - Solde: ${caisseBalance.toFixed(2)} DT`,
        wallet: 'Caisse',
        is_internal: true,
        user_id: user?.id || null,
        created_at: new Date(date + 'T23:00:00').toISOString()
      };
      
      const transactions = [closureTransaction];
      
      // Auto-transfer excess to Coffre if needed
      if (excessAmount >= BUSINESS_RULES.MIN_TRANSFER_AMOUNT) {
        transactions.push(
          {
            type: 'Dépense',
            source: 'Transfert',
            montant: excessAmount,
            description: `Transfert automatique vers Coffre - Excédent: ${excessAmount.toFixed(2)} DT`,
            wallet: 'Caisse',
            is_internal: true,
            user_id: user?.id || null,
            created_at: new Date(date + 'T23:01:00').toISOString()
          },
          {
            type: 'Revenu',
            source: 'Transfert',
            montant: excessAmount,
            description: `Réception automatique depuis Caisse - Excédent: ${excessAmount.toFixed(2)} DT`,
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
        `Clôture effectuée. Gardé en caisse: ${keptAmount.toFixed(2)} DT. ` +
        `Transféré au coffre: ${excessAmount.toFixed(2)} DT.`
      );
      
      loadFinancialState();
      
    } catch (error) {
      console.error('Error performing daily closure:', error);
      toast.error('Erreur lors de la clôture');
    } finally {
      setLoading(false);
    }
  };

  // Manual reconciliation
  const performReconciliation = async (physicalAmount) => {
    try {
      const theoreticalAmount = balances['Caisse'] || 0;
      const difference = physicalAmount - theoreticalAmount;
      const tolerance = BUSINESS_RULES.RECONCILIATION_TOLERANCE;
      
      if (Math.abs(difference) <= tolerance) {
        toast.success('Caisse réconciliée - Écart dans les limites acceptables');
        setReconciliationDialog({ open: false });
        return;
      }
      
      // Create adjustment transaction
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('transactions').insert({
        type: difference > 0 ? 'Revenu' : 'Dépense',
        source: 'Ajustement',
        montant: Math.abs(difference),
        description: `Ajustement de caisse - Écart: ${difference.toFixed(2)} DT (Théorique: ${theoreticalAmount.toFixed(2)} DT, Physique: ${physicalAmount.toFixed(2)} DT)`,
        wallet: 'Caisse',
        is_internal: true,
        user_id: user?.id || null
      });
      
      if (error) throw error;
      
      toast.success(`Ajustement effectué: ${difference > 0 ? '+' : ''}${difference.toFixed(2)} DT`);
      loadFinancialState();
      setReconciliationDialog({ open: false });
      
    } catch (error) {
      console.error('Error performing reconciliation:', error);
      toast.error('Erreur lors de la réconciliation');
    }
  };

  // Calculate daily summary
  const dailySummary = useMemo(() => {
    const sales = dailyOperations.sales.reduce((sum, tx) => sum + (Number(tx.montant) || 0), 0);
    const costs = dailyOperations.sales.reduce((sum, tx) => sum + (Number(tx.cout_total) || 0), 0);
    const expenses = dailyOperations.expenses.reduce((sum, tx) => sum + (Number(tx.montant) || 0), 0);
    const grossProfit = sales - costs;
    const netProfit = grossProfit - expenses;
    
    return {
      transactions: dailyOperations.sales.length + dailyOperations.expenses.length,
      sales,
      costs,
      expenses,
      grossProfit,
      netProfit,
      openingFund: dailyOperations.openingFund ? Number(dailyOperations.openingFund.montant) : 0
    };
  }, [dailyOperations]);

  // Load data on mount and date change
  useEffect(() => {
    loadFinancialState();
  }, [date]);

  const formatCurrency = (amount) => `${(amount || 0).toFixed(2)} DT`;
  const formatDateTime = (dateStr) => new Date(dateStr).toLocaleString('fr-FR');

  return (
    <Box sx={{ p: 3, minHeight: '100vh', bgcolor: 'grey.50' }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
          💰 Système de Gestion de Caisse
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Gestion automatisée et professionnelle des liquidités
        </Typography>
      </Box>

      {/* System Status Alerts */}
      {systemStatus.alerts.length > 0 && (
        <Stack spacing={1} sx={{ mb: 3 }}>
          {systemStatus.alerts.map((alert, index) => (
            <Alert 
              key={index} 
              severity={alert.type}
              icon={
                alert.type === 'error' ? <Warning /> :
                alert.type === 'warning' ? <Info /> : <CheckCircle />
              }
            >
              {alert.message}
            </Alert>
          ))}
        </Stack>
      )}

      {/* Controls */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
          <TextField
            type="date"
            label="Date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
          />
          
          <Button
            variant="contained"
            startIcon={<AccountBalance />}
            onClick={performDailyOpening}
            disabled={!!dailyOperations.openingFund || loading}
            color="success"
          >
            Ouverture
          </Button>
          
          <Button
            variant="contained"
            startIcon={<Lock />}
            onClick={performDailyClosure}
            disabled={!!dailyOperations.closureStatus || loading}
            color="warning"
          >
            Clôture
          </Button>
          
          <Button
            variant="outlined"
            startIcon={<SwapHoriz />}
            onClick={() => setReconciliationDialog({ open: true, physicalAmount: balances['Caisse'] || 0 })}
          >
            Réconciliation
          </Button>
          
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={loadFinancialState}
            disabled={loading}
          >
            Actualiser
          </Button>
          
          <Button
            variant="outlined"
            startIcon={<Settings />}
            onClick={() => setSettingsDialog({ open: true })}
          >
            Paramètres
          </Button>
        </Stack>
      </Paper>

      {/* Wallet Balances */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {Object.entries(WALLETS).map(([walletId, wallet]) => {
          const balance = balances[walletId] || 0;
          const isSelected = selectedWallet === walletId;
          
          return (
            <Grid item xs={12} sm={6} md={2.4} key={walletId}>
              <Card 
                sx={{ 
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  border: isSelected ? 2 : 0,
                  borderColor: 'primary.main',
                  '&:hover': { boxShadow: 3 }
                }}
                onClick={() => setSelectedWallet(walletId)}
              >
                <CardContent sx={{ textAlign: 'center', py: 2 }}>
                  <Typography variant="h4" sx={{ mb: 1 }}>
                    {wallet.icon}
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                    {wallet.name}
                  </Typography>
                  <Typography 
                    variant="h5" 
                    sx={{ 
                      fontWeight: 700,
                      color: balance >= 0 ? 'success.main' : 'error.main'
                    }}
                  >
                    {formatCurrency(balance)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {wallet.description}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Daily Summary */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          📊 Résumé Journalier - {new Date(date).toLocaleDateString('fr-FR')}
        </Typography>
        
        <Grid container spacing={3}>
          <Grid item xs={6} md={2}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">Transactions</Typography>
              <Typography variant="h6">{dailySummary.transactions}</Typography>
            </Box>
          </Grid>
          <Grid item xs={6} md={2}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">Ventes</Typography>
              <Typography variant="h6" color="primary.main">
                {formatCurrency(dailySummary.sales)}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} md={2}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">Coûts</Typography>
              <Typography variant="h6" color="warning.main">
                {formatCurrency(dailySummary.costs)}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} md={2}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">Dépenses</Typography>
              <Typography variant="h6" color="error.main">
                {formatCurrency(dailySummary.expenses)}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} md={2}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">Marge Brute</Typography>
              <Typography variant="h6" color="success.main">
                {formatCurrency(dailySummary.grossProfit)}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} md={2}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">Profit Net</Typography>
              <Typography 
                variant="h6" 
                color={dailySummary.netProfit >= 0 ? 'success.main' : 'error.main'}
              >
                {formatCurrency(dailySummary.netProfit)}
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Reconciliation Dialog */}
      <Dialog 
        open={reconciliationDialog.open} 
        onClose={() => setReconciliationDialog({ open: false })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>🔍 Réconciliation de Caisse</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <Alert severity="info">
              Comptez les espèces physiques dans la caisse et entrez le montant réel.
            </Alert>
            
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Solde théorique (système)
              </Typography>
              <Typography variant="h6">
                {formatCurrency(balances['Caisse'])}
              </Typography>
            </Box>
            
            <TextField
              label="Montant physique compté"
              type="number"
              fullWidth
              inputProps={{ step: '0.01', min: '0' }}
              value={reconciliationDialog.physicalAmount || ''}
              onChange={(e) => setReconciliationDialog(prev => ({
                ...prev,
                physicalAmount: Number(e.target.value)
              }))}
              helperText="Entrez le montant réellement présent dans la caisse"
            />
            
            {reconciliationDialog.physicalAmount !== undefined && (
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Écart détecté
                </Typography>
                <Typography 
                  variant="h6"
                  color={
                    Math.abs((reconciliationDialog.physicalAmount || 0) - (balances['Caisse'] || 0)) <= BUSINESS_RULES.RECONCILIATION_TOLERANCE
                      ? 'success.main' 
                      : 'warning.main'
                  }
                >
                  {((reconciliationDialog.physicalAmount || 0) - (balances['Caisse'] || 0)) > 0 ? '+' : ''}
                  {formatCurrency((reconciliationDialog.physicalAmount || 0) - (balances['Caisse'] || 0))}
                </Typography>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReconciliationDialog({ open: false })}>
            Annuler
          </Button>
          <Button 
            variant="contained"
            onClick={() => performReconciliation(reconciliationDialog.physicalAmount || 0)}
            disabled={reconciliationDialog.physicalAmount === undefined}
          >
            Réconcilier
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default CashManagementSystem;
