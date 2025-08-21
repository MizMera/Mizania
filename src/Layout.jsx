// src/Layout.jsx
import { useState, useEffect, useMemo, useRef } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { toast } from 'react-toastify';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
  InputBase,
  Badge
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Inventory as InventoryIcon,
  PointOfSale as POSIcon,
  Build as RepairIcon,
  AccountCircle,
  Logout,
  Menu as MenuIcon,
  Search,
  NotificationsNone,
  AccountBalanceWallet,
  MoneyOff,
  SwapHoriz,
  AdminPanelSettings
} from '@mui/icons-material';
import GroupIcon from '@mui/icons-material/Group';

// widths for mini-variant drawer
const drawerWidth = 260; // expanded width
const collapsedWidth = 72; // icon-only width

// Customize each item: choose icon gradients and colors
const menuItems = [
  { text: 'Tableau de Bord', path: '/dashboard', Icon: DashboardIcon },
  { text: 'Inventaire', path: '/', Icon: InventoryIcon },
  { text: 'Point de Vente', path: '/pdv', Icon: POSIcon },
  { text: 'Réparations', path: '/reparations', Icon: RepairIcon },
  { text: 'Gestion Encaisse', path: '/gestion-encaisse', Icon: AccountBalanceWallet },
  { text: 'Dépenses', path: '/depenses', Icon: MoneyOff },
  { text: 'Transferts', path: '/transferts', Icon: SwapHoriz },
  { text: 'Clients', path: '/clients', Icon: GroupIcon },
  { text: 'Administration', path: '/admin', Icon: AdminPanelSettings },
];

