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
  Grid,
  TableContainer,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem
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
  const [customService, setCustomService] = useState({ nom: '', prix: '', quantite: 1, cout: '', wallet: 'Caisse' });
  const [cartePostaleBalance, setCartePostaleBalance] = useState(null);

  // Presets services (ARRAY) si table 'services' absente
  const defaultServicePresets = useMemo(() => {
    const MARGIN_RATE = 0.6; // 60% de marge (profit / prix)
    const costFromPrice = (price) => Number((price * (1 - MARGIN_RATE)).toFixed(3));

    const bwCopyPrice = 0.10;     // Photocopie N&B
    const bwPrintPrice = 0.15;    // Tirage N&B
    const colorPrice = 0.50;      // Couleur (photocopie/tirage)

    return [
      {
        id: 'svc-print-bw-a4',
        nom: 'Impression A4 N&B (page)',
        prix_vente: bwCopyPrice,
        prix_achat: costFromPrice(bwCopyPrice), // 0.04 DT coût cible
        type_item: 'service'
      },
      {
        id: 'svc-print-color-a4',
        nom: 'Impression A4 Couleur (page)',
        prix_vente: colorPrice,
        prix_achat: costFromPrice(colorPrice), // 0.20 DT coût cible
        type_item: 'service'
      },
      {
        id: 'svc-scan-a4',
        nom: 'Scan A4 (page)',
        prix_vente: 0.5,
        prix_achat: 0,
        type_item: 'service'
      },
      {
        id: 'svc-Tirage-bw-a4',
        nom: 'Tirage A4 N&B (page)',
        prix_vente: bwPrintPrice,
        prix_achat: costFromPrice(bwPrintPrice), // 0.06 DT coût cible
        type_item: 'service'
      },
      {
        id: 'svc-Tirage-couleur-a4',
        nom: 'Tirage A4 Couleur (page)',
        prix_vente: colorPrice,
        prix_achat: costFromPrice(colorPrice), // 0.20 DT coût cible
        type_item: 'service'
      },
      {
        id: 'svc-inscription-eleve-primaire-direct',
        nom: 'Inscription élève primaire (paiement direct)',
        prix_vente: 5.0,
        prix_achat: 0,
        type_item: 'service'
      },
      {
        id: 'svc-inscription-eleve-primaire-carte',
        nom: 'Inscription élève primaire (via notre carte)',
        prix_vente: 10.0, // 4 DT expense + 1 DT service fee + 5 DT base fee
        prix_achat: 4.0, // 4 DT expense to Carte Postale
        type_item: 'service'
      },
      {
        id: 'svc-inscription-eleve-secondaire-direct',
        nom: 'Inscription élève secondaire (paiement direct)',
        prix_vente: 5.0,
        prix_achat: 0,
        type_item: 'service'
      },
      {
        id: 'svc-inscription-eleve-secondaire-carte',
        nom: 'Inscription élève secondaire (via notre carte)',
        prix_vente: 15.0, // 8.6 DT expense + 1.4 DT service fee + 5 DT base fee
        prix_achat: 8.6, // 8.6 DT expense to Carte Postale
        type_item: 'service'
      },
      {
        id: 'svc-B3-carte',
        nom: 'Inscription B3 (via notre carte)',
        prix_vente: 15.0, // 10 DT expense + 5 DT base fee
        prix_achat: 10.0, // 10 DT expense to Carte Postale
        type_item: 'service'
      }
    ];
  }, []);

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

        // Charger le solde Carte Postale
        await loadCartePostaleBalance();
      } catch (error) {
        console.error('Erreur:', error.message);
        toast.error("Impossible de charger l'inventaire.");
      } finally {
        setChargement(false);
      }
    }
    chargerDonnees();
  }, [defaultServicePresets]);

  const loadCartePostaleBalance = async () => {
    try {
      const { data } = await supabase
        .from('transactions')
        .select('type, montant, wallet')
        .eq('wallet', 'Carte Postal');
      
      if (data) {
        let balance = 0;
        data.forEach(t => {
          const amount = Number(t.montant) || 0;
          if (t.type === 'Revenu') balance += amount;
          else if (t.type === 'Dépense') balance -= amount;
        });
        setCartePostaleBalance(balance);
      }
    } catch (error) {
      console.warn('Impossible de charger le solde Carte Postale:', error.message);
    }
  };

  const produitsFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return inventaire;
    return inventaire.filter(p => `${p.nom} ${p.sku || ''}`.toLowerCase().includes(q));
  }, [inventaire, recherche]);

  // Helpers de stock
  const stockDisponible = (id) => {
    const prod = inventaire.find(p => p.id === id);
    return typeof prod?.quantite_stock === 'number' ? Number(prod.quantite_stock) : Infinity;
  };
  const quantiteDansPanier = (id) => panier
    .filter(i => i.id === id && i.type_item === 'product')
    .reduce((s, i) => s + Number(i.quantite || 0), 0);

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

    // Vérification spéciale pour les services qui utilisent la carte postale
    if (isService && (['svc-inscription-eleve-primaire-carte', 'svc-inscription-eleve-secondaire-carte', 'svc-B3-carte'].includes(id) || baseItem.wallet === 'Carte Postal')) {
      const coutCarte = Number(baseItem.prix_achat) * Number(baseItem.quantite);
      if (cartePostaleBalance !== null && cartePostaleBalance < coutCarte) {
        toast.error(`Solde insuffisant sur la Carte Postale (disponible: ${cartePostaleBalance.toFixed(2)} DT, requis: ${coutCarte.toFixed(2)} DT)`);
        return;
      }
      if (cartePostaleBalance !== null && cartePostaleBalance < 10) {
        toast.warn(`Attention: Solde Carte Postale faible (${cartePostaleBalance.toFixed(2)} DT)`);
      }
    }

    // Contrôle de stock pour les produits
    if (!isService) {
      const dispo = stockDisponible(id);
      const deja = quantiteDansPanier(id);
      const restant = dispo - deja;
      if (restant <= 0) {
        toast.error(`Stock insuffisant pour "${article.nom}" (disponible: ${dispo}).`);
        return;
      }
      if (baseItem.quantite > restant) {
        toast.warn(`Stock limité pour "${article.nom}". Ajout de ${restant} (disponible: ${dispo}).`);
        baseItem.quantite = restant;
      }
    }

    setPanier(prev => {
      const exist = prev.find(i => i.id === id && i.type_item === baseItem.type_item);
      if (exist) {
        // Si produit, re-vérifier la limite
        if (baseItem.type_item === 'product') {
          const dispo = stockDisponible(id);
          const deja = quantiteDansPanier(id);
          const restant = dispo - deja;
          const add = Math.min(restant, baseItem.quantite);
          if (add <= 0) {
            toast.error(`Stock insuffisant pour "${article.nom}" (disponible: ${dispo}).`);
            return prev;
          }
          return prev.map(i => i.id === id && i.type_item === baseItem.type_item
            ? { ...i, quantite: i.quantite + add }
            : i
          );
        }
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
    setPanier(prev => prev.map(i => {
      if (i.id === id && i.type_item === type_item) {
        if (type_item === 'product') {
          const dispo = stockDisponible(id);
          const newQty = Math.min(quant, dispo);
          if (newQty < quant) {
            toast.warn(`Quantité ajustée au stock disponible (${dispo}).`);
          }
          return { ...i, quantite: Math.max(1, newQty) };
        }
        return { ...i, quantite: quant };
      }
      return i;
    }));
  };

  const incrementer = (id, type_item, d = 1) => {
    setPanier(prev => prev.map(i => {
      if (i.id === id && i.type_item === type_item) {
        if (type_item === 'product' && d > 0) {
          const dispo = stockDisponible(id);
          const desired = i.quantite + d;
          if (desired > dispo) {
            toast.warn(`Stock maximum atteint (${dispo}).`);
            return { ...i, quantite: dispo };
          }
        }
        const next = Math.max(1, i.quantite + d);
        return { ...i, quantite: next };
      }
      return i;
    }));
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

    // Re-vérification côté serveur: s'assurer que le stock est suffisant avant de créer la transaction
    const produitsPanier = panier.filter(i => i.type_item === 'product');
    if (produitsPanier.length > 0) {
      const ids = produitsPanier.map(i => i.id);
      const { data: stocksFresh, error: stockErr } = await supabase
        .from('inventaire')
        .select('id, quantite_stock, nom')
        .in('id', ids);
      if (stockErr) {
        toast.error("Erreur de vérification de stock.");
        return;
      }
      const mapFresh = Object.fromEntries((stocksFresh || []).map(r => [r.id, r]));
      const insuff = produitsPanier.filter(i => (mapFresh[i.id]?.quantite_stock ?? 0) < i.quantite);
      if (insuff.length) {
        const msg = insuff.map(i => `"${mapFresh[i.id]?.nom || i.nom}": dispo ${mapFresh[i.id]?.quantite_stock ?? 0}, demandé ${i.quantite}`).join(' | ');
        toast.error(`Stock insuffisant: ${msg}`);
        return;
      }
    }

    const totalVente = parseFloat(calculerTotal());
    const coutTotalVente = calculerCoutTotal();
    const ticketNo = `T-${Date.now()}`;
    // Build a compact items list: "Nom xQté"
    const itemsList = panier
      .map(i => `${(i.nom || i.description || i.sku || 'Article')} x${i.quantite}`)
      .join(', ');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const wallet = modePaiement === 'Espèces' ? 'Caisse' : 'Banque';

      // Try insert with wallet + is_internal; fallback without if schema missing
      const basePayload = {
        type: 'Revenu',
        source: `Vente au Détail - ${modePaiement}`,
        montant: totalVente,
        cout_total: coutTotalVente,
        // Description without redundant counts
        description: `Ticket ${ticketNo} | Articles: ${itemsList} | Paiement: ${modePaiement}`,
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

      // Déduction automatique du solde Carte Postale pour les services qui utilisent notre carte
      const servicesAvecCarte = panier.filter(i => 
        i.type_item === 'service' && 
        (['svc-inscription-eleve-primaire-carte', 'svc-inscription-eleve-secondaire-carte', 'svc-B3-carte'].includes(i.id) || i.wallet === 'Carte Postal') &&
        Number(i.prix_achat) > 0
      );
      
      if (servicesAvecCarte.length > 0) {
        const totalDeduction = servicesAvecCarte.reduce((sum, item) => 
          sum + (Number(item.prix_achat) * Number(item.quantite)), 0
        );
        
        if (totalDeduction > 0) {
          // Créer une transaction de dépense pour la déduction de la carte postale
          const deductionPayload = {
            type: 'Dépense',
            source: 'Déduction Carte Postale - Services clients',
            montant: totalDeduction,
            description: `Déduction automatique carte postale pour ${servicesAvecCarte.map(s => `${s.nom} x${s.quantite}`).join(', ')} - Ticket ${ticketNo}`,
            user_id: user?.id || null
          };

          try {
            let { error: deductionError } = await supabase
              .from('transactions')
              .insert({ ...deductionPayload, wallet: 'Carte Postal', is_internal: true });

            if (deductionError && String(deductionError.message || '').toLowerCase().includes('column')) {
              // Fallback if custom columns not present
              const retry = await supabase.from('transactions').insert(deductionPayload);
              deductionError = retry.error;
            }

            if (deductionError) {
              console.error('Erreur déduction carte postale:', deductionError);
              toast.warn(`Vente enregistrée mais erreur déduction carte postale: ${deductionError.message}`);
            } else {
              toast.info(`${totalDeduction.toFixed(2)} DT déduits de la Carte Postale`);
              // Recharger le solde de la carte postale
              await loadCartePostaleBalance();
            }
          } catch (deductionErr) {
            console.error('Erreur déduction carte postale:', deductionErr);
            toast.warn(`Vente enregistrée mais erreur déduction carte postale: ${deductionErr.message}`);
          }
        }
      }

      // MAJ stock uniquement pour les produits avec une relecture fraiche
      const produitsMaj = panier.filter(i => i.type_item === 'product');
      if (produitsMaj.length) {
        const ids = produitsMaj.map(i => i.id);
        const { data: stocksFresh } = await supabase
          .from('inventaire')
          .select('id, quantite_stock')
          .in('id', ids);
        const mapFresh = Object.fromEntries((stocksFresh || []).map(r => [r.id, r.quantite_stock]));
        const updates = produitsMaj.map(item => {
          const dispo = Number(mapFresh[item.id] ?? 0);
          const nouveauStock = Math.max(0, dispo - Number(item.quantite));
          return supabase
            .from('inventaire')
            .update({ quantite_stock: nouveauStock })
            .eq('id', item.id);
        });
        await Promise.all(updates);
      }

      toast.success(`Vente ${ticketNo} de ${totalVente.toFixed(2)} DT enregistrée !`);
      setPanier([]);
      // Recharger l'inventaire pour refléter les stocks
      try {
        const { data: invData } = await supabase
          .from('inventaire')
          .select('*')
          .eq('type_article', 'Produit de Vente');
        setInventaire(invData || []);
      } catch {}
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

    const cout = Number(customService.cout) || 0;
    const prix = Number(customService.prix);
    
    // Calculate margin percentage
    const margin = prix > 0 ? ((prix - cout) / prix * 100).toFixed(1) : 0;
    
    // Validation for postal card services
    if (customService.wallet === 'Carte Postal' && cout > 0) {
      if (cartePostaleBalance !== null && cartePostaleBalance < cout) {
        toast.error(`Solde insuffisant sur la Carte Postale (disponible: ${cartePostaleBalance.toFixed(2)} DT, requis: ${cout.toFixed(2)} DT)`);
        return;
      }
      if (cartePostaleBalance !== null && cartePostaleBalance < 10) {
        toast.warn(`Attention: Solde Carte Postale faible (${cartePostaleBalance.toFixed(2)} DT)`);
      }
    }

    ajouterAuPanier({
      id: `svc-custom-${Date.now()}`,
      nom: `${customService.nom} (Marge: ${margin}% - ${customService.wallet})`,
      prix_vente: prix,
      prix_achat: cout,
      wallet: customService.wallet,
      type_item: 'service'
    }, { quantite: Number(customService.quantite) || 1, isService: true });
    
    setCustomService({ nom: '', prix: '', quantite: 1, cout: '', wallet: 'Caisse' });
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
            {/* Postal Card Balance Display */}
            {cartePostaleBalance !== null && (
              <Chip 
                label={`Carte Postale: ${cartePostaleBalance.toFixed(2)} DT`}
                color={cartePostaleBalance < 10 ? 'error' : cartePostaleBalance < 25 ? 'warning' : 'success'}
                variant="filled"
                sx={{ minWidth: 160, fontSize: '0.875rem', fontWeight: 600 }}
              />
            )}
          </Stack>
          {cartePostaleBalance !== null && cartePostaleBalance < 10 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Attention: Solde Carte Postale faible ({cartePostaleBalance.toFixed(2)} DT). Pensez à la recharger.
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Main Content Area - Side by Side Layout */}
      <Box sx={{ flex: 1, display: 'flex', gap: 2, overflow: 'hidden', flexDirection: { xs: 'column', lg: 'row' } }}>
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
                  {produitsFiltres.map((p) => {
                    const out = Number(p.quantite_stock) <= 0;
                    return (
                      <Grid item xs={6} sm={4} md={3} lg={2} key={p.id}>
                        <Button
                          variant="outlined"
                          onClick={() => ajouterAuPanier(p)}
                          fullWidth
                          disabled={out}
                          sx={{ 
                            height: 76,
                            p: 1,
                            textTransform: 'none',
                            opacity: out ? 0.5 : 1
                          }}
                        >
                          <Box sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 0.5,
                            width: '100%',
                            height: '100%'
                          }}>
                            <Typography
                              sx={{
                                textAlign: 'center',
                                fontWeight: 700,
                                fontSize: '0.8rem',
                                lineHeight: 1.1,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitBoxOrient: 'vertical',
                                WebkitLineClamp: 2,
                                maxWidth: '100%'
                              }}
                            >
                              {p.nom}
                            </Typography>
                            <Typography
                              sx={{ color: out ? 'text.disabled' : '#10B981', fontWeight: 700, whiteSpace: 'nowrap', fontSize: '0.8rem' }}
                            >
                              {Number(p.prix_vente).toFixed(2)} DT{out ? ' (rupture)' : ''}
                            </Typography>
                          </Box>
                        </Button>
                      </Grid>
                    );
                  })}
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
                              height: 76,
                              p: 1,
                              textTransform: 'none'
                            }}
                          >
                            <Box sx={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 0.5,
                              width: '100%',
                              height: '100%'
                            }}>
                              <Typography
                                sx={{
                                  textAlign: 'center',
                                  fontWeight: 700,
                                  fontSize: '0.8rem',
                                  lineHeight: 1.1,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  display: '-webkit-box',
                                  WebkitBoxOrient: 'vertical',
                                  WebkitLineClamp: 2,
                                  maxWidth: '100%'
                                }}
                              >
                                {s.nom}
                              </Typography>
                              <Typography
                                sx={{ color: '#10B981', fontWeight: 700, whiteSpace: 'nowrap', fontSize: '0.8rem' }}
                              >
                                {Number(s.prix_vente).toFixed(2)} DT
                              </Typography>
                            </Box>
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
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1 }}>
                    <TextField 
                      label="Nom du service" 
                      value={customService.nom} 
                      onChange={e => setCustomService(cs => ({ ...cs, nom: e.target.value }))} 
                      size="small" 
                      fullWidth 
                    />
                    <TextField 
                      label="Prix Vente (DT)" 
                      type="number" 
                      inputProps={{ step: '0.01', min: '0' }} 
                      value={customService.prix} 
                      onChange={e => setCustomService(cs => ({ ...cs, prix: e.target.value }))} 
                      size="small" 
                      sx={{ width: 140 }} 
                    />
                    <TextField 
                      label="Coût (DT)" 
                      type="number" 
                      inputProps={{ step: '0.01', min: '0' }} 
                      value={customService.cout} 
                      onChange={e => setCustomService(cs => ({ ...cs, cout: e.target.value }))} 
                      size="small" 
                      sx={{ width: 140 }} 
                    />
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                      <InputLabel>Source du Coût</InputLabel>
                      <Select 
                        value={customService.wallet} 
                        onChange={e => setCustomService(cs => ({ ...cs, wallet: e.target.value }))} 
                        label="Source du Coût"
                      >
                        <MenuItem value="Caisse">Caisse</MenuItem>
                        <MenuItem value="Banque">Banque</MenuItem>
                        <MenuItem value="Coffre">Coffre</MenuItem>
                        <MenuItem value="Carte Postal">Carte Postale</MenuItem>
                        <MenuItem value="Carte Banker">Carte Banker</MenuItem>
                      </Select>
                    </FormControl>
                    <TextField 
                      label="Quantité" 
                      type="number" 
                      inputProps={{ min: '1' }}
                      value={customService.quantite} 
                      onChange={e => setCustomService(cs => ({ ...cs, quantite: e.target.value }))} 
                      size="small" 
                      sx={{ width: 120 }} 
                    />
                    {customService.prix && customService.cout && (
                      <Box sx={{ display: 'flex', alignItems: 'center', px: 1 }}>
                        <Typography variant="caption" color="primary">
                          Marge: {((Number(customService.prix) - Number(customService.cout || 0)) / Number(customService.prix) * 100).toFixed(1)}%
                        </Typography>
                      </Box>
                    )}
                    <Button variant="contained" onClick={handleAjouterCustomService}>Ajouter</Button>
                  </Stack>
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>

        {/* Right Column: Shopping Cart */}
        <Card sx={{ flex: { xs: 1, lg: 2 }, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: { xs: 'auto', md: 400 } }}>
          <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" sx={{ mb: 2, flexShrink: 0 }}>
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
              <TableContainer sx={{ maxHeight: { xs: 300, md: 420 }, overflowX: 'auto' }}>
                <Table size="small" stickyHeader sx={{ minWidth: 600 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Article</TableCell>
                      <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>PU (DT)</TableCell>
                      <TableCell align="center">Qté</TableCell>
                      <TableCell align="right">Total (DT)</TableCell>
                      <TableCell align="center" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {panier.map(item => (
                      <TableRow key={`${item.type_item}-${item.id}`} hover>
                        <TableCell>{item.nom || item.description || item.sku || item.id}</TableCell>
                        <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{Number(item.prix_vente).toFixed(2)}</TableCell>
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
                        <TableCell align="center" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
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
              </TableContainer>
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