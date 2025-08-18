// src/VuePDV.jsx
import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { toast } from 'react-toastify';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  IconButton,
  Tabs,
  Tab,
  Divider,
  Chip,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Grid
} from '@mui/material';
import { Add, Remove, Delete, Print as PrintIcon, ShoppingCartCheckout } from '@mui/icons-material';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function VuePDV() {
  const [inventaire, setInventaire] = useState([]);
  const [services, setServices] = useState([]);
  const [panier, setPanier] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [codeScanne, setCodeScanne] = useState('');
  const [recherche, setRecherche] = useState('');
  const [onglet, setOnglet] = useState('produits');
  const [modePaiement, setModePaiement] = useState('Espèces');
  const [customService, setCustomService] = useState({ nom: '', prix: '', quantite: 1 });

  // Presets services (ARRAY) si table 'services' absente
  const defaultServicePresets = useMemo(() => ([
    {
      id: 'svc-print-bw-a4',
      nom: 'Impression A4 N&B (page)',
      prix_vente: 0.10,
      prix_achat: 0,
      type_item: 'service'
    },
    {
      id: 'svc-print-color-a4',
      nom: 'Impression A4 Couleur (page)',
      prix_vente: 0.5,
      prix_achat: 0,
      type_item: 'service'
    },
    {
      id: 'svc-scan-a4',
      nom: 'Scan A4 (page)',
      prix_vente: 0.5,
      prix_achat: 0,
      type_item: 'service'
    }
  ]), []);

  useEffect(() => {
    async function chargerDonnees() {
      try {
        setChargement(true);
        // Produits de vente
        const { data: invData, error: invError } = await supabase
          .from('inventaire')
          .select('*')
          .eq('type_article', 'Produit de Vente');
        if (invError) throw invError;
        setInventaire(invData || []);

        // Services (si table existe), sinon presets
        try {
          const { data: svcData } = await supabase
            .from('services')
            .select('*');
          if (Array.isArray(svcData) && svcData.length) {
            const mapped = svcData.map(s => ({
              id: `svc-${s.id}`,
              nom: s.nom,
              prix_vente: Number(s.prix) || 0,
              prix_achat: Number(s.prix_achat || 0),
              type_item: 'service'
            }));
            setServices([...defaultServicePresets, ...mapped]);
          } else {
            setServices([...defaultServicePresets]);
          }
        } catch {
          setServices([...defaultServicePresets]);
        }
      } catch (error) {
        console.error('Erreur:', error.message);
        toast.error("Impossible de charger l'inventaire.");
      } finally {
        setChargement(false);
      }
    }
    chargerDonnees();
  }, [defaultServicePresets]);

  const produitsFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return inventaire;
    return inventaire.filter(p => `${p.nom} ${p.sku || ''}`.toLowerCase().includes(q));
  }, [inventaire, recherche]);

  const ajouterAuPanier = (article, options = {}) => {
    const isService = options.isService || article.type_item === 'service';
    const id = article.id;
    const baseItem = {
      ...article,
      id,
      type_item: isService ? 'service' : 'product',
      quantite: options.quantite ? Number(options.quantite) : 1,
      prix_vente: Number(article.prix_vente || article.prix || 0),
      prix_achat: Number(article.prix_achat || 0)
    };

    setPanier(prev => {
      const exist = prev.find(i => i.id === id && i.type_item === baseItem.type_item);
      if (exist) {
        return prev.map(i => i.id === id && i.type_item === baseItem.type_item
          ? { ...i, quantite: i.quantite + baseItem.quantite }
          : i
        );
      }
      return [...prev, baseItem];
    });
  };

  const changerQuantite = (id, type_item, q) => {
    const quant = Math.max(1, Number(q) || 1);
    setPanier(prev => prev.map(i => i.id === id && i.type_item === type_item ? { ...i, quantite: quant } : i));
  };

  const incrementer = (id, type_item, d = 1) => {
    setPanier(prev => prev.map(i => i.id === id && i.type_item === type_item ? { ...i, quantite: i.quantite + d } : i));
  };

  const retirerDuPanier = (id, type_item) => {
    setPanier(prev => prev.filter(i => !(i.id === id && i.type_item === type_item)));
  };

  const handleScan = async (e) => {
    e.preventDefault();
    if (!codeScanne) return;
    const produitTrouve = inventaire.find(p => String(p.sku) === String(codeScanne));
    if (produitTrouve) {
      ajouterAuPanier(produitTrouve);
      toast.success(`${produitTrouve.nom} ajouté au panier !`);
    } else {
      toast.error(`Produit avec le code ${codeScanne} non trouvé.`);
    }
    setCodeScanne('');
  };

  const calculerTotal = () => panier
    .reduce((total, item) => total + Number(item.prix_vente) * Number(item.quantite), 0)
    .toFixed(2);

  const calculerCoutTotal = () => panier
    .reduce((total, item) => total + Number(item.prix_achat || 0) * Number(item.quantite), 0);

  const handleEncaisser = async () => {
    if (panier.length === 0) {
      toast.error('Le panier est vide !');
      return;
    }

    const totalVente = parseFloat(calculerTotal());
    const coutTotalVente = calculerCoutTotal();
    const ticketNo = `T-${Date.now()}`;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const wallet = modePaiement === 'Espèces' ? 'Caisse' : 'Banque';

      // Try insert with wallet + is_internal; fallback without if schema missing
      const basePayload = {
        type: 'Revenu',
        source: `Vente au Détail - ${modePaiement}`,
        montant: totalVente,
        cout_total: coutTotalVente,
        description: `Ticket ${ticketNo} | ${panier.length} ligne(s) | Paiement: ${modePaiement}`,
        user_id: user?.id || null
      };

      let { error: transactionError } = await supabase
        .from('transactions')
        .insert({ ...basePayload, wallet, is_internal: false });

      if (transactionError && String(transactionError.message || '').toLowerCase().includes('column')) {
        // Fallback if custom columns not present
        const retry = await supabase.from('transactions').insert(basePayload);
        transactionError = retry.error;
      }

      if (transactionError) throw transactionError;

      // MAJ stock uniquement pour les produits (objets ayant quantite_stock défini)
      const produitsPanier = panier.filter(i => typeof i.quantite_stock === 'number');
      if (produitsPanier.length) {
        const misesAJourStock = produitsPanier.map(item => {
          const nouveauStock = item.quantite_stock - item.quantite;
          return supabase
            .from('inventaire')
            .update({ quantite_stock: nouveauStock })
            .eq('id', item.id);
        });
        await Promise.all(misesAJourStock);
      }

      toast.success(`Vente ${ticketNo} de ${totalVente.toFixed(2)} DT enregistrée !`);
      setPanier([]);
    } catch (error) {
      toast.error("Erreur lors de l'encaissement: " + error.message);
    }
  };

  const handleImprimerTicket = () => {
    try {
      if (panier.length === 0) {
        toast.error('Le panier est vide !');
        return;
      }
      
      console.log('Starting ticket print...');
      
      const doc = new jsPDF();
      const date = new Date();
      const ticketNo = `T-${date.toISOString().slice(0,19).replace(/[:T]/g,'')}`;
      
      // Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('Mizania+ - Reçu de Vente', 14, 20);
      doc.setLineWidth(0.5);
      doc.line(14, 24, 196, 24);
      
      
      // Summary
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.text(`Ticket: ${ticketNo}`, 14, 32);
      doc.text(`Date: ${date.toLocaleString('fr-FR')}`, 14, 40);
      doc.text(`Mode de paiement: ${modePaiement}`, 14, 48);
      
      console.log('Header added, creating table...');
      
      // Items table
      const tableData = panier.map(i => [
        i.nom || i.description || i.sku || i.id,
        `${Number(i.prix_vente).toFixed(2)} DT`,
        String(i.quantite),
        `${(Number(i.prix_vente) * Number(i.quantite)).toFixed(2)} DT`
      ]);
      autoTable(doc, {
        startY: 54,
        head: [['Article', 'PU', 'Qté', 'Total']],
        body: tableData,
        styles: { fontSize: 10 }
      });
      
      // Total
      const finalY = doc.lastAutoTable.finalY || 50;
      doc.text(`Total: ${calculerTotal()} DT`, 14, finalY + 8);
      
      console.log('Table created, saving ticket...');
      
      const filename = `ticket-${ticketNo}.pdf`;
      doc.save(filename);
      
      console.log('Ticket saved:', filename);
      
    } catch (error) {
      console.error('Error printing ticket:', error);
      toast.error('Erreur lors de l\'impression du ticket: ' + error.message);
    }
  };

  const handleAjouterCustomService = () => {
    if (!customService.nom || !customService.prix) {
      toast.error('Nom et prix requis.');
      return;
    }
    ajouterAuPanier({
      id: `svc-custom-${Date.now()}`,
      nom: customService.nom,
      prix_vente: Number(customService.prix),
      prix_achat: 0,
      type_item: 'service'
    }, { quantite: Number(customService.quantite) || 1, isService: true });
    setCustomService({ nom: '', prix: '', quantite: 1 });
  };

  if (chargement) return <div>Chargement du PDV...</div>;

  return (
    <Box sx={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header Section - Search and Barcode Scanner */}
      <Card sx={{ flexShrink: 0 }}>
        <CardContent sx={{ py: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Rechercher un produit (nom ou SKU)"
              value={recherche}
              onChange={e => setRecherche(e.target.value)}
              size="small"
              fullWidth
            />
            <Box component="form" onSubmit={handleScan} sx={{ display: 'flex', gap: 1, minWidth: { sm: 'auto', xs: '100%' } }}>
              <TextField
                label="Scanner un code-barres"
                value={codeScanne}
                onChange={e => setCodeScanne(e.target.value)}
                size="small"
                sx={{ minWidth: 200 }}
              />
              <Button type="submit" variant="outlined">Ajouter</Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* Main Content Area - Side by Side Layout */}
      <Box sx={{ flex: 1, display: 'flex', gap: 2, overflow: 'hidden' }}>
        {/* Left Column: Product/Service Selection */}
        <Card sx={{ flex: { xs: 1, lg: 3 }, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Tabs value={onglet} onChange={(_, v) => setOnglet(v)} sx={{ mb: 2, flexShrink: 0 }}>
              <Tab value="produits" label="Produits" />
              <Tab value="services" label="Services d'impression & traitement" />
            </Tabs>

            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {onglet === 'produits' && (
                <Grid container spacing={1}>
                  {produitsFiltres.map((p) => (
                    <Grid item xs={6} sm={4} md={3} lg={2} key={p.id}>
                        <Button
                        variant="outlined"
                        onClick={() => ajouterAuPanier(p)}
                        fullWidth
                        sx={{ 
                          justifyContent: 'space-between',
                          height: 64,
                          flexDirection: 'column',
                          fontSize: '0.75rem'
                        }}
                      >
                        <span style={{ textAlign: 'center', fontWeight: 'bold' }}>{p.nom}</span>
                        <span style={{ color: '#10B981' }}>{Number(p.prix_vente).toFixed(2)} DT</span>
                      </Button>
                    </Grid>
                  ))}
                </Grid>
              )}

              {onglet === 'services' && (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>Rapides</Typography>
                  <Grid container spacing={1} sx={{ mb: 2 }}>
                    {Array.isArray(services) && services.length > 0 ? (
                      services.map(s => (
                        <Grid item xs={6} sm={4} md={3} lg={2} key={s.id}>
                          <Button
                            variant="outlined"
                            onClick={() => ajouterAuPanier(s, { isService: true })}
                            fullWidth
                            sx={{ 
                              height: 64,
                              flexDirection: 'column',
                              fontSize: '0.75rem'
                            }}
                          >
                            <span style={{ textAlign: 'center', fontWeight: 'bold' }}>{s.nom}</span>
                            <span style={{ color: '#10B981' }}>{Number(s.prix_vente).toFixed(2)} DT</span>
                          </Button>
                        </Grid>
                      ))
                    ) : (
                      <Grid item xs={12}>
                        <Typography variant="body2" color="text.secondary">Aucun service</Typography>
                      </Grid>
                    )}
                  </Grid>

                  <Divider sx={{ my: 2 }} />

                  <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>Service personnalisé</Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <TextField 
                      label="Nom du service" 
                      value={customService.nom} 
                      onChange={e => setCustomService(cs => ({ ...cs, nom: e.target.value }))} 
                      size="small" 
                      fullWidth 
                    />
                    <TextField 
                      label="Prix (DT)" 
                      type="number" 
                      inputProps={{ step: '0.01' }} 
                      value={customService.prix} 
                      onChange={e => setCustomService(cs => ({ ...cs, prix: e.target.value }))} 
                      size="small" 
                      sx={{ width: 140 }} 
                    />
                    <TextField 
                      label="Quantité" 
                      type="number" 
                      value={customService.quantite} 
                      onChange={e => setCustomService(cs => ({ ...cs, quantite: e.target.value }))} 
                      size="small" 
                      sx={{ width: 120 }} 
                    />
                    <Button variant="contained" onClick={handleAjouterCustomService}>Ajouter</Button>
                  </Stack>
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>

        {/* Right Column: Shopping Cart */}
        <Card sx={{ flex: { xs: 1, lg: 2 }, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 400 }}>
          <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2, flexShrink: 0 }}>
              <Typography variant="h6">Panier</Typography>
              <Stack direction="row" spacing={1}>
                <ToggleButtonGroup
                  value={modePaiement}
                  exclusive
                  onChange={(_, v) => v && setModePaiement(v)}
                  size="small"
                >
                  <ToggleButton value="Espèces">Espèces</ToggleButton>
                  <ToggleButton value="Carte">Carte</ToggleButton>
                </ToggleButtonGroup>
                <Button variant="outlined" startIcon={<PrintIcon />} onClick={handleImprimerTicket}>Ticket</Button>
              </Stack>
            </Stack>

            <Box sx={{ flex: 1, overflow: 'auto', mb: 2 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Article</TableCell>
                    <TableCell align="right">PU (DT)</TableCell>
                    <TableCell align="center">Qté</TableCell>
                    <TableCell align="right">Total (DT)</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {panier.map(item => (
                    <TableRow key={`${item.type_item}-${item.id}`} hover>
                      <TableCell>{item.nom || item.description || item.sku || item.id}</TableCell>
                      <TableCell align="right">{Number(item.prix_vente).toFixed(2)}</TableCell>
                      <TableCell align="center">
                        <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                          <IconButton size="small" onClick={() => incrementer(item.id, item.type_item, -1)} disabled={item.quantite <= 1}>
                            <Remove fontSize="small" />
                          </IconButton>
                          <TextField
                            type="number"
                            size="small"
                            value={item.quantite}
                            onChange={e => changerQuantite(item.id, item.type_item, e.target.value)}
                            sx={{ width: 70 }}
                            inputProps={{ min: 1 }}
                          />
                          <IconButton size="small" onClick={() => incrementer(item.id, item.type_item, +1)}>
                            <Add fontSize="small" />
                          </IconButton>
                        </Stack>
                      </TableCell>
                      <TableCell align="right">{(Number(item.prix_vente) * Number(item.quantite)).toFixed(2)}</TableCell>
                      <TableCell align="center">
                        <IconButton color="error" onClick={() => retirerDuPanier(item.id, item.type_item)}>
                          <Delete />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  {panier.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                        Aucun article dans le panier
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>

            <Box sx={{ flexShrink: 0 }}>
              <Divider sx={{ mb: 2 }} />
              
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 3 }}>
                <Typography variant="h6" color="text.secondary">Total</Typography>
                <Typography variant="h4" sx={{ fontWeight: 800, color: 'primary.main' }}>
                  {calculerTotal()} DT
                </Typography>
              </Stack>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<ShoppingCartCheckout />}
                  onClick={handleEncaisser}
                  disabled={panier.length === 0}
                  size="large"
                  fullWidth
                >
                  Encaisser
                </Button>
                <Button 
                  variant="outlined" 
                  color="inherit" 
                  onClick={() => setPanier([])} 
                  disabled={panier.length === 0}
                  sx={{ minWidth: 100 }}
                >
                  Vider
                </Button>
              </Stack>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

export default VuePDV;