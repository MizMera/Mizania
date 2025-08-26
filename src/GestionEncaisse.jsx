// src/GestionEncaisse.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { 
  Box, Paper, Typography, Stack, TextField, Button, Table, TableHead, TableRow, TableCell, TableBody, 
  Chip, Card, Grid, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Tooltip,
  FormControl, InputLabel, Select, MenuItem, Alert, TableContainer, Switch, FormControlLabel
} from '@mui/material';
import { 
  PictureAsPdf, Edit, Delete, Save, Cancel, Refresh, TrendingUp, AccountBalance, 
  DeleteOutline, Lock, CheckCircle as CheckCircleIcon, Warning, Info, SwapHoriz, Settings, LockOutlined as LockIcon
} from '@mui/icons-material';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-toastify';
import { format } from 'date-fns';

// INTELLIGENT CASH MANAGEMENT CONFIGURATION
const SMART_CASH_CONFIG = {
  FIXED_OPENING_AMOUNT: 50,
  AUTO_TRANSFER_THRESHOLD: 500,
  MIN_OPERATING_AMOUNT: 50,
  RECONCILIATION_TOLERANCE: 1,
  AUTO_CLOSURE_TIME: 20,
  WALLETS: {
    'Caisse': { name: 'Caisse', icon: '', isPhysical: true },
    'Banque': { name: 'Banque', icon: '', isPhysical: false },
    'Coffre': { name: 'Coffre', icon: '', isPhysical: true },
    'Carte Postal': { name: 'Carte Postal', icon: '', isPhysical: false },
    'Carte Banker': { name: 'Carte Banker', icon: '', isPhysical: false }
  }
};

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
    // Use local date string (YYYY-MM-DD) to avoid timezone shift from toISOString
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
  
  // INTELLIGENT CASH MANAGEMENT STATE
  const [smartMode, setSmartMode] = useState(true);
  const [systemAlerts, setSystemAlerts] = useState([]);
  const [reconciliationDialog, setReconciliationDialog] = useState({ open: false, physicalAmount: '' });
  const [balances, setBalances] = useState({});
  const [dailyStatus, setDailyStatus] = useState({
    isOpened: false,
    isClosed: false,
    openingFund: null,
    closureRecord: null
  });
  
  // Flexible opening amount state
  const [openingAmountDialog, setOpeningAmountDialog] = useState({ 
    open: false, 
    amount: SMART_CASH_CONFIG.FIXED_OPENING_AMOUNT,
    mode: 'add' // 'add' or 'set'
  });
  
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

  // Remove useless counts like "1 ligne(s), 1 article(s)" from POS descriptions when displaying
  const cleanDescription = (desc = '') => {
    try {
      // Remove only the counts block: " | N ligne(s), M article(s) | "
      return desc.replace(/\s\|\s\d+\sligne\(s\),\s\d+\sarticle\(s\)\s\|\s/gi, ' | ');
    } catch {
      return desc;
    }
  };

  // In daily view, strip the Ticket segment from description (e.g., "Ticket 123 | ...")
  const stripTicketFromDesc = (desc = '') => {
    try {
      let s = desc;
      // Remove the "Ticket ..." segment with optional surrounding pipes/spaces
      s = s.replace(/(?:^|\s*\|\s*)Ticket\s[^|]+(?=\s*\||$)/gi, '');
      // Normalize duplicated or dangling separators
      s = s.replace(/\s*\|\s*\|\s*/g, ' | ');
      s = s.replace(/^\s*\|\s*|\s*\|\s*$/g, '');
      return s.trim();
    } catch {
      return desc;
    }
  };

  // INTELLIGENT CASH MANAGEMENT FUNCTIONS
  
  // Smart wallet determination
  const determineWallet = (transaction) => {
    if (transaction.wallet && SMART_CASH_CONFIG.WALLETS[transaction.wallet]) {
      return transaction.wallet;
    }
    
    const method = (transaction.method || '').toLowerCase();
    const source = (transaction.source || '').toLowerCase();
    const description = (transaction.description || '').toLowerCase();
    
    if (method.includes('espèces') || method.includes('cash') || source.includes('caisse')) {
      return 'Caisse';
    }
    if (method.includes('carte') || source.includes('carte') || description.includes('carte')) {
      if (source.includes('postal') || description.includes('postal')) return 'Carte Postal';
      if (source.includes('banker') || description.includes('banker')) return 'Carte Banker';
      return 'Banque';
    }
    if (source.includes('coffre') || description.includes('coffre')) return 'Coffre';
    return 'Caisse';
  };

  // Calculate real-time balances (optimized with optional date range)
  const calculateRealTimeBalances = async (startIso, endIso) => {
    try {
      let query = supabase
        .from('transactions')
        .select('type,montant,wallet,description,source,is_internal,created_at');
      if (startIso && endIso) {
        query = query.gte('created_at', startIso).lte('created_at', endIso);
      }
      const { data: allTransactions, error } = await query.order('created_at', { ascending: true });
      if (error) throw error;
      const newBalances = Object.keys(SMART_CASH_CONFIG.WALLETS).reduce((acc, w) => { acc[w] = 0; return acc; }, {});
      for (const tx of allTransactions || []) {
        const wallet = tx.wallet || determineWallet(tx);
        if (!wallet) continue;
        const amount = Number(tx.montant) || 0;
        if (tx.type === 'Revenu') newBalances[wallet] += amount; else if (tx.type === 'Dépense') newBalances[wallet] -= amount;
      }
      setBalances(prev => {
        const changed = Object.keys(newBalances).some(k => newBalances[k] !== prev[k]);
        return changed ? newBalances : prev;
      });
      return newBalances;
    } catch (error) {
      console.error('Error calculating balances:', error);
      return {};
    }
  };

  // Generate smart alerts
  const generateSmartAlerts = (balances, dailyStatus) => {
    const alerts = [];
    const caisseBalance = balances['Caisse'] || 0;
    const actualOpeningAmount = dailyStatus.openingAmount || SMART_CASH_CONFIG.FIXED_OPENING_AMOUNT;
    const now = new Date();
    const currentHour = now.getHours();
    
    // Cash level alerts (using actual opening amount)
    if (caisseBalance > actualOpeningAmount + SMART_CASH_CONFIG.AUTO_TRANSFER_THRESHOLD) {
      const excess = caisseBalance - actualOpeningAmount;
      alerts.push({
        type: 'warning',
        message: `Niveau de caisse élevé: ${caisseBalance.toFixed(2)} DT. Excédent de ${excess.toFixed(2)} DT à transférer vers le coffre.`,
        action: 'transfer_to_safe'
      });
    }
    
    if (caisseBalance < SMART_CASH_CONFIG.MIN_OPERATING_AMOUNT) {
      alerts.push({
        type: 'error',
        message: `Caisse insuffisante: ${caisseBalance.toFixed(2)} DT < ${SMART_CASH_CONFIG.MIN_OPERATING_AMOUNT} DT requis.`,
        action: 'add_funds'
      });
    }
    
    // Opening status
    if (!dailyStatus.openingFund) {
      alerts.push({
        type: 'info',
        message: 'Ouverture journalière non effectuée. Choisissez le montant de fond de caisse.',
        action: 'daily_opening'
      });
    }
    
    // Closure status
    if (currentHour >= SMART_CASH_CONFIG.AUTO_CLOSURE_TIME && !dailyStatus.closureRecord) {
      alerts.push({
        type: 'warning',
        message: `Clôture journalière en attente. ${actualOpeningAmount} DT seront conservés en caisse.`,
        action: 'daily_closure'
      });
    }
    
    return alerts;
  };

  const load = async () => {
    try {
      setLoading(true);
      setSystemAlerts([]); // Clear previous alerts
      
      let start, end;
      if (viewMode === 'daily') {
        // Build local day boundaries and convert after
        start = new Date(date + 'T00:00:00');
        end = new Date(date + 'T23:59:59.999');
      } else {
        start = new Date(from);
        end = new Date(to);
      }

      const startIso = start.toISOString();
      const endIso = end.toISOString();

      // Revenus: include everything in the window
      const { data: transData, error: transError } = await supabase
        .from('transactions')
        .select('*')
        .eq('type', 'Revenu')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: false });
      if (transError) throw transError;
      setTransactions(transData || []);

      // Dépenses (daily)
      let depData = [];
      if (viewMode === 'daily') {
        let depBase = supabase
          .from('transactions')
          .select('*')
          .eq('type', 'Dépense')
          .gte('created_at', startIso)
          .lte('created_at', endIso)
          .order('created_at', { ascending: true });
        try { depBase = depBase.neq('is_internal', true); } catch (_) {}
        let { data: depDataResult, error: depErr } = await depBase;
        if (depErr && String(depErr.message || '').toLowerCase().includes('is_internal')) {
          const retry = await supabase
            .from('transactions')
            .select('*')
            .eq('type', 'Dépense')
            .gte('created_at', startIso)
            .lte('created_at', endIso)
            .order('created_at', { ascending: true });
          depDataResult = retry.data; depErr = retry.error;
        }
        if (depErr) throw depErr;
        depData = depDataResult || [];
        setDepenses(depData);
      } else {
        setDepenses([]);
      }

      // INTELLIGENT FEATURES: Calculate balances and generate alerts
      if (smartMode) {
        try {
          const newBalances = await calculateRealTimeBalances(startIso, endIso);
          
          // Detect daily status using the correct schema
          const allTransactions = [...(transData || []), ...depData];
          const openingFund = allTransactions.find(tx => 
            tx.is_internal === true && 
            (tx.source === 'ouverture' || String(tx.description || '').toLowerCase().includes('ouverture'))
          );
          const closureRecord = allTransactions.find(tx => 
            tx.is_internal === true && 
            (tx.source === 'cloture' || String(tx.description || '').toLowerCase().includes('clôture'))
          );
          
          const newDailyStatus = {
            isOpened: !!openingFund,
            isClosed: !!closureRecord,
            openingFund,
            closureRecord,
            openingAmount: openingFund ? (openingFund.cout_total || openingFund.montant) : 0
          };
          
          setDailyStatus(newDailyStatus);
          
          // Update the Fund display to match the opening amount
          if (openingFund) {
            const actualOpeningAmount = openingFund.cout_total || openingFund.montant || 0;
            setFondCaisse(actualOpeningAmount.toString());
          }
          
          // Generate smart alerts
          const alerts = generateSmartAlerts(newBalances, newDailyStatus);
          setSystemAlerts(alerts);
        } catch (smartError) {
          console.error('Smart features error:', smartError);
          setSystemAlerts([{
            type: 'warning',
            message: 'Fonctionnalités intelligentes temporairement indisponibles.'
          }]);
        }
      }
      
    } catch (e) {
      console.error('Load error:', e);
      toast.error('Erreur lors du chargement des données.');
    } finally {
      setLoading(false);
    }
  };

  // Load data when filters change
  useEffect(() => {
    load();
  }, [viewMode, date, from, to, paymentMode]);

  // Smart automated functions for cash management
  const openCashRegister = async (amount = SMART_CASH_CONFIG.FIXED_OPENING_AMOUNT, mode = 'add') => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');
      
      const currentBalance = balances?.Caisse || 0;
      let actualOpeningAmount = amount;
      let transactionAmount = amount;
      
      if (mode === 'set' && currentBalance > 0) {
        // We want to SET the caisse to exactly 'amount', so we need to adjust
        transactionAmount = amount - currentBalance;
        if (transactionAmount < 0) {
          // Need to remove money (negative transaction)
          const { error: removeError } = await supabase.from('transactions').insert({
            type: 'Dépense',
            source: 'ajustement',
            montant: Math.abs(transactionAmount),
            description: `Ajustement caisse - ${format(new Date(), 'dd/MM/yyyy')} - Solde précédent: ${currentBalance} DT`,
            user_id: user.id,
            wallet: 'Caisse',
            is_internal: true
          });
          if (removeError) throw removeError;
        }
        
        // Always create an opening transaction to mark the caisse as opened
        // For "set" mode, this records the adjustment (could be 0), not the final amount
        const { error } = await supabase.from('transactions').insert({
          type: transactionAmount >= 0 ? 'Revenu' : 'Dépense',
          source: 'ouverture',
          montant: Math.abs(transactionAmount),
          description: transactionAmount === 0 
            ? `Ouverture caisse - ${format(new Date(), 'dd/MM/yyyy')} - Fond confirmé: ${amount} DT (aucun ajustement nécessaire)`
            : `Ouverture caisse - ${format(new Date(), 'dd/MM/yyyy')} - Fond exact: ${amount} DT (ajustement: ${transactionAmount > 0 ? '+' : ''}${transactionAmount.toFixed(2)} DT)`,
          user_id: user.id,
          wallet: 'Caisse',
          is_internal: true,
          // Store the final opening amount in a custom field for tracking
          cout_total: amount // Using cout_total to store the actual opening fund amount
        });
        if (error) throw error;
      } else {
        // Normal mode: ADD the amount
        const { error } = await supabase.from('transactions').insert({
          type: 'Revenu',
          source: 'ouverture',
          montant: amount,
          description: `Ouverture caisse - ${format(new Date(), 'dd/MM/yyyy')} - Fond de caisse: ${amount} DT`,
          user_id: user.id,
          wallet: 'Caisse',
          is_internal: true,
          cout_total: currentBalance + amount // Store the final opening fund amount
        });
        if (error) throw error;
        actualOpeningAmount = currentBalance + amount;
      }
      
      setDailyStatus(prev => ({ 
        ...prev, 
        isOpened: true, 
        openingFund: { montant: actualOpeningAmount },
        openingAmount: actualOpeningAmount 
      }));
      setFondCaisse(actualOpeningAmount.toString()); // Update the Fund display
      setOpeningAmountDialog({ open: false, amount: SMART_CASH_CONFIG.FIXED_OPENING_AMOUNT, mode: 'add' });
      
      if (mode === 'set') {
        toast.success(`Caisse ajustée à ${amount} DT exactement`);
      } else {
        toast.success(`Caisse ouverte avec ${amount} DT ajoutés`);
      }
      load();
    } catch (error) {
      console.error('Opening error:', error);
      toast.error('Erreur lors de l\'ouverture de la caisse: ' + (error.message || 'Erreur inconnue'));
    }
  };

  const openCashRegisterWithCustomAmount = async () => {
    const fullBalances = await calculateRealTimeBalances();
    const currentBalance = fullBalances?.Caisse != null ? fullBalances.Caisse : (balances?.Caisse || 0);
    setOpeningAmountDialog({
      open: true,
      amount: currentBalance > 0 ? currentBalance.toFixed(2) : SMART_CASH_CONFIG.FIXED_OPENING_AMOUNT,
      mode: currentBalance > 0 ? 'set' : 'add'
    });
  };

  const handleOpeningAmountConfirm = () => {
    const amount = parseFloat(openingAmountDialog.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Veuillez entrer un montant valide');
      return;
    }
    openCashRegister(amount, openingAmountDialog.mode);
  };

  const closeCashRegister = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');
      
      const caisseBalance = balances?.Caisse || 0;
      const actualOpeningAmount = dailyStatus.openingAmount || dailyStatus.openingFund?.montant || SMART_CASH_CONFIG.FIXED_OPENING_AMOUNT;
      const expectedTransfer = Math.max(0, caisseBalance - actualOpeningAmount);
      
      if (expectedTransfer > 0) {
        // Transfer excess to safe
        await performSmartTransfer('Caisse', 'Coffre', expectedTransfer, 'Clôture journalière');
      }
      
      const now = new Date();
      const { error } = await supabase.from('transactions').insert({
        type: 'Dépense',
        source: 'cloture',
        montant: 0,
        description: `Clôture caisse - ${format(now, 'dd/MM/yyyy')} - Conservé: ${actualOpeningAmount} DT`,
        user_id: user.id,
        wallet: 'Caisse',
        is_internal: true
      });

      if (error) throw error;

      setDailyStatus(prev => ({ ...prev, isClosed: true, closureRecord: { montant: 0 } }));
      toast.success(`Caisse fermée. ${expectedTransfer > 0 ? `${expectedTransfer.toFixed(2)} DT transférés au coffre, ${actualOpeningAmount} DT conservés` : `${actualOpeningAmount} DT conservés, aucun transfert nécessaire`}`);
      load();
    } catch (error) {
      console.error('Closure error:', error);
      toast.error('Erreur lors de la fermeture de la caisse: ' + (error.message || 'Erreur inconnue'));
    }
  };

  const performSmartTransfer = async (fromWallet, toWallet, amount, reason) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');
      
      const now = new Date();
      const transfers = [
        {
          type: 'Dépense',
          source: 'transfert',
          montant: amount,
          description: `Transfert vers ${toWallet} - ${reason}`,
          user_id: user.id,
          wallet: fromWallet,
          is_internal: true
        },
        {
          type: 'Revenu',
          source: 'transfert',
          montant: amount,
          description: `Transfert depuis ${fromWallet} - ${reason}`,
          user_id: user.id,
          wallet: toWallet,
          is_internal: true
        }
      ];

      const { error } = await supabase.from('transactions').insert(transfers);
      if (error) throw error;

      toast.success(`Transfert de ${amount.toFixed(2)} DT: ${fromWallet} → ${toWallet}`);
      load();
    } catch (error) {
      console.error('Transfer error:', error);
      toast.error('Erreur lors du transfert: ' + (error.message || 'Erreur inconnue'));
    }
  };

  // Identify opening fund/internal revenue entries
  const isOpeningFund = (r) => {
    try {
      const src = String(r?.source || '').toLowerCase();
      const desc = String(r?.description || '').toLowerCase();
      return r?.is_internal === true || 
             src.includes('ouverture') || 
             desc.includes('fond de caisse') ||
             desc.includes('ouverture caisse');
    } catch {
      return false;
    }
  };

  const totals = useMemo(() => {
    // Use wallet if present; fallback to method mapping
    const getWallet = (r) => {
      if (r?.wallet) return r.wallet;
      if (r?.method === 'Espèces') return 'Caisse';
      if (r?.method === 'Carte') return 'Banque';
      return undefined;
    };

    // Exclude opening fund/internal entries from sales/profit
    const revenusVentes = transactions.filter(r => !isOpeningFund(r));
    const depensesNonInternal = depenses.filter(d => !d.is_internal);

    const total = revenusVentes.reduce((s, r) => s + Number(r.montant || 0), 0);
    const couts = revenusVentes.reduce((s, r) => s + Number(r.cout_total || 0), 0);
    const netVentes = total - couts;
    const totalDepenses = depensesNonInternal.reduce((s, r) => s + Number(r.montant || 0), 0);

    // Include ALL cash movements (including opening funds) for theoretical cash calculation
    const caisseIn = transactions.filter(r => getWallet(r) === 'Caisse').reduce((s, r) => {
      // For opening transactions, use the actual opening amount (cout_total) if available
      if (isOpeningFund(r) && r.cout_total !== undefined) {
        return s + Number(r.cout_total || 0);
      }
      return s + Number(r.montant || 0);
    }, 0);
    const caisseOut = depenses.filter(d => getWallet(d) === 'Caisse').reduce((s, r) => s + Number(r.montant || 0), 0);
    const caisseTheorique = caisseIn - caisseOut;

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
      description: transaction.description || '',
      created_at: transaction.created_at
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
          description: editValues.description,
          created_at: editValues.created_at
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
      if (!Number.isFinite(montant) || !(montant > 0)) {
        toast.error('Montant de fond invalide');
        return;
      }

      // Prevent double fund entries for the selected day; allow update instead
      const start = new Date(date + 'T00:00:00');
      const end = new Date(date + 'T23:59:59.999');
      const startIso = start.toISOString();
      const endIso = end.toISOString();

      const { data: existingFunds, error: exErr } = await supabase
        .from('transactions')
        .select('id, montant, source, description, created_at')
        .eq('type', 'Revenu')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .or('source.ilike.%ouverture%,description.ilike.%fond de caisse%')
        .order('created_at', { ascending: false });
      if (exErr) throw exErr;

      if (existingFunds && existingFunds.length > 0) {
        const existing = existingFunds[0];
        const current = Number(existing.montant || 0);
        if (current === montant) {
          toast.info("Un fond d'ouverture est déjà enregistré pour cette date avec le même montant.");
          return;
        }
        const confirmUpdate = window.confirm(`Un fond d'ouverture existe déjà (${current.toFixed(2)} DT). Voulez-vous le mettre à jour à ${montant.toFixed(2)} DT ?`);
        if (!confirmUpdate) {
          toast.info('Aucune modification effectuée.');
          return;
        }
        const { error: updErr } = await supabase
          .from('transactions')
          .update({ montant })
          .eq('id', existing.id);
        if (updErr) throw updErr;
        toast.success('Fond de caisse mis à jour.');
        load();
        return;
      }

      // Try to record opening fund with extended fields; fallback if columns don't exist
      const base = {
        type: 'Revenu',
        source: 'Ouverture',
        montant,
        description: `Fond de caisse (ouverture) ${date}`,
        user_id: user?.id || null
      };
      const { error: insErr } = await supabase.from('transactions').insert({
        ...base,
        wallet: 'Caisse',
        method: 'Espèces',
        is_internal: true,
      });
      if (insErr) {
        const { error: fbErr } = await supabase.from('transactions').insert(base);
        if (fbErr) throw fbErr;
      }
      toast.success('Fond de caisse enregistré.');
      load();
    } catch (e) {
      toast.error('Erreur enregistrement fond de caisse.');
      console.error(e);
    }
  };

  const enregistrerCloture = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // End-of-day timestamp
      const end = new Date(date + 'T23:59:59.999');
      const endIso = end.toISOString();
      const caisseFinale = Number(totals.caisseTheorique || 0);

      // Desired fund to keep in Caisse for tomorrow (leave this amount, transfer the rest)
      const targetKeepRaw = parseFloat(fondCaisse || '0');
      const targetKeep = Number.isFinite(targetKeepRaw) && targetKeepRaw >= 0 ? +targetKeepRaw.toFixed(2) : 0;

      // 1) Save a closure marker (traceability)
      const { error: clotErr } = await supabase.from('transactions').insert({
        type: 'Cloture',
        source: 'Caisse',
        montant: caisseFinale,
        description: `Clôture du ${date} | Net: ${totals.netCaisse.toFixed(2)} DT | Fond conservé: ${targetKeep.toFixed(2)} DT`,
        user_id: user?.id || null,
        created_at: endIso,
        is_internal: true
      });
      if (clotErr) throw clotErr;

      // 2) Transfer only the excess above the desired fund from Caisse -> Coffre
      const toTransfer = +(caisseFinale - targetKeep).toFixed(2);
      if (toTransfer > 0.009) {
        const outCaisse = {
          type: 'Dépense',
          source: 'Cloture',
          montant: toTransfer,
          description: `Clôture: transfert de l'excédent vers Coffre (${date})`,
          wallet: 'Caisse',
          method: 'Espèces',
          is_internal: true,
          user_id: user?.id || null,
          created_at: endIso,
        };
        const inCoffre = {
          type: 'Revenu',
          source: 'Clôture',
          montant: toTransfer,
          description: `Clôture: excédent reçu depuis Caisse (${date})`,
          wallet: 'Coffre',
          method: 'Espèces',
          is_internal: true,
          user_id: user?.id || null,
          created_at: endIso,
        };
        const { error: trErr } = await supabase.from('transactions').insert([outCaisse, inCoffre]);
        if (trErr) throw trErr;
      } else if (caisseFinale + 0.009 < targetKeep) {
        toast.info(`Caisse (${caisseFinale.toFixed(2)} DT) < fond souhaité (${targetKeep.toFixed(2)} DT). Aucun transfert effectué. Complétez demain.`);
      }

      const kept = Math.max(0, Math.min(caisseFinale, targetKeep));
      toast.success(`Clôture enregistrée. Transféré: ${Math.max(0, toTransfer).toFixed(2)} DT | Fond gardé en caisse: ${kept.toFixed(2)} DT.`);
      load();
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
        doc.text(`Fond de caisse initial: ${fondInitial.toFixed(2)} DT`, 20, yPos);
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
          const internal = isOpeningFund(r);
          const montant = Number(r.montant || 0);
          const cout = internal ? 0 : Number(r.cout_total || 0);
          const profit = internal ? 0 : (montant - cout);
          return [
            fmtDateTime(r.created_at),
            r.source || '-',
            montant.toFixed(2),
            cout.toFixed(2),
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

  // Derived opening fund from loaded transactions
  const fondInitial = useMemo(() => {
    try {
      return transactions
        .filter(r => (
          String(r?.source || '').toLowerCase().includes('ouverture') ||
          /fond de caisse/i.test(String(r?.description || ''))
        ))
        .reduce((s, r) => s + Number(r.montant || 0), 0);
    } catch {
      return 0;
    }
  }, [transactions]);

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

      {/* Smart Alerts */}
      {smartMode && systemAlerts.length > 0 && (
        <Box sx={{ px: { xs: 2, sm: 3 } }}>
          {systemAlerts.map((alert, index) => (
            <Alert 
              key={index}
              severity={alert.type}
              sx={{ mb: 1 }}
              action={
                alert.action && (
                  <Button 
                    size="small" 
                    color="inherit"
                    onClick={() => {
                      if (alert.action === 'daily_opening') openCashRegisterWithCustomAmount();
                      else if (alert.action === 'daily_closure') closeCashRegister();
                      else if (alert.action === 'transfer_to_safe') {
                        const actualOpeningAmount = dailyStatus.openingAmount || SMART_CASH_CONFIG.FIXED_OPENING_AMOUNT;
                        const amount = balances?.Caisse - actualOpeningAmount;
                        if (amount > 0) performSmartTransfer('Caisse', 'Coffre', amount, 'Transfert automatique');
                      }
                    }}
                  >
                    {alert.action === 'daily_opening' ? 'Ouvrir' : 
                     alert.action === 'daily_closure' ? 'Fermer' : 
                     alert.action === 'transfer_to_safe' ? 'Transférer' : 'Action'}
                  </Button>
                )
              }
            >
              {alert.message}
            </Alert>
          ))}
        </Box>
      )}

      {/* Smart Control Panel */}
      {smartMode && (
        <Paper sx={{ flexShrink: 0, p: 2, mx: { xs: 2, sm: 3 }, bgcolor: 'primary.50' }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Gestion Intelligente
          </Typography>
          <Stack direction="row" spacing={2} flexWrap="wrap">
            <Button
              variant="contained"
              color="success"
              disabled={dailyStatus.isOpened}
              onClick={() => openCashRegister()}
              startIcon={<CheckCircleIcon />}
            >
              Ouverture rapide ({SMART_CASH_CONFIG.FIXED_OPENING_AMOUNT} DT)
            </Button>
            <Button
              variant="outlined"
              color="success"
              disabled={dailyStatus.isOpened}
              onClick={() => openCashRegisterWithCustomAmount()}
              startIcon={<Settings />}
            >
              Ouverture personnalisée
            </Button>
            <Button
              variant="contained"
              color="warning"
              disabled={!dailyStatus.isOpened || dailyStatus.isClosed}
              onClick={() => closeCashRegister()}
              startIcon={<LockIcon />}
            >
              Clôture
            </Button>
            <Chip 
              label={`Caisse: ${(balances?.Caisse || 0).toFixed(2)} DT`}
              color={balances?.Caisse > SMART_CASH_CONFIG.AUTO_TRANSFER_THRESHOLD ? 'warning' : 'default'}
            />
            <Chip 
              label={`Coffre: ${(balances?.Coffre || 0).toFixed(2)} DT`}
              color="info"
            />
            {dailyStatus.openingAmount > 0 && (
              <Chip 
                label={`Fond du jour: ${dailyStatus.openingAmount.toFixed(2)} DT`}
                color="primary"
                variant="outlined"
              />
            )}
            <Chip 
              label={dailyStatus.isOpened ? 'Ouverte' : 'Fermée'}
              color={dailyStatus.isOpened ? 'success' : 'default'}
            />
          </Stack>
        </Paper>
      )}

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

          {/* Smart Mode Toggle */}
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Gestion intelligente:</Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={smartMode}
                  onChange={(e) => setSmartMode(e.target.checked)}
                  color="primary"
                />
              }
              label={smartMode ? "Activée" : "Désactivée"}
            />
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
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                  Fond existant ce jour: {fondInitial.toFixed(2)} DT
                </Typography>
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
        
        {/* Use TableContainer for mobile scroll */}
        <TableContainer sx={{ maxHeight: { xs: 360, md: 540 }, overflowX: 'auto' }}>
          <Table size="small" stickyHeader sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', width: '6%' }}>ID</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '15%' }}>Date/Heure</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '12%' }}>Ticket</TableCell>
                <TableCell sx={{ fontWeight: 'bold', width: '12%' }}>Source</TableCell>
                {/* Articles column removed in daily mode to avoid duplication */}
                <TableCell sx={{ fontWeight: 'bold', width: viewMode === 'daily' ? '35%' : '25%' }}>Description</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', width: '8%' }}>Montant (DT)</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', width: '8%' }}>Coût (DT)</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', width: '8%' }}>Marge (DT)</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold', width: '6%' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    Chargement...
                  </TableCell>
                </TableRow>
              )}
              {!loading && transactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    Aucune transaction trouvée
                  </TableCell>
                </TableRow>
              )}
              {!loading && transactions.map(r => {
                const isEditing = editingId === r.id;
                const internalOpening = isOpeningFund(r);
                const montant = isEditing ? Number(editValues.montant || 0) : Number(r.montant || 0);
                const cout = internalOpening ? 0 : (isEditing ? Number(editValues.cout_total || 0) : Number(r.cout_total || 0));
                const marge = internalOpening ? 0 : (montant - cout);
                const ticket = (r.description || '').match(/Ticket\s([^|]+)/)?.[1] || '—';
                const baseDesc = cleanDescription(r.description || '');
                const shownDesc = viewMode === 'daily' ? stripTicketFromDesc(baseDesc) : baseDesc;
                
                return (
                  <TableRow key={r.id} hover sx={{ bgcolor: isEditing ? 'rgba(255, 193, 7, 0.1)' : 'inherit' }}>
                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>#{r.id}</TableCell>
                    <TableCell sx={{ 
                      whiteSpace: 'nowrap', 
                      fontVariantNumeric: 'tabular-nums', 
                      fontFamily: 'monospace',
                      fontSize: '0.8rem'
                    }}>
                      {isEditing ? (
                        <TextField
                          type="datetime-local"
                          value={editValues.created_at ? new Date(editValues.created_at).toISOString().slice(0,16) : ''}
                          onChange={e => setEditValues({...editValues, created_at: new Date(e.target.value).toISOString()})}
                          size="small"
                          InputProps={{ sx: { fontSize: '0.8rem', padding: '4px 8px' } }}
                        />
                      ) : (
                        fmtDateTime(r.created_at)
                      )}
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
                    {/* Articles column removed */}
                    <TableCell sx={{ 
                      maxWidth: '200px',
                      minWidth: '150px',
                      fontSize: '0.8rem',
                      lineHeight: 1.3,
                      whiteSpace: 'normal',
                      wordBreak: 'break-word',
                      verticalAlign: 'top',
                      padding: '8px 16px'
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
                        <Box sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          lineHeight: 1.3,
                          maxHeight: '2.6em' // 2 lines * 1.3 line-height
                        }}>
                          {shownDesc || '—'}
                        </Box>
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
                          value={internalOpening ? 0 : (editValues.cout_total || '')}
                          onChange={(e) => setEditValues({...editValues, cout_total: e.target.value})}
                          size="small"
                          inputProps={{ step: '0.01' }}
                          disabled={internalOpening}
                        />
                      ) : (
                        cout.toFixed(2)
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ 
                      color: marge > 0 ? 'success.main' : (marge < 0 ? 'error.main' : 'inherit'),
                      fontWeight: 'bold'
                    }}>
                      {isEditing ? (
                        <TextField
                          type="number"
                          value={marge.toFixed(2)}
                          size="small"
                          inputProps={{ step: '0.01' }}
                          onChange={(e) => {
                            const newMarge = Number(e.target.value) || 0;
                            const currentMontant = Number(editValues.montant) || 0;
                            const newCoutTotal = currentMontant - newMarge;
                            setEditValues({
                              ...editValues,
                              cout_total: Math.max(0, newCoutTotal).toFixed(2)
                            });
                          }}
                          sx={{ 
                            minWidth: '100px',
                            '& .MuiInputBase-input': {
                              color: marge > 0 ? '#2e7d32' : (marge < 0 ? '#d32f2f' : 'inherit'),
                              fontWeight: 'bold',
                              textAlign: 'right',
                              fontSize: '0.875rem'
                            }
                          }}
                        />
                      ) : (
                        marge.toFixed(2)
                      )}
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
                              disabled={editingId !== null || internalOpening}
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
                  <TableCell colSpan={5} align="right" sx={{ fontWeight: 700 }}>
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
        </TableContainer>
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

      {/* Custom Opening Amount Dialog */}
      <Dialog open={openingAmountDialog.open} onClose={() => setOpeningAmountDialog({ ...openingAmountDialog, open: false })} maxWidth="sm" fullWidth>
        <DialogTitle>Ouverture de caisse personnalisée</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Solde actuel en caisse: <strong>{(balances?.Caisse || 0).toFixed(2)} DT</strong>
          </Alert>
          
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            {openingAmountDialog.mode === 'set' 
              ? "Ajustez le solde de caisse au montant exact souhaité"
              : "Ajoutez un montant au solde actuel"
            }
          </Typography>

          <FormControl component="fieldset" sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Mode d'ouverture:</Typography>
            <Stack direction="row" spacing={1}>
              <Button
                variant={openingAmountDialog.mode === 'add' ? 'contained' : 'outlined'}
                size="small"
                onClick={() => setOpeningAmountDialog(prev => ({ ...prev, mode: 'add', amount: '' }))
                }
              >
                Ajouter au solde
              </Button>
              <Button
                variant={openingAmountDialog.mode === 'set' ? 'contained' : 'outlined'}
                size="small"
                onClick={() => setOpeningAmountDialog(prev => ({ ...prev, mode: 'set', amount: (balances?.Caisse || 0).toFixed(2) }))
                }
              >
                Définir montant exact
              </Button>
            </Stack>
          </FormControl>
          
          <TextField
            fullWidth
            type="number"
            label={openingAmountDialog.mode === 'set' ? 'Montant exact en caisse (DT)' : 'Montant à ajouter (DT)'}
            value={openingAmountDialog.amount}
            onChange={(e) => setOpeningAmountDialog(prev => ({ ...prev, amount: e.target.value }))}
            InputProps={{
              inputProps: { min: 0, step: 0.01 }
            }}
            helperText={(() => {
              const current = balances?.Caisse || 0;
              const val = parseFloat(openingAmountDialog.amount || '0') || 0;
              if (openingAmountDialog.mode === 'set') {
                const diff = val - current;
                return `Solde actuel: ${current.toFixed(2)} DT | Ajustement: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)} DT | Solde final projeté: ${val.toFixed(2)} DT`;
              } else {
                const projected = current + val;
                return `Solde actuel: ${current.toFixed(2)} DT → Après ajout: ${projected.toFixed(2)} DT`;
              }
            })()}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setOpeningAmountDialog({ ...openingAmountDialog, open: false })}
          >
            Annuler
          </Button>
          <Button 
            variant="contained" 
            onClick={handleOpeningAmountConfirm}
            startIcon={<CheckCircleIcon />}
          >
            {openingAmountDialog.mode === 'set' ? 'Ajuster la caisse' : 'Ouvrir la caisse'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default GestionEncaisse;