function Layout() {
  const [user, setUser] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Quick Search state
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]); // {label, sublabel, path}
  const [searchLoading, setSearchLoading] = useState(false);
  const searchAnchorRef = useRef(null);
  const debounceRef = useRef();

  // Notifications state
  const [notifAnchor, setNotifAnchor] = useState(null);
  const [notifications, setNotifications] = useState([]); // {label, path}

  useEffect(() => {
    // Vérifier l'utilisateur actuel
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();

    // Écouter les changements d'authentification
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // (Re)load notifications when route changes
    loadNotifications();
    // close search menu when route changes
    setSearchOpen(false);
  }, [location.pathname]);

  // Cleanup debounce on unmount to avoid dangling timers
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAnchorEl(null);
    toast.success('Déconnexion réussie');
    navigate('/login');
  };

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const commandSuggestions = useMemo(() => ([
    { key: 'dashboard', label: 'Aller au Tableau de Bord', path: '/dashboard' },
    { key: 'inventaire', label: 'Ouvrir Inventaire', path: '/' },
    { key: 'pdv', label: 'Ouvrir Point de Vente', path: '/pdv' },
    { key: 'reparations', label: 'Voir Réparations', path: '/reparations' },
    { key: 'encaisse', label: 'Gestion Encaisse', path: '/gestion-encaisse' },
    { key: 'depenses', label: 'Voir Dépenses', path: '/depenses' },
    { key: 'transferts', label: 'Voir Transferts', path: '/transferts' },
    { key: 'clients', label: 'Voir Clients', path: '/clients' },
    { key: 'admin', label: 'Administration & Sécurité', path: '/admin' },
  ]), []);

  const runSearch = async (q) => {
    const term = q.trim();
    if (!term) { setSearchResults(commandSuggestions.slice(0, 5)); return; }

    setSearchLoading(true);
    try {
      const results = [];
      // Commands (by fuzzy prefix)
      const cq = term.toLowerCase();
      results.push(...commandSuggestions.filter(c => c.key.startsWith(cq) || c.label.toLowerCase().includes(cq)).slice(0, 5));

      // Products (inventaire)
      try {
        const { data: inv } = await supabase
          .from('inventaire')
          .select('id, nom, sku, quantite_stock')
          .or(`nom.ilike.%${term}%,sku.ilike.%${term}%`)
          .limit(5);
        (inv || []).forEach(p => {
          results.push({
            label: p.nom,
            sublabel: `SKU ${p.sku || '—'} • Stock ${p.quantite_stock ?? '—'}`,
            path: '/',
          });
        });
      } catch (_) { /* ignore */ }

      // Clients (best-effort if table exists)
      try {
        const { data: cls } = await supabase
          .from('clients')
          .select('id, nom, telephone, email')
          .or(`nom.ilike.%${term}%,telephone.ilike.%${term}%,email.ilike.%${term}%`)
          .limit(5);
        (cls || []).forEach(c => {
          results.push({
            label: c.nom || c.email || c.telephone,
            sublabel: [c.telephone, c.email].filter(Boolean).join(' • '),
            path: '/clients',
          });
        });
      } catch (_) { /* ignore */ }

      setSearchResults(results.slice(0, 10));
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    if (!searchOpen) setSearchOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(val), 250);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = searchResults[0];
      if (first?.path) navigate(first.path);
      setSearchOpen(false);
    } else if (e.key === 'Escape') {
      setSearchOpen(false);
    }
  };

  const loadNotifications = async () => {
    try {
      const items = [];
      const [lowRes, repRes] = await Promise.all([
        supabase.from('inventaire').select('id, nom, quantite_stock').lt('quantite_stock', 5).order('quantite_stock', { ascending: true }).limit(5),
        supabase.from('fiches_reparation').select('id, statut').in('statut', ['Reçu','En cours'])
      ]);
      const low = lowRes.data || [];
      const reps = repRes.data || [];
      low.forEach(p => items.push({ label: `Stock faible: ${p.nom} (${p.quantite_stock})`, path: '/' }));
      if (reps.length) {
        const enCours = reps.filter(r => r.statut === 'En cours').length;
        const recus = reps.filter(r => r.statut === 'Reçu').length;
        if (recus) items.push({ label: `${recus} réparation(s) reçue(s)`, path: '/reparations' });
        if (enCours) items.push({ label: `${enCours} réparation(s) en cours`, path: '/reparations' });
      }
      setNotifications(items);
    } catch (_) {
      setNotifications([]);
    }
  };

  const drawer = (
    <div>
      <Toolbar>
        <Typography className="app-title" variant="h6" noWrap component="div" sx={{ color: '#E5E7EB', fontWeight: '800' }}>
          Mizania+
        </Typography>
      </Toolbar>
      <Divider sx={{ borderColor: 'rgba(148,163,184,0.12)' }} />
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              component={Link}
              to={item.path}
              selected={location.pathname === item.path}
              sx={{
                '&.Mui-selected': {
                  backgroundColor: 'rgba(99,102,241,0.15)',
                  borderRight: '3px solid #6366F1',
                  '& .MuiListItemText-primary': { color: '#E5E7EB', fontWeight: 'bold' },
                },
              }}
            >
              <ListItemIcon sx={{ color: 'inherit' }}>
                <item.Icon sx={{ fontSize: 24 }} />
              </ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </div>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${collapsedWidth}px)` },
          ml: { sm: `${collapsedWidth}px` },
          backgroundColor: 'rgba(2,6,23,0.6)',
          backdropFilter: 'blur(8px)',
          color: 'text.primary',
          boxShadow: '0 10px 30px rgba(0,0,0,0.35)'
        }}
      >
        <Toolbar sx={{ gap: 2 }}>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 1, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>

          {/* Quick Search */}
          <Box ref={searchAnchorRef} sx={{
            flexGrow: 1,
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'rgba(148,163,184,0.12)',
            borderRadius: 2,
            px: 2,
            py: 0.5,
            maxWidth: 520,
            border: '1px solid rgba(148,163,184,0.12)'
          }}>
            <Search sx={{ mr: 1, color: 'text.secondary' }} fontSize="small" />
            <InputBase
              placeholder="Rechercher… (ex: pdv, clients, papier, 2233)"
              fullWidth
              sx={{ fontSize: 14 }}
              value={search}
              onChange={handleSearchChange}
              onFocus={() => { setSearchOpen(true); runSearch(search); }}
              onKeyDown={handleSearchKeyDown}
            />
          </Box>

          {/* Notifications + Profile */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton color="inherit" onClick={(e) => setNotifAnchor(e.currentTarget)}>
              <Badge color="secondary" badgeContent={notifications.length} max={9}>
                <NotificationsNone />
              </Badge>
            </IconButton>
            <IconButton
              size="large"
              aria-label="account of current user"
              aria-controls="menu-appbar"
              aria-haspopup="true"
              onClick={(e) => setAnchorEl(e.currentTarget)}
              color="inherit"
            >
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
                {user?.email?.charAt(0).toUpperCase()}
              </Avatar>
            </IconButton>
          </Box>

          {/* Search Results Menu */}
          <Menu
            anchorEl={searchAnchorRef.current}
            open={Boolean(searchOpen && searchAnchorRef.current)}
            onClose={() => setSearchOpen(false)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            PaperProps={{ sx: { minWidth: 420, maxWidth: 520 } }}
            // Avoid focus trap conflicts with the input being the anchor
            disableAutoFocus
            disableEnforceFocus
            disableRestoreFocus
            MenuListProps={{ autoFocusItem: false }}
          >
            <Box sx={{ px: 1, py: 0.5 }}>
              {searchLoading && (
                <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 1 }}>Recherche…</Typography>
              )}
              {!searchLoading && searchResults.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 1 }}>Aucun résultat</Typography>
              )}
              {!searchLoading && searchResults.length > 0 && (
                <List dense>
                  {searchResults.map((r, idx) => (
                    <ListItemButton key={idx} onClick={() => { setSearchOpen(false); if (r.path) navigate(r.path); }}>
                      <ListItemText primary={r.label} secondary={r.sublabel} />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </Box>
          </Menu>

          {/* Notifications Menu */}
          <Menu
            anchorEl={notifAnchor}
            open={Boolean(notifAnchor)}
            onClose={() => setNotifAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            PaperProps={{ sx: { minWidth: 320 } }}
          >
            <Box sx={{ px: 1, py: 1 }}>
              {notifications.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 1 }}>Aucune notification</Typography>
              ) : (
                <List dense>
                  {notifications.map((n, idx) => (
                    <ListItemButton key={idx} onClick={() => { setNotifAnchor(null); if (n.path) navigate(n.path); }}>
                      <ListItemText primary={n.label} />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </Box>
          </Menu>

          <Menu
            id="menu-appbar"
            anchorEl={anchorEl}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            keepMounted
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
          >
            <MenuItem onClick={() => setAnchorEl(null)}>
              <AccountCircle sx={{ mr: 1 }} />
              {user?.email}
            </MenuItem>
            <MenuItem onClick={handleLogout}>
              <Logout sx={{ mr: 1 }} />
              Déconnexion
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{ width: { sm: collapsedWidth }, flexShrink: { sm: 0 } }}
      >
        {/* Mobile drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth }
          }}
        >
          {drawer}
        </Drawer>

        {/* Desktop mini-variant drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': (theme) => ({
              boxSizing: 'border-box',
              width: collapsedWidth,
              overflowX: 'hidden',
              whiteSpace: 'nowrap',
              transition: theme.transitions.create('width', { easing: theme.transitions.easing.sharp, duration: theme.transitions.duration.shorter }),
              backgroundColor: '#0F172A',
              color: '#E5E7EB',
              borderRight: '1px solid rgba(148,163,184,0.08)',
              // center icons and hide labels by default
              '& .MuiListItemButton-root': { justifyContent: 'center', px: 2 },
              '& .MuiListItemIcon-root': { minWidth: 0, mr: 0, justifyContent: 'center', color: 'inherit' },
              '& .MuiListItemText-root': { opacity: 0, width: 0, transition: 'opacity .2s ease, width .2s ease' },
              '& .app-title': { opacity: 0, width: 0, transition: 'opacity .2s ease, width .2s ease' },
              // expand on hover
              '&:hover': {
                width: drawerWidth,
              },
              '&:hover .MuiListItemButton-root': { justifyContent: 'initial', px: 2.5 },
              '&:hover .MuiListItemIcon-root': { mr: 1.5, justifyContent: 'initial' },
              '&:hover .MuiListItemText-root': { opacity: 1, width: 'auto' },
              '&:hover .app-title': { opacity: 1, width: 'auto' },
            })
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          mt: 8,
          background: 'radial-gradient(1200px 600px at 100% -10%, rgba(99,102,241,0.12), transparent), radial-gradient(800px 400px at -10% 100%, rgba(14,165,233,0.08), transparent), #0B1220',
          minHeight: 'calc(100vh - 64px)',
          width: '100%',
          overflowX: 'hidden'
        }}  
      >
        <Box sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', minHeight: 'inherit' }}>
          <Outlet />
          {/* App credit footer */}
          <Box component="footer" sx={{
            mt: 'auto',
            pt: 2,
            borderTop: '1px solid rgba(148,163,184,0.12)',
            textAlign: 'center',
            color: 'text.secondary',
            fontSize: '0.8rem'
          }}>
            Built by Khalil Zghida • Mizania+
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default Layout;