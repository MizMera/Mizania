// src/ClotureCaisse.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { Box, Paper, Typography, Stack, TextField, Button, Table, TableHead, TableRow, TableCell, TableBody, Card, Grid } from '@mui/material';
import { PictureAsPdf } from '@mui/icons-material';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-toastify';

function fmt(d) { return d.toISOString().slice(0,10); }

function fmtLocal(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function ClotureCaisse() {
  const [date, setDate] = useState(() => fmtLocal(new Date()));
  const [fondCaisse, setFondCaisse] = useState('0');
  const [rows, setRows] = useState([]);
  const [depenses, setDepenses] = useState([]);
  const [loading, setLoading] = useState(false);

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
      const start = new Date(date + 'T00:00:00');
      const end = new Date(date + 'T23:59:59');
      console.log('[ClotureCaisse] Query window:', start.toISOString(), '->', end.toISOString());

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('type', 'Revenu')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: true });
      if (error) throw error;

      const { data: depData, error: depErr } = await supabase
        .from('transactions')
        .select('*')
        .eq('type', 'Dépense')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: true });
      if (depErr) throw depErr;

      console.log('[ClotureCaisse] revenus:', data?.length || 0, 'depenses:', depData?.length || 0);
      setRows(data || []);
      setDepenses(depData || []);
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors du chargement de la journée.');
    } finally {
      setLoading(false);
    }
  };

  // Load data on mount and whenever the date changes
  useEffect(() => {
    load();
  }, [date]);

  const generateDailyPDF = () => {
    try {
      console.log('Starting ClotureCaisse PDF export...');
      
      const doc = new jsPDF();
      
      // Header
      doc.setFont('helvetica','bold');
      doc.setFontSize(18);
      doc.text('Mizania+ - Rapport de Clôture de Caisse', 14, 20);
      doc.setLineWidth(0.5);
      doc.line(14, 24, 196, 24);
      
      // Summary
      doc.setFont('helvetica','normal');
      doc.setFontSize(12);
      
      doc.text(`Date: ${new Date(date).toLocaleDateString('fr-FR')}`, 14, 32);
      doc.text(`Heure: ${new Date().toLocaleString('fr-FR')}`, 14, 40);
      
      console.log('Header added, creating summary...');
      
      // Summary
      doc.setFontSize(14);
      doc.text('Résumé de la journée:', 14, 55);
      
      doc.setFontSize(11);
      doc.text(`Fond de caisse initial: ${Number(fondCaisse).toFixed(2)} DT`, 20, 65);
      doc.text(`Total encaissements: ${totals.total.toFixed(2)} DT`, 20, 73);
      doc.text(`Total dépenses: ${totals.totalDepenses.toFixed(2)} DT`, 20, 81);
      doc.text(`Bénéfice net: ${totals.netCaisse.toFixed(2)} DT`, 20, 89);
      doc.text(`Fond de caisse final: ${totals.caisseTheorique.toFixed(2)} DT`, 20, 97);
      
      console.log('Summary added, creating tables...');
      
      // Simple revenues table
      if (rows.length > 0) {
        doc.setFontSize(14);
        doc.text('Encaissements:', 14, 115);
        
        autoTable(doc, {
          startY: 121,
          head: [['Heure', 'Description', 'Montant (DT)']],
          body: rows.map(r => [
            new Date(r.created_at).toLocaleTimeString('fr-FR'),
            r.description || '-',
            Number(r.montant).toFixed(2)
          ]),
          styles: { fontSize: 9 }
        });
      }
      
      // Simple expenses table
      if (depenses.length > 0) {
        const finalY = (doc.lastAutoTable?.finalY) || 130;
        doc.setFontSize(14);
        doc.text('Dépenses:', 14, finalY + 15);
        
        autoTable(doc, {
          startY: finalY + 21,
          head: [['Heure', 'Description', 'Montant (DT)']],
          body: depenses.map(d => [
            new Date(d.created_at).toLocaleTimeString('fr-FR'),
            d.description || '-',
            Number(d.montant).toFixed(2)
          ]),
          styles: { fontSize: 9 }
        });
      }
      
      console.log('Tables created, saving PDF...');
      
      const filename = `cloture-caisse-${date}.pdf`;
      doc.save(filename);
      
      console.log('PDF saved:', filename);
      toast.success('Rapport PDF généré avec succès!');
      
    } catch (error) {
      console.error('Error generating ClotureCaisse PDF:', error);
      toast.error('Erreur lors de la génération du PDF: ' + error.message);
    }
  };

  const totals = useMemo(() => {
    const total = rows.reduce((s, r) => s + Number(r.montant || 0), 0);
    const couts = rows.reduce((s, r) => s + Number(r.cout_total || 0), 0);
    const netVentes = total - couts; // marge brute du jour
    const totalDepenses = depenses.reduce((s, r) => s + Number(r.montant || 0), 0);
    const caisseTheorique = Number(fondCaisse || 0) + total - totalDepenses;
    const netCaisse = netVentes - totalDepenses; // bénéfice net sur caisse
    return { total, couts, netVentes, totalDepenses, caisseTheorique, netCaisse };
  }, [rows, depenses, fondCaisse]);

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
        description: `Clôture du ${date} | Net: ${totals.netCaisse.toFixed(2)} DT` ,
        user_id: user?.id || null
      });
      toast.success('Clôture enregistrée.');
    } catch (e) {
      toast.error('Erreur enregistrement de la clôture.');
      console.error(e);
    }
  };

  return (
    <Box sx={{ minHeight: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header */}
      <Box sx={{ flexShrink: 0 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 0 }}>Clôture de Caisse</Typography>
      </Box>

      {/* Controls */}
      <Paper sx={{ flexShrink: 0, p: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
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
          <Button variant="outlined" onClick={enregistrerFondOuverture} size="small">
            Enregistrer Fond
          </Button>
          <Button variant="outlined" onClick={enregistrerCloture} size="small">
            Clôturer
          </Button>
          <Button 
            variant="contained" 
            startIcon={<PictureAsPdf />} 
            onClick={generateDailyPDF}
            color="error"
            size="small"
          >
            Export PDF
          </Button>
          <Button variant="contained" onClick={load} size="small">
            Rafraîchir
          </Button>
        </Stack>
      </Paper>

      {/* Main Content */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Transactions Table */}
        <Paper sx={{ 
          display: 'flex', 
          flexDirection: 'column',
          // stretch to page edges by canceling main padding
          mx: { xs: -2, sm: -3 }
        }}>
          <Typography variant="h6" sx={{ px: { xs: 2, sm: 3 }, pt: 2, pb: 1 }}>Transactions du jour</Typography>
          <Box sx={{ px: { xs: 2, sm: 3 }, pb: 2, overflowX: 'hidden' }}>
            <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', width: '100%' }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold', width: '6%' }}>ID</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '12%' }}>Date/Heure</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '14%' }}>Ticket</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '22%' }}>Articles</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '26%' }}>Description</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold', width: '8%' }}>Montant (DT)</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold', width: '6%' }}>Coût (DT)</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold', width: '6%' }}>Marge (DT)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      Chargement...
                    </TableCell>
                  </TableRow>
                )}
                {!loading && rows.map(r => {
                  const montant = Number(r.montant || 0);
                  const cout = Number(r.cout_total || 0);
                  const marge = montant - cout;
                  const ticket = (r.description || '').match(/Ticket\s([^|]+)/)?.[1] || '—';
                  const itemsMatch = (r.description || '').match(/Articles:\s([^|]+)/);
                  const items = itemsMatch ? itemsMatch[1] : '—';
                  return (
                    <TableRow key={r.id} hover>
                      <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>#{r.id}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>{fmtDateTime(r.created_at)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ticket}</TableCell>
                      <TableCell sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{items}</TableCell>
                      <TableCell sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.description || '—'}
                      </TableCell>
                      <TableCell align="right">{montant.toFixed(2)}</TableCell>
                      <TableCell align="right">{cout.toFixed(2)}</TableCell>
                      <TableCell align="right" sx={{ 
                        color: marge > 0 ? '#22C55E' : (marge < 0 ? '#EF4444' : 'inherit'),
                        fontWeight: 'bold'
                      }}>
                        {marge.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      Aucune vente
                    </TableCell>
                  </TableRow>
                )}
                {rows.length > 0 && (
                  <TableRow sx={{ bgcolor: 'rgba(99, 102, 241, 0.05)' }}>
                    <TableCell colSpan={5} align="right" sx={{ fontWeight: 700 }}>Totaux</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{totals.total.toFixed(2)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{totals.couts.toFixed(2)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{totals.netVentes.toFixed(2)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        </Paper>

        {/* Summary and Actions */}
        <Box sx={{ flexShrink: 0, display: 'flex', gap: 2 }}>
          {/* Summary */}
          <Paper sx={{ flex: 1, p: 2 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Résumé de Caisse</Typography>
            <Box sx={{ 
              display: 'grid', 
              gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr 1fr' }, 
              gap: 2 
            }}>
              <Box>
                <Typography variant="body2" color="text.secondary">Total ventes</Typography>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>{totals.total.toFixed(2)} DT</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Coûts des ventes</Typography>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>{totals.couts.toFixed(2)} DT</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Dépenses</Typography>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>{totals.totalDepenses.toFixed(2)} DT</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Marge (ventes - coûts)</Typography>
                <Typography variant="h6" sx={{ fontWeight: 800, color: '#22C55E' }}>
                  {totals.netVentes.toFixed(2)} DT
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Caisse théorique</Typography>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>{totals.caisseTheorique.toFixed(2)} DT</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Bénéfice net caisse</Typography>
                <Typography variant="h6" sx={{ 
                  fontWeight: 800, 
                  color: totals.netCaisse > 0 ? '#22C55E' : '#EF4444' 
                }}>
                  {totals.netCaisse.toFixed(2)} DT
                </Typography>
              </Box>
            </Box>
          </Paper>

          {/* Actions */}
          <Paper sx={{ flexShrink: 0, p: 2, minWidth: 200 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Actions</Typography>
            <Stack spacing={1}>
              <Button variant="outlined" onClick={enregistrerFondOuverture} fullWidth>
                Enregistrer Fond d'ouverture
              </Button>
              <Button variant="contained" color="primary" onClick={enregistrerCloture} fullWidth>
                Enregistrer la Clôture
              </Button>
            </Stack>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}

export default ClotureCaisse;
