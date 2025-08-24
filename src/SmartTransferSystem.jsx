// src/SmartTransferSystem.jsx
import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { toast } from 'react-toastify';
import {
  Box, Paper, Typography, Stack, TextField, Button, Grid, Card, CardContent,
  Table, TableHead, TableRow, TableCell, TableBody, Chip, Alert, 
  FormControl, InputLabel, Select, MenuItem, Dialog, DialogTitle, 
  DialogContent, DialogActions, IconButton, Tooltip, Switch, FormControlLabel
} from '@mui/material';
import {
  SwapHoriz, AccountBalance, TrendingUp, TrendingDown, Send, Receipt,
  Warning, CheckCircle, Info, Refresh, Settings, History, Security
} from '@mui/icons-material';

// WALLET CONFIGURATION with business rules
const WALLET_CONFIG = {
  'Caisse': { 
    name: 'Caisse', 
    icon: '💰', 
    type: 'physical',
    limits: { min: 50, max: 500, optimal: 100 },
    autoRules: { 
      transferExcessTo: 'Coffre',
      replenishFrom: 'Coffre',
      alertThreshold: 50
    }
  },
  'Banque': { 
    name: 'Banque', 
    icon: '🏦', 
    type: 'digital',
    limits: { min: 0, max: null, optimal: null },
    autoRules: {
      transferExcessTo: null,
      replenishFrom: null,
      alertThreshold: 0
    }
  },
  'Coffre': { 
    name: 'Coffre', 
    icon: '🔒', 
    type: 'physical',
    limits: { min: 0, max: null, optimal: null },
    autoRules: {
      transferExcessTo: null,
      replenishFrom: null,
      alertThreshold: 100
    }
  },
  'Carte Postal': { 
    name: 'Carte Postal', 
    icon: '📮', 
    type: 'digital',
    limits: { min: 0, max: null, optimal: null },
    autoRules: {
      transferExcessTo: 'Banque',
      replenishFrom: null,
      alertThreshold: 10
    }
  },
  'Carte Banker': { 
    name: 'Carte Banker', 
    icon: '💳', 
    type: 'digital',
    limits: { min: 0, max: null, optimal: null },
    autoRules: {
      transferExcessTo: 'Banque',
      replenishFrom: null,
      alertThreshold: 10
    }
  }
};

// TRANSFER RULES
const TRANSFER_RULES = {
  MIN_AMOUNT: 5,              // Minimum transfer amount
  MAX_DAILY_TRANSFERS: 50,    // Maximum transfers per day
  AUTO_APPROVAL_LIMIT: 1000,  // Amounts below this are auto-approved
  RECONCILIATION_TOLERANCE: 1, // 1 DT tolerance for reconciliation
  SMART_SUGGESTIONS: true,    // Enable smart transfer suggestions
  RISK_THRESHOLDS: {
    LOW: 100,
    MEDIUM: 500,
    HIGH: 1000
  }
};

