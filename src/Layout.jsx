// src/Layout.jsx
import { useState, useEffect } from 'react';
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
  NotificationsNone
} from '@mui/icons-material';
import GroupIcon from '@mui/icons-material/Group';

// widths for mini-variant drawer
const drawerWidth = 260; // expanded width
const collapsedWidth = 72; // icon-only width

const menuItems = [
  { text: 'Tableau de Bord', path: '/dashboard', icon: <DashboardIcon /> },
  { text: 'Inventaire', path: '/', icon: <InventoryIcon /> },
  { text: 'Point de Vente', path: '/pdv', icon: <POSIcon /> },
  { text: 'Réparations', path: '/reparations', icon: <RepairIcon /> },
  { text: 'Gestion Encaisse', path: '/gestion-encaisse', icon: <POSIcon /> },
  { text: 'Dépenses', path: '/depenses', icon: <RepairIcon /> },
  { text: 'Transferts', path: '/transferts', icon: <POSIcon /> },
  { text: 'Clients', path: '/clients', icon: <GroupIcon /> },
  { text: 'Administration', path: '/admin', icon: <AccountCircle /> }
];

function Layout() {
  const [user, setUser] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAnchorEl(null);
    toast.success('Déconnexion réussie');
    navigate('/login');
  };

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
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
                  '& .MuiListItemIcon-root': { color: '#A5B4FC' },
                  '& .MuiListItemText-primary': { color: '#E5E7EB', fontWeight: 'bold' }
                }
              }}
            >
              <ListItemIcon sx={{ color: 'inherit' }}>{item.icon}</ListItemIcon>
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

          {/* Search */}
          <Box sx={{
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
            <InputBase placeholder="Rechercher..." fullWidth sx={{ fontSize: 14 }} />
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton color="inherit">
              <Badge color="secondary" variant="dot">
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
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}

export default Layout;