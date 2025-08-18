import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Avatar,
  Paper,
  CircularProgress,
  Button,
  Chip,
  List,
  ListItem,
  ListItemText,
  Divider,
  LinearProgress,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  Stack
  , IconButton
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  Euro,
  Build,
  Inventory,
  PictureAsPdf,
  AccountBalance,
  Refresh,
  ShoppingCart,
  Star,
  Person,
  Assignment,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

function Dashboard() {
  const [stats, setStats] = useState({
    revenusJour: 0,
    revenusHier: 0,
    depensesJour: 0,
    ventesJour: 0,
    reparationsEnCours: 0,
    stockFaible: 0,
    coutsJour: 0,
    // new KPIs
    caMois: 0,
    depensesMois: 0,
    coutsMois: 0,
    beneficeNetMois: 0,
    panierMoyenJour: 0,
    transfertsJourCount: 0,
    transfertsJourSortants: 0,
  });
  const [graphData, setGraphData] = useState([]);
  const [loading, setLoading] = useState(true);
  // New UI data
  const [recentTx, setRecentTx] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [repairCounts, setRepairCounts] = useState({ recus: 0, enCours: 0, termines: 0 });
  const [walletBalances, setWalletBalances] = useState(null); // {Caisse, Banque, Coffre} or null if unsupported

  useEffect(() => {
    loadDashboardData();
  }, []);

  const tryExcludeInternal = async (build) => {
    // build(withFlag:boolean) => PostgrestFilterBuilder
    let { data, error } = await build(true);
    if (error && String(error.message || '').toLowerCase().includes('is_internal')) {
      const retry = await build(false);
      data = retry.data; error = retry.error;
    }
    return { data, error };
  };

  const generateDashboardPDF = async () => {
    const doc = new jsPDF();
    const { data: { user } } = await supabase.auth.getUser();
    
    // Header
    doc.setFontSize(18);
    doc.text('Tableau de Bord', 14, 22);
    doc.setFontSize(12);
    doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 14, 32);
    if (user?.email) doc.text(`Généré par: ${user.email}`, 14, 40);

    // Key metrics
    doc.setFontSize(14);
    doc.text('Métriques Clés du Jour:', 14, 56);
    doc.setFontSize(11);
    
    const profit = stats.revenusJour - stats.coutsJour;
    const margin = stats.revenusJour > 0 ? ((profit / stats.revenusJour) * 100) : 0;
    const yesterdayComparison = stats.revenusJour - stats.revenusHier;
    const yesterdayPercent = stats.revenusHier > 0 ? ((yesterdayComparison / stats.revenusHier) * 100) : 0;
    
    doc.text(`Revenus aujourd'hui: ${stats.revenusJour.toFixed(2)} DT`, 20, 68);
    doc.text(`Revenus hier: ${stats.revenusHier.toFixed(2)} DT`, 20, 76);
    doc.text(`Variation vs hier: ${yesterdayComparison >= 0 ? '+' : ''}${yesterdayComparison.toFixed(2)} DT (${yesterdayPercent >= 0 ? '+' : ''}${yesterdayPercent.toFixed(1)}%)`, 20, 84);
    doc.text(`Coûts du jour: ${stats.coutsJour.toFixed(2)} DT`, 20, 92);
    doc.text(`Profit net: ${profit.toFixed(2)} DT`, 20, 100);
    doc.text(`Marge: ${margin.toFixed(1)}%`, 20, 108);
    doc.text(`Dépenses du jour: ${stats.depensesJour.toFixed(2)} DT`, 20, 116);
    
    doc.setFontSize(14);
    doc.text('État des Opérations:', 14, 134);
    doc.setFontSize(11);
    doc.text(`Réparations en cours: ${stats.reparationsEnCours}`, 20, 146);
    doc.text(`Produits en stock faible: ${stats.stockFaible}`, 20, 154);
    doc.text(`Nombre de ventes aujourd'hui: ${stats.ventesJour}`, 20, 162);

    // Recent trend (if graph data available)
    if (graphData.length > 0) {
      doc.setFontSize(14);
      doc.text('Tendance des 7 derniers jours:', 14, 180);
      
      // Simple table with daily revenues
      const tableData = graphData.slice(-7).map(day => [
        day.date,
        `${day.revenus.toFixed(2)} DT`,
        `${day.depenses.toFixed(2)} DT`,
        `${(day.revenus - day.depenses).toFixed(2)} DT`
      ]);
      autoTable(doc, {
        startY: 186,
        head: [['Date', 'Revenus', 'Dépenses', 'Net']],
        body: tableData,
        styles: { fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: 30, halign: 'right' },
          2: { cellWidth: 30, halign: 'right' },
          3: { cellWidth: 30, halign: 'right' }
        }
      });
    }

    doc.save(`dashboard-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const now = new Date();
      const aujourdhui = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const hier = new Date(aujourdhui.getTime() - 86400000);
      const debutMoisDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const aujourdhuiISO = aujourdhui.toISOString().split('T')[0];
      const hierISO = hier.toISOString().split('T')[0];
      const debutMoisISO = debutMoisDate.toISOString().split('T')[0];

      // Fetch all transactions since start of month (single roundtrip), exclude internal when supported
      const { data: txAll } = await tryExcludeInternal((withFlag) => {
        let b = supabase
          .from('transactions')
          .select('id,type,montant,cout_total,created_at,description,is_internal,wallet')
          .gte('created_at', debutMoisISO)
          .order('created_at', { ascending: false });
        return withFlag ? b.neq('is_internal', true) : b;
      });
      const tx = txAll || [];

      // Parallel fetch: stock faible and repairs counts
      const [stockFaibleListRes, reparationsRes] = await Promise.all([
        supabase
          .from('inventaire')
          .select('id, nom, quantite_stock')
          .lt('quantite_stock', 5)
          .order('quantite_stock', { ascending: true })
          .limit(5),
        supabase
          .from('fiches_reparation')
          .select('id, statut')
          .in('statut', ['Reçu', 'En cours', 'Terminé'])
      ]);
      const stockFaibleList = stockFaibleListRes.data || [];
      const reparations = reparationsRes.data || [];

      // Helpers
      const isSameDay = (d, base) => {
        const x = new Date(d);
        return x.getFullYear() === base.getFullYear() && x.getMonth() === base.getMonth() && x.getDate() === base.getDate();
      };

      // Split by type and date
      const revenus = tx.filter(t => t.type === 'Revenu');
      const depenses = tx.filter(t => t.type === 'Dépense');

      const revenusJour = revenus.filter(t => isSameDay(t.created_at, aujourdhui));
      const revenusHierArr = revenus.filter(t => isSameDay(t.created_at, hier));
      const depensesJourArr = depenses.filter(t => isSameDay(t.created_at, aujourdhui));
      const coutsJourArr = revenusJour; // cout_total lives on revenus

      const sum = (arr, key) => arr.reduce((s, r) => s + Number(r[key] || 0), 0);

      const revenusJourTotal = sum(revenusJour, 'montant');
      const revenusHierTotal = sum(revenusHierArr, 'montant');
      const depensesJourTotal = sum(depensesJourArr, 'montant');
      const coutsJourTotal = sum(coutsJourArr, 'cout_total');

      const caMois = sum(revenus, 'montant');
      const depensesMois = sum(depenses, 'montant');
      const coutsMois = sum(revenus, 'cout_total');
      const beneficeNetMois = caMois - coutsMois - depensesMois;

      const ventesJourCount = revenusJour.length;
      const panierMoyenJour = ventesJourCount > 0 ? (revenusJourTotal / ventesJourCount) : 0;

      // Recent non-internal tx (already excluded), show latest 8
      const recentTxLocal = tx.slice(0, 8);

      // Seven-day chart from single dataset
      const graphDays = [];
      for (let i = 6; i >= 0; i--) {
        const day = new Date(aujourdhui.getTime() - i * 86400000);
        const rev = revenus.filter(t => isSameDay(t.created_at, day));
        const dep = depenses.filter(t => isSameDay(t.created_at, day));
        const totalRev = sum(rev, 'montant');
        const totalDep = sum(dep, 'montant');
        graphDays.push({
          date: day.toLocaleDateString('fr-FR', { weekday: 'short' }),
          revenus: totalRev,
          depenses: totalDep,
          net: totalRev - totalDep
        });
      }

      // Transfers today computed client-side from txAll
      const transfertsToday = tx.filter(t => isSameDay(t.created_at, aujourdhui) && /transfert/i.test(t.description || ''));
      const transfertsJourCount = transfertsToday.length;
      const transfertsJourSortants = transfertsToday.filter(t => t.type === 'Dépense').reduce((s, t) => s + Number(t.montant || 0), 0);

      // Wallet balances optimized: include all transaction types and internal transfers
      let wbData = null;
      try {
        const { data: wb, error: werr } = await supabase
          .from('transactions')
          .select('type,montant,wallet,description')
          .in('wallet', ['Caisse','Banque','Coffre']);
        
        if (werr) throw werr;
        const balances = { Caisse: 0, Banque: 0, Coffre: 0 };
        (wb || []).forEach(r => {
          const w = r.wallet;
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
        });
        wbData = balances;
      } catch (error) {
        console.error('Error calculating wallet balances:', error);
        wbData = null;
      }

      // Set state
      setStats({
        revenusJour: revenusJourTotal,
        revenusHier: revenusHierTotal,
        depensesJour: depensesJourTotal,
        ventesJour: ventesJourCount,
        reparationsEnCours: reparations.filter(r => r.statut === 'En cours').length || 0,
        stockFaible: stockFaibleList.length || 0,
        coutsJour: coutsJourTotal,
        caMois,
        depensesMois,
        coutsMois,
        beneficeNetMois,
        panierMoyenJour,
        transfertsJourCount,
        transfertsJourSortants,
      });
      setGraphData(graphDays);
      setRecentTx(recentTxLocal);
      setLowStock(stockFaibleList);
      const counts = {
        recus: reparations.filter(r => r.statut === 'Reçu').length || 0,
        enCours: reparations.filter(r => r.statut === 'En cours').length || 0,
        termines: reparations.filter(r => r.statut === 'Terminé').length || 0,
      };
      setRepairCounts(counts);
      setWalletBalances(wbData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ title, value, subtitle, icon, color, trend, percentage }) => (
    <Card sx={{ 
      height: '100%', 
      background: `linear-gradient(135deg, ${color}15 0%, ${color}05 100%)`,
      border: `1px solid ${color}20`,
      borderRadius: 3,
      position: 'relative',
      overflow: 'visible'
    }}>
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box sx={{ flex: 1 }}>
            <Typography 
              variant="body2" 
              sx={{ 
                color: 'text.secondary', 
                fontWeight: 600,
                textTransform: 'uppercase',
                fontSize: '0.75rem',
                letterSpacing: '0.5px',
                mb: 1
              }}
            >
              {title}
            </Typography>
            <Typography 
              variant="h3" 
              sx={{ 
                fontWeight: 800, 
                color: 'text.primary',
                lineHeight: 1.2,
                mb: 1
              }}
            >
              {typeof value === 'number' ? value.toLocaleString('fr-FR', {
                minimumFractionDigits: title.includes('DT') || title.includes('CA') || title.includes('Revenus') || title.includes('Bénéfice') ? 2 : 0,
                maximumFractionDigits: title.includes('DT') || title.includes('CA') || title.includes('Revenus') || title.includes('Bénéfice') ? 2 : 0
              }) : value}
              {(title.includes('Revenus') || title.includes('Dépenses') || title.includes('Coûts') || title.includes('Bénéfice') || title.includes('CA')) && ' DT'}
            </Typography>
            {subtitle && (
              <Stack direction="row" alignItems="center" spacing={0.5}>
                {trend !== undefined && (
                  <>
                    {trend > 0 ? 
                      <TrendingUp sx={{ color: '#22C55E', fontSize: '1rem' }} /> : 
                      <TrendingDown sx={{ color: '#EF4444', fontSize: '1rem' }} />
                    }
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        color: trend > 0 ? '#22C55E' : '#EF4444',
                        fontWeight: 600,
                        fontSize: '0.8rem'
                      }}
                    >
                      {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
                    </Typography>
                  </>
                )}
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                  {subtitle}
                </Typography>
              </Stack>
            )}
            {percentage !== undefined && (
              <Box sx={{ mt: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                    Objectif
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
                    {percentage}%
                  </Typography>
                </Stack>
                <LinearProgress 
                  variant="determinate" 
                  value={Math.min(percentage, 100)} 
                  sx={{ 
                    height: 6, 
                    borderRadius: 3,
                    bgcolor: `${color}20`,
                    '& .MuiLinearProgress-bar': {
                      bgcolor: color,
                      borderRadius: 3
                    }
                  }} 
                />
              </Box>
            )}
          </Box>
          <Avatar 
            sx={{ 
              bgcolor: color,
              width: 48, 
              height: 48,
              boxShadow: `0 8px 24px ${color}40`
            }}
          >
            {icon}
          </Avatar>
        </Stack>
      </CardContent>
    </Card>
  );

  const trendRevenu = stats.revenusHier > 0 ? ((stats.revenusJour - stats.revenusHier) / stats.revenusHier) * 100 : 0;
  const beneficeBrut = stats.revenusJour - stats.coutsJour;
  const beneficeNet = beneficeBrut - stats.depensesJour;

  const handleExportPDF = () => {
    try {
      console.log('Starting Dashboard PDF export...');
      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(16);
      doc.text('Rapport Journalier - Tableau de Bord', 14, 20);
      
      doc.setFontSize(10);
      doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 14, 30);
      
      console.log('Header added, creating summary...');
      
      // Financial Summary
      doc.setFontSize(12);
      doc.text('Résumé Financier', 14, 45);
      
      const summaryData = [
        ['Revenus Aujourd\'hui', `${stats.revenusJour.toFixed(2)} DT`],
        ['Coûts des Ventes', `${stats.coutsJour.toFixed(2)} DT`],
        ['Dépenses', `${stats.depensesJour.toFixed(2)} DT`],
        ['Bénéfice Net', `${(stats.revenusJour - stats.coutsJour - stats.depensesJour).toFixed(2)} DT`],
        ['Ventes Réalisées', stats.ventesJour.toString()],
        ['Réparations en Cours', stats.reparationsEnCours.toString()],
        ['Stock Faible', stats.stockFaible.toString()]
      ];
      
      console.log('Summary data prepared, creating table...');
      
      autoTable(doc, {
        startY: 55,
        head: [['Indicateur', 'Valeur']],
        body: summaryData,
        styles: { fontSize: 10 }
      });
      
      console.log('Table created, saving PDF...');
      
      const filename = `dashboard-${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
      
      console.log('PDF saved:', filename);
      
    } catch (error) {
      console.error('Error generating Dashboard PDF:', error);
      alert('Erreur lors de la génération du PDF: ' + error.message);
    }
  };

  const handleRefresh = () => {
    loadDashboardData();
  };

  if (loading) {
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

  const walletTag = (w) => {
    const map = { Caisse: 'success', Banque: 'info', Coffre: 'warning' };
    return <Chip size="small" color={map[w] || 'default'} label={w || '—'} variant={map[w] ? 'filled' : 'outlined'} sx={{ ml: 1 }} />;
  };

  return (
    <Box sx={{ 
      minHeight: 'calc(100vh - 100px)', 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 2, 
      px: { xs: 2, sm: 3, md: 4 },
      mx: 'auto',
      maxWidth: 1200,
      overflowX: 'hidden' 
    }}>
      {/* Header */}
      <Box sx={{ 
        flexShrink: 0, 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        px: { xs: 2, sm: 3 }, 
        flexWrap: 'wrap', 
        rowGap: 1 
      }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
            Tableau de Bord
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Vue d'ensemble de votre activité aujourd'hui
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={handleRefresh}
          >
            Actualiser
          </Button>
          <Button
            variant="contained"
            startIcon={<PictureAsPdf />}
            onClick={handleExportPDF}
          >
            Export PDF
          </Button>
        </Stack>
      </Box>

      {/* Main Content */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, px: { xs: 2, sm: 3 }, pb: 2 }}>
        {/* Top Stats Row */}
        <Grid container spacing={3} wrap="wrap">
        <Grid item xs={12} sm={6} md={3} lg={3}>
          <StatCard 
            title="Revenus Aujourd'hui" 
            value={stats.revenusJour} 
            subtitle="vs hier"
            icon={<Euro />} 
            color="#6366F1" 
            trend={trendRevenu}
            percentage={75}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3} lg={3}>
          <StatCard 
            title="Ventes Aujourd'hui" 
            value={stats.ventesJour} 
            subtitle="commandes"
            icon={<ShoppingCart />} 
            color="#10B981"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3} lg={3}>
          <StatCard 
            title="Panier Moyen" 
            value={stats.panierMoyenJour} 
            subtitle="par commande"
            icon={<Euro />} 
            color="#F59E0B"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3} lg={3}>
          <StatCard 
            title="CA du Mois" 
            value={stats.caMois} 
            subtitle="objectif: 25,000 DT"
            icon={<TrendingUp />} 
            color="#8B5CF6"
            percentage={78}
          />
        </Grid>
      </Grid>

      {/* Charts and Activity Row */}
      <Grid container spacing={2} wrap="wrap" sx={{ mb: 3 }}>
        {/* Line Chart: Net Trend - Last 7 Days */}
        <Grid item xs={12} md={4}>
          <Paper sx={{
            p: 2,
            borderRadius: 3,
            boxShadow: '0 8px 24px rgba(255, 255, 255, 0.06)',
            minHeight: 300
          }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>
              Évolution nette (Revenus - Dépenses) - 7 derniers jours
            </Typography>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={graphData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#64748B" />
                <YAxis tick={{ fontSize: 12 }} stroke="#64748B" />
                <Tooltip formatter={(value) => [`${value.toFixed(2)} DT`, 'Net']} />
                <Legend verticalAlign="top" height={36} />
                <Line type="monotone" dataKey="net" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} name="Net" />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        {/* Pie Chart: Monthly Breakdown */}
        <Grid item xs={12} md={4}>
          <Paper sx={{
            p: 2,
            borderRadius: 3,
            boxShadow: '0 8px 24px rgba(255, 255, 255, 0.06)',
            minHeight: 300,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>
              Répartition mensuelle: Revenus vs Dépenses
            </Typography>
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={[{ name: 'Revenus', value: stats.caMois }, { name: 'Dépenses', value: stats.depensesMois }]}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  label
                >
                  <Cell fill="#6366F1" />
                  <Cell fill="#EF4444" />
                </Pie>
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Removed inline Recent Activity list */}
      </Grid>

      {/* Secondary Stats and Tables */}
      <Grid container spacing={3}>
        {/* Wallet Balances */}
        {walletBalances && (
          <Grid item xs={12} md={12}>
            <Paper sx={{ 
              p: { xs: 2, md: 5 }, 
              borderRadius: 3,
              boxShadow: '0 8px 24px rgba(15,23,42,0.06)'
            }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>
                Soldes Portefeuilles
              </Typography>
              <Stack spacing={2}>
                {Object.entries(walletBalances).map(([wallet, balance]) => {
                  const colors = {
                    Caisse: '#22C55E',
                    Banque: '#3B82F6', 
                    Coffre: '#F59E0B'
                  };  
                  return (
                    <Box 
                      key={wallet}
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        bgcolor: `${colors[wallet]}10`,
                        border: `1px solid ${colors[wallet]}20`
                      }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '1 rem' }}>
                            {wallet}
                          </Typography>
                          <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            {balance.toFixed(2)} DT
                          </Typography>
                        </Box>
                        <Avatar sx={{ bgcolor: colors[wallet], width: 32, height: 32 }}>
                          <AccountBalance sx={{ fontSize: '1rem' }} />
                        </Avatar>
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            </Paper>
          </Grid>
        )}

        {/* Top Products */}
        <Grid item xs={12} md={12}>
          <Paper sx={{ 
            p: { xs: 2, md: 5 }, 
            borderRadius: 3,
            boxShadow: '0 8px 24px rgba(15,23,42,0.06)'
          }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>
              Stock Faible
            </Typography>
            <Stack spacing={2}>
              {lowStock.length > 0 ? lowStock.map((item) => (
                <Box 
                  key={item.id}
                  sx={{
                    p: 5,
                    borderRadius: 2,
                    bgcolor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.2)'
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {item.nom}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Stock restant
                      </Typography>
                    </Box>
                    <Chip 
                      label={`${item.quantite_stock}`}
                      color="error"
                      size="small"
                      sx={{ fontWeight: 700 }}
                    />
                  </Stack>
                </Box>
              )) : (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  Tous les stocks sont suffisants
                </Typography>
              )}
            </Stack>
          </Paper>
        </Grid>

        {/* Repairs Status */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ 
            p:4 , 
            borderRadius: 3,
            boxShadow: '0 8px 24px rgba(15,23,42,0.06)'
          }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>
              État des Réparations
            </Typography>
            <Stack spacing={2}>
              <Box sx={{ p: 3, borderRadius: 2, bgcolor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Reçu</Typography>
                    <Typography variant="caption" color="text.secondary">En attente</Typography>
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>{repairCounts.recus}</Typography>
                </Stack>
              </Box>
              <Box sx={{ p: 3, borderRadius: 2, bgcolor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>En cours</Typography>
                    <Typography variant="caption" color="text.secondary">En réparation</Typography>
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>{repairCounts.enCours}</Typography>
                </Stack>
              </Box>
              <Box sx={{ p: 3, borderRadius: 2, bgcolor: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Terminé</Typography>
                    <Typography variant="caption" color="text.secondary">Prêt à récupérer</Typography>
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>{repairCounts.termines}</Typography>
                </Stack>
              </Box>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
      {/* Detailed Recent Activity at bottom */}
      <Grid container spacing={3} sx={{ mt: 4 }}>
        <Grid item xs={12}>
          <Paper sx={{ p: 10, borderRadius: 3, boxShadow: '0 8px 24px rgba(15,23,42,0.06)' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              Activité Récente Détaillée
            </Typography>
            <TableContainer sx={{ maxHeight: 600 }}>
              <Table stickyHeader size="medium">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Heure</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell>Portefeuille</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell align="right">Montant</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recentTx.map(tx => (
                    <TableRow key={tx.id} hover>
                      <TableCell>{new Date(tx.created_at).toLocaleDateString('fr-FR')}</TableCell>
                      <TableCell>{new Date(tx.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</TableCell>
                      <TableCell>{tx.description}</TableCell>
                      <TableCell>{tx.wallet || '-'}</TableCell>
                      <TableCell>{tx.type}</TableCell>
                      <TableCell align="right" sx={{ color: tx.type === 'Revenu' ? '#10B981' : '#EF4444', fontWeight: 1000 }}>
                        {tx.type === 'Revenu' ? '+' : '-'}{Number(tx.montant).toFixed(2)} DT
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  </Box>
  );
}

export default Dashboard;