function SmartTransferSystem() {
  // Core state
  const [balances, setBalances] = useState({});
  const [transfers, setTransfers] = useState([]);
  const [smartSuggestions, setSmartSuggestions] = useState([]);
  const [systemAlerts, setSystemAlerts] = useState([]);
  
  // Transfer form state
  const [transferForm, setTransferForm] = useState({
    from: 'Caisse',
    to: 'Banque',
    amount: '',
    description: '',
    scheduled: false,
    scheduleTime: ''
  });
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [autoMode, setAutoMode] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  // Real-time balance calculation
  const calculateBalances = async () => {
    try {
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('type,montant,wallet,description,source,is_internal,method')
        .order('created_at', { ascending: true });
        
      if (error) throw error;
      
      const balances = Object.keys(WALLET_CONFIG).reduce((acc, wallet) => {
        acc[wallet] = 0;
        return acc;
      }, {});
      
      // Process all transactions for accurate balances
      (transactions || []).forEach(tx => {
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

  // Smart wallet determination
  const determineWallet = (transaction) => {
    if (transaction.wallet && WALLET_CONFIG[transaction.wallet]) {
      return transaction.wallet;
    }
    
    const method = (transaction.method || '').toLowerCase();
    const source = (transaction.source || '').toLowerCase();
    const description = (transaction.description || '').toLowerCase();
    
    // Cash transactions
    if (method.includes('espèces') || method.includes('cash') || source.includes('caisse')) {
      return 'Caisse';
    }
    
    // Card transactions
    if (method.includes('carte') || source.includes('carte') || description.includes('carte')) {
      if (source.includes('postal') || description.includes('postal')) return 'Carte Postal';
      if (source.includes('banker') || description.includes('banker')) return 'Carte Banker';
      return 'Banque';
    }
    
    // Safe transactions
    if (source.includes('coffre') || description.includes('coffre')) return 'Coffre';
    
    return 'Caisse';
  };

  // Generate smart transfer suggestions
  const generateSmartSuggestions = (balances) => {
    const suggestions = [];
    
    Object.entries(WALLET_CONFIG).forEach(([walletId, config]) => {
      const balance = balances[walletId] || 0;
      const { limits, autoRules } = config;
      
      // Excess cash suggestion
      if (limits.max && balance > limits.max) {
        const excess = balance - limits.optimal;
        suggestions.push({
          type: 'excess',
          priority: 'high',
          from: walletId,
          to: autoRules.transferExcessTo,
          amount: excess,
          reason: `Excédent de ${excess.toFixed(2)} DT détecté en ${config.name}`,
          action: 'Transférer vers ' + WALLET_CONFIG[autoRules.transferExcessTo]?.name
        });
      }
      
      // Low balance suggestion
      if (balance < limits.min && autoRules.replenishFrom) {
        const needed = limits.optimal - balance;
        const sourceBalance = balances[autoRules.replenishFrom] || 0;
        
        if (sourceBalance >= needed) {
          suggestions.push({
            type: 'replenish',
            priority: 'medium',
            from: autoRules.replenishFrom,
            to: walletId,
            amount: needed,
            reason: `Solde faible en ${config.name}: ${balance.toFixed(2)} DT`,
            action: 'Approvisionner depuis ' + WALLET_CONFIG[autoRules.replenishFrom]?.name
          });
        }
      }
      
      // Security alert
      if (config.type === 'physical' && balance > TRANSFER_RULES.RISK_THRESHOLDS.HIGH) {
        suggestions.push({
          type: 'security',
          priority: 'critical',
          from: walletId,
          to: null,
          amount: balance - TRANSFER_RULES.RISK_THRESHOLDS.MEDIUM,
          reason: `Risque sécuritaire: ${balance.toFixed(2)} DT en liquide`,
          action: 'Transfert sécuritaire recommandé'
        });
      }
    });
    
    return suggestions.sort((a, b) => {
      const priority = { critical: 4, high: 3, medium: 2, low: 1 };
      return priority[b.priority] - priority[a.priority];
    });
  };

  // Generate system alerts
  const generateSystemAlerts = (balances, suggestions) => {
    const alerts = [];
    
    // Balance alerts
    Object.entries(WALLET_CONFIG).forEach(([walletId, config]) => {
      const balance = balances[walletId] || 0;
      
      if (balance < config.autoRules.alertThreshold) {
        alerts.push({
          type: 'warning',
          message: `⚠️ ${config.name}: Solde faible (${balance.toFixed(2)} DT)`
        });
      }
    });
    
    // Critical suggestions
    suggestions.filter(s => s.priority === 'critical').forEach(suggestion => {
      alerts.push({
        type: 'error',
        message: `🚨 ${suggestion.reason}`
      });
    });
    
    // Daily transfer limit check
    const dailyTransferCount = transfers.length;
    if (dailyTransferCount > TRANSFER_RULES.MAX_DAILY_TRANSFERS * 0.8) {
      alerts.push({
        type: 'info',
        message: `📊 Limite journalière: ${dailyTransferCount}/${TRANSFER_RULES.MAX_DAILY_TRANSFERS} transferts`
      });
    }
    
    return alerts;
  };

  // Load transfers for selected date
  const loadTransfers = async () => {
    try {
      const startDate = new Date(selectedDate + 'T00:00:00').toISOString();
      const endDate = new Date(selectedDate + 'T23:59:59.999').toISOString();
      
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .or('source.ilike.%Transfert%,description.ilike.%Transfert%')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      
      setTransfers(data || []);
    } catch (error) {
      console.error('Error loading transfers:', error);
      toast.error('Erreur lors du chargement des transferts');
    }
  };

  // Execute smart transfer
  const executeTransfer = async (from, to, amount, description = '', auto = false) => {
    try {
      if (amount < TRANSFER_RULES.MIN_AMOUNT) {
        toast.error(`Montant minimum: ${TRANSFER_RULES.MIN_TRANSFER_AMOUNT} DT`);
        return false;
      }
      
      const fromBalance = balances[from] || 0;
      if (amount > fromBalance) {
        toast.error(`Solde insuffisant en ${WALLET_CONFIG[from]?.name}: ${fromBalance.toFixed(2)} DT`);
        return false;
      }
      
      const { data: { user } } = await supabase.auth.getUser();
      const transferDescription = description || `Transfert ${auto ? 'automatique' : 'manuel'}: ${WALLET_CONFIG[from]?.name} → ${WALLET_CONFIG[to]?.name}`;
      
      const transactions = [
        {
          type: 'Dépense',
          source: 'Transfert',
          montant: amount,
          description: `${transferDescription} - Sortie`,
          wallet: from,
          is_internal: true,
          user_id: user?.id || null
        },
        {
          type: 'Revenu',
          source: 'Transfert',
          montant: amount,
          description: `${transferDescription} - Entrée`,
          wallet: to,
          is_internal: true,
          user_id: user?.id || null
        }
      ];
      
      const { error } = await supabase.from('transactions').insert(transactions);
      if (error) throw error;
      
      toast.success(`✅ Transfert effectué: ${amount.toFixed(2)} DT (${WALLET_CONFIG[from]?.name} → ${WALLET_CONFIG[to]?.name})`);
      return true;
      
    } catch (error) {
      console.error('Error executing transfer:', error);
      toast.error('Erreur lors du transfert');
      return false;
    }
  };

  // Execute suggestion
  const executeSuggestion = async (suggestion) => {
    const success = await executeTransfer(
      suggestion.from,
      suggestion.to,
      suggestion.amount,
      suggestion.reason,
      true
    );
    
    if (success) {
      loadData();
    }
  };

  // Auto-execute high priority suggestions
  const executeAutoTransfers = async () => {
    if (!autoMode) return;
    
    const highPrioritySuggestions = smartSuggestions.filter(s => 
      s.priority === 'critical' && s.to
    );
    
    for (const suggestion of highPrioritySuggestions) {
      await executeSuggestion(suggestion);
      // Add delay between auto-transfers
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  };

  // Manual transfer submission
  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    
    const amount = Number(transferForm.amount);
    if (!amount || amount <= 0) {
      toast.error('Montant invalide');
      return;
    }
    
    if (transferForm.from === transferForm.to) {
      toast.error('Les portefeuilles source et destination doivent être différents');
      return;
    }
    
    setLoading(true);
    
    try {
      const success = await executeTransfer(
        transferForm.from,
        transferForm.to,
        amount,
        transferForm.description
      );
      
      if (success) {
        setTransferForm(prev => ({ ...prev, amount: '', description: '' }));
        loadData();
      }
    } finally {
      setLoading(false);
    }
  };

  // Load all data
  const loadData = async () => {
    setLoading(true);
    try {
      const [newBalances] = await Promise.all([
        calculateBalances(),
        loadTransfers()
      ]);
      
      setBalances(newBalances);
      
      // Generate smart insights
      const suggestions = generateSmartSuggestions(newBalances);
      setSmartSuggestions(suggestions);
      
      const alerts = generateSystemAlerts(newBalances, suggestions);
      setSystemAlerts(alerts);
      
      // Auto-execute if enabled
      if (autoMode && suggestions.some(s => s.priority === 'critical')) {
        setTimeout(executeAutoTransfers, 2000);
      }
      
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  // Load data on mount and date changes
  useEffect(() => {
    loadData();
  }, [selectedDate]);

  // Form validation
  const isTransferValid = useMemo(() => {
    const amount = Number(transferForm.amount);
    return (
      amount > 0 &&
      amount >= TRANSFER_RULES.MIN_AMOUNT &&
      transferForm.from !== transferForm.to &&
      amount <= (balances[transferForm.from] || 0)
    );
  }, [transferForm, balances]);

  const formatCurrency = (amount) => `${(amount || 0).toFixed(2)} DT`;
  const formatDateTime = (dateStr) => new Date(dateStr).toLocaleString('fr-FR');

  return (
    <Box sx={{ p: 3, minHeight: '100vh', bgcolor: 'grey.50' }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
          🔄 Système de Transferts Intelligent
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Gestion automatisée des flux financiers entre portefeuilles
        </Typography>
      </Box>

      {/* System Alerts */}
      {systemAlerts.length > 0 && (
        <Stack spacing={1} sx={{ mb: 3 }}>
          {systemAlerts.map((alert, index) => (
            <Alert key={index} severity={alert.type}>
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
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
          />
          
          <FormControlLabel
            control={
              <Switch
                checked={autoMode}
                onChange={(e) => setAutoMode(e.target.checked)}
              />
            }
            label="Mode automatique"
          />
          
          <FormControlLabel
            control={
              <Switch
                checked={showAdvanced}
                onChange={(e) => setShowAdvanced(e.target.checked)}
              />
            }
            label="Vue avancée"
          />
          
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={loadData}
            disabled={loading}
          >
            Actualiser
          </Button>
        </Stack>
      </Paper>

      {/* Wallet Balances */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {Object.entries(WALLET_CONFIG).map(([walletId, config]) => {
          const balance = balances[walletId] || 0;
          const { limits } = config;
          
          let status = 'normal';
          let statusColor = 'success.main';
          
          if (limits.max && balance > limits.max) {
            status = 'excess';
            statusColor = 'warning.main';
          } else if (balance < limits.min) {
            status = 'low';
            statusColor = 'error.main';
          }
          
          return (
            <Grid item xs={12} sm={6} md={2.4} key={walletId}>
              <Card sx={{ height: '100%' }}>
                <CardContent sx={{ textAlign: 'center' }}>
                  <Typography variant="h4" sx={{ mb: 1 }}>
                    {config.icon}
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                    {config.name}
                  </Typography>
                  <Typography 
                    variant="h5" 
                    sx={{ fontWeight: 700, color: statusColor, mb: 1 }}
                  >
                    {formatCurrency(balance)}
                  </Typography>
                  
                  {showAdvanced && (
                    <Stack spacing={0.5}>
                      <Typography variant="caption" color="text.secondary">
                        Type: {config.type}
                      </Typography>
                      {limits.min > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          Min: {formatCurrency(limits.min)}
                        </Typography>
                      )}
                      {limits.max && (
                        <Typography variant="caption" color="text.secondary">
                          Max: {formatCurrency(limits.max)}
                        </Typography>
                      )}
                    </Stack>
                  )}
                  
                  {status !== 'normal' && (
                    <Chip
                      size="small"
                      label={status === 'excess' ? 'Excédent' : 'Faible'}
                      color={status === 'excess' ? 'warning' : 'error'}
                      sx={{ mt: 1 }}
                    />
                  )}
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Smart Suggestions */}
      {smartSuggestions.length > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            🤖 Suggestions Intelligentes
          </Typography>
          
          <Stack spacing={2}>
            {smartSuggestions.slice(0, 3).map((suggestion, index) => (
              <Alert
                key={index}
                severity={
                  suggestion.priority === 'critical' ? 'error' :
                  suggestion.priority === 'high' ? 'warning' : 'info'
                }
                action={
                  suggestion.to && (
                    <Button
                      color="inherit"
                      size="small"
                      onClick={() => executeSuggestion(suggestion)}
                      disabled={loading}
                    >
                      EXÉCUTER
                    </Button>
                  )
                }
              >
                <strong>{suggestion.reason}</strong><br />
                {suggestion.action}
                {suggestion.amount && ` (${formatCurrency(suggestion.amount)})`}
              </Alert>
            ))}
          </Stack>
        </Paper>
      )}

      {/* Transfer Form */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          💸 Nouveau Transfert
        </Typography>
        
        <form onSubmit={handleTransferSubmit}>
          <Grid container spacing={2} alignItems="end">
            <Grid item xs={12} sm={2}>
              <FormControl fullWidth size="small">
                <InputLabel>De</InputLabel>
                <Select
                  value={transferForm.from}
                  onChange={(e) => setTransferForm(prev => ({ ...prev, from: e.target.value }))}
                  label="De"
                >
                  {Object.entries(WALLET_CONFIG).map(([id, config]) => (
                    <MenuItem key={id} value={id}>
                      {config.icon} {config.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Vers</InputLabel>
                <Select
                  value={transferForm.to}
                  onChange={(e) => setTransferForm(prev => ({ ...prev, to: e.target.value }))}
                  label="Vers"
                >
                  {Object.entries(WALLET_CONFIG).map(([id, config]) => (
                    <MenuItem key={id} value={id}>
                      {config.icon} {config.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={2}>
              <TextField
                label="Montant (DT)"
                type="number"
                size="small"
                fullWidth
                inputProps={{ step: '0.01', min: TRANSFER_RULES.MIN_AMOUNT }}
                value={transferForm.amount}
                onChange={(e) => setTransferForm(prev => ({ ...prev, amount: e.target.value }))}
                helperText={`Disponible: ${formatCurrency(balances[transferForm.from])}`}
              />
            </Grid>
            
            <Grid item xs={12} sm={4}>
              <TextField
                label="Description (optionnel)"
                size="small"
                fullWidth
                value={transferForm.description}
                onChange={(e) => setTransferForm(prev => ({ ...prev, description: e.target.value }))}
              />
            </Grid>
            
            <Grid item xs={12} sm={2}>
              <Button
                type="submit"
                variant="contained"
                fullWidth
                startIcon={<Send />}
                disabled={!isTransferValid || loading}
              >
                Transférer
              </Button>
            </Grid>
          </Grid>
        </form>
      </Paper>

      {/* Recent Transfers */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          📋 Transferts Récents ({transfers.length})
        </Typography>
        
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date/Heure</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Portefeuille</TableCell>
                <TableCell align="right">Montant</TableCell>
                <TableCell>Description</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transfers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    Aucun transfert trouvé
                  </TableCell>
                </TableRow>
              ) : (
                transfers.map((transfer) => (
                  <TableRow key={transfer.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {formatDateTime(transfer.created_at)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        icon={transfer.type === 'Revenu' ? <TrendingUp /> : <TrendingDown />}
                        label={transfer.type === 'Revenu' ? 'Entrée' : 'Sortie'}
                        color={transfer.type === 'Revenu' ? 'success' : 'error'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      {WALLET_CONFIG[transfer.wallet]?.icon} {transfer.wallet}
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      {transfer.type === 'Revenu' ? '+' : '-'}{formatCurrency(transfer.montant)}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 300 }}>
                      {transfer.description}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}

export default SmartTransferSystem;
