// src/HistoriqueEncaisse.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { Box, Paper, Typography, Stack, TextField, Button, Table, TableHead, TableRow, TableCell, TableBody, Chip, Card, Grid } from '@mui/material';
import { PictureAsPdf } from '@mui/icons-material';
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

function HistoriqueEncaisse() {
  const now = new Date();
  const [from, setFrom] = useState(() => {
    const d = new Date(now.getTime() - 7 * 86400000);
    d.setHours(0,0,0,0);
    return fmtDateTimeLocal(d);
  });
  const [to, setTo] = useState(() => fmtDateTimeLocal(now));
  const [mode, setMode] = useState('Tous'); // Tous | Espèces | Carte
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const fromIso = new Date(from).toISOString();
      const toIso = new Date(to).toISOString();

      let query = supabase
        .from('transactions')
        .select('*')
        .eq('type', 'Revenu')
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      let filtered = data || [];
      if (mode !== 'Tous') {
        filtered = filtered.filter(r => (r.source || '').includes(mode));
      }
      setRows(filtered);
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors du chargement des encaissements');
    } finally {
      setLoading(false);
    }
  };

  const generateRevenuePDF = () => {
    try {
      const doc = new jsPDF();
      // Header
      doc.setFont('helvetica','bold');
      doc.setFontSize(18);
      doc.text('Mizania+ - Historique des Encaissements', 14, 20);
      doc.setLineWidth(0.5);
      doc.line(14, 24, 196, 24);
      
      // Summary
      doc.setFont('helvetica','normal');
      doc.setFontSize(12);
      doc.text(`Période: ${new Date(from).toLocaleDateString('fr-FR')} - ${new Date(to).toLocaleDateString('fr-FR')}`, 14, 32);
      doc.text(`Mode de paiement: ${mode}`, 14, 40);
      doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 14, 48);
      
      // Summary
      doc.setFontSize(14);
      doc.text('Résumé:', 14, 62);
      
      doc.setFontSize(11);
      doc.text(`Nombre de transactions: ${rows.length}`, 20, 72);
      doc.text(`Total encaissé: ${totals.total.toFixed(2)} DT`, 20, 80);
      doc.text(`Coûts totaux: ${totals.couts.toFixed(2)} DT`, 20, 88);
      doc.text(`Profit net: ${totals.profit.toFixed(2)} DT`, 20, 96);
      
      // Simple table data
      autoTable(doc, {
        startY: 108,
        head: [['Date', 'Heure', 'Source', 'Montant (DT)', 'Profit (DT)']],
        body: rows.map(r => {
          const profit = Number(r.montant || 0) - Number(r.cout_total || 0);
          return [
            new Date(r.created_at).toLocaleDateString('fr-FR'),
            new Date(r.created_at).toLocaleTimeString('fr-FR'),
            r.source || '-',
            Number(r.montant).toFixed(2),
            profit.toFixed(2)
          ];
        }),
        styles: { fontSize: 9 }
      });
      
      const filename = `encaissements-${new Date(from).toISOString().split('T')[0]}-${new Date(to).toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
      
      console.log('PDF saved:', filename);
      toast.success('Rapport PDF généré avec succès!');
      
    } catch (error) {
      console.error('Error generating HistoriqueEncaisse PDF:', error);
      toast.error('Erreur lors de la génération du PDF: ' + error.message);
    }
  };

  const totals = useMemo(() => {
    const total = rows.reduce((s, r) => s + Number(r.montant || 0), 0);
    const couts = rows.reduce((s, r) => s + Number(r.cout_total || 0), 0);
    return { total, couts, profit: total - couts };
  }, [rows]);

  useEffect(() => { load(); /* on mount */ }, []);

  return (
    <Box 
      sx={{ 
        height: 'calc(100vh - 100px)', 
        display: 'flex', 
        flexDirection: 'column',
        gap: 2
      }}
    >
      <Typography variant="h4" sx={{ fontWeight: 800 }}>Encaissements</Typography>

      <Paper sx={{ p: 2, flexShrink: 0 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
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
          <TextField
            select
            SelectProps={{ native: true }}
            label="Mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            sx={{ minWidth: 160 }}
            size="small"
          >
            <option value="Tous">Tous</option>
            <option value="Espèces">Espèces</option>
            <option value="Carte">Carte</option>
          </TextField>
          <Button variant="contained" onClick={load} size="small">Appliquer</Button>
          <Button 
            variant="outlined" 
            startIcon={<PictureAsPdf />} 
            onClick={generateRevenuePDF}
            size="small"
          >
            Export PDF
          </Button>
        </Stack>
      </Paper>

      {/* Summary Cards */}
      <Box sx={{ flexShrink: 0 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Card sx={{ p: 2, textAlign: 'center', bgcolor: 'primary.dark' }}>
              <Typography variant="body2" color="text.secondary">Total Encaissé</Typography>
              <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                {totals.total.toFixed(2)} DT
              </Typography>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card sx={{ p: 2, textAlign: 'center', bgcolor: 'warning.dark' }}>
              <Typography variant="body2" color="text.secondary">Coûts Totaux</Typography>
              <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'warning.main' }}>
                {totals.couts.toFixed(2)} DT
              </Typography>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card sx={{ 
              p: 2, 
              textAlign: 'center', 
              bgcolor: totals.profit >= 0 ? 'success.dark' : 'error.dark' 
            }}>
              <Typography variant="body2" color="text.secondary">Profit Net</Typography>
              <Typography variant="h5" sx={{ 
                fontWeight: 'bold', 
                color: totals.profit >= 0 ? 'success.main' : 'error.main' 
              }}>
                {totals.profit.toFixed(2)} DT
              </Typography>
            </Card>
          </Grid>
        </Grid>
      </Box>

      <Paper sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>Date</TableCell>
                <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>Ticket</TableCell>
                <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>Source</TableCell>
                <TableCell align="right" sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>Montant (DT)</TableCell>
                <TableCell align="right" sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>Coût (DT)</TableCell>
                <TableCell align="right" sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>Profit (DT)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Typography>Chargement...</Typography>
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">Aucun encaissement trouvé</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(r => {
                  const profit = Number(r.montant || 0) - Number(r.cout_total || 0);
                  const ticket = (r.description || '').match(/Ticket\s([^|]+)/)?.[1] || '—';
                  return (
                    <TableRow key={r.id} hover>
                      <TableCell>{new Date(r.created_at).toLocaleString('fr-FR')}</TableCell>
                      <TableCell><Chip size="small" label={ticket} /></TableCell>
                      <TableCell>{r.source}</TableCell>
                      <TableCell align="right">{Number(r.montant).toFixed(2)}</TableCell>
                      <TableCell align="right">{Number(r.cout_total || 0).toFixed(2)}</TableCell>
                      <TableCell align="right" sx={{ 
                        fontWeight: 600, 
                        color: profit >= 0 ? 'success.main' : 'error.main' 
                      }}>
                        {profit.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Box>
        
        {rows.length > 0 && (
          <Box sx={{ 
            borderTop: 1, 
            borderColor: 'divider', 
            bgcolor: 'background.default',
            p: 1
          }}>
            <Table size="small">
              <TableBody>
                <TableRow>
                  <TableCell colSpan={3} align="right" sx={{ 
                    fontWeight: 700, 
                    border: 'none',
                    py: 1
                  }}>
                    Totaux
                  </TableCell>
                  <TableCell align="right" sx={{ 
                    fontWeight: 700, 
                    border: 'none',
                    py: 1
                  }}>
                    {totals.total.toFixed(2)}
                  </TableCell>
                  <TableCell align="right" sx={{ 
                    fontWeight: 700, 
                    border: 'none',
                    py: 1
                  }}>
                    {totals.couts.toFixed(2)}
                  </TableCell>
                  <TableCell align="right" sx={{ 
                    fontWeight: 700, 
                    border: 'none',
                    py: 1,
                    color: totals.profit >= 0 ? 'success.main' : 'error.main'
                  }}>
                    {totals.profit.toFixed(2)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>
    </Box>
  );
}

export default HistoriqueEncaisse;
