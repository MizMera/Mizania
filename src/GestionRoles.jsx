// src/GestionRoles.jsx
import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { toast } from 'react-toastify';
import {
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  CircularProgress,
  Paper,
  TableContainer,
  TableSortLabel,
  Toolbar,
  TextField,
  IconButton,
  Tooltip,
  TablePagination,
  Stack,
  InputAdornment,
  FormControlLabel,
  Switch
} from '@mui/material';
import { Refresh, Search as SearchIcon } from '@mui/icons-material';

function descendingComparator(a, b, orderBy) {
  let va = a?.[orderBy];
  let vb = b?.[orderBy];
  if (orderBy === 'created_at' || orderBy === 'last_sign_in_at') {
    va = va ? new Date(va).getTime() : 0;
    vb = vb ? new Date(vb).getTime() : 0;
  }
  if (vb < va) return -1;
  if (vb > va) return 1;
  return 0;
}
function getComparator(order, orderBy) {
  return order === 'desc'
    ? (a, b) => descendingComparator(a, b, orderBy)
    : (a, b) => -descendingComparator(a, b, orderBy);
}
function stableSort(array, comparator) {
  const stabilized = array.map((el, index) => [el, index]);
  stabilized.sort((a, b) => {
    const cmp = comparator(a[0], b[0]);
    if (cmp !== 0) return cmp;
    return a[1] - b[1];
  });
  return stabilized.map(el => el[0]);
}

function GestionRoles() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI state: search, sorting, pagination, density
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState('asc');
  const [orderBy, setOrderBy] = useState('email');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [dense, setDense] = useState(true);

  const fetchUsers = async () => {   // Fonction pour récupérer les utilisateurs
    try {
      setLoading(true);
      // 1) Essayer de récupérer via la RPC sécurisée si disponible
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_list_users');
      if (!rpcError && rpcData) {
        setUsers(rpcData);
        return;
      }
      // 2) Sinon, repli vers la table user_profiles (infos limitées)
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, role')
        .order('email', { ascending: true });
      if (error) throw error;
      // Normaliser le format pour le tableau
      const normalized = (data || []).map(u => ({
        id: u.id,
        email: u.email,
        role: u.role,
        created_at: null,
        last_sign_in_at: null,
      }));
      setUsers(normalized);
      if (rpcError) {
        console.warn('admin_list_users RPC non trouvée. Utilisation du repli user_profiles.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors du chargement des utilisateurs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (userId, newRole) => {
    // Optimistic UI update
    setUsers(prev => prev.map(u => (u.id === userId ? { ...u, role: newRole } : u)));
    const { error } = await supabase.from('user_profiles').update({ role: newRole }).eq('id', userId);
    if (error) {
      toast.error('Erreur de mise à jour: ' + error.message);
      // Rafraîchir pour retrouver l'état serveur
      fetchUsers();
    } else {
      toast.success('Rôle mis à jour !');
    }
  };

  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u.email || '').toLowerCase().includes(q) ||
      (u.id || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q)
    );
  }, [users, search]);

  const sorted = useMemo(() => stableSort(filtered, getComparator(order, orderBy)), [filtered, order, orderBy]);
  const paginated = useMemo(() => sorted.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage), [sorted, page, rowsPerPage]);

  const handleChangePage = (_e, newPage) => setPage(newPage);
  const handleChangeRowsPerPage = (e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box 
      sx={{ 
        height: 'calc(100vh - 100px)', 
        display: 'flex', 
        flexDirection: 'column',
        gap: 2
      }}
    >
      <Typography variant="h4" sx={{ fontWeight: 800 }}>Gestion des Utilisateurs</Typography>
      
      <Paper sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Toolbar sx={{ gap: 1, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: { xs: 1, sm: 0 } }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Utilisateurs</Typography>
            <FormControlLabel
              control={<Switch size="small" checked={dense} onChange={e => setDense(e.target.checked)} />}
              label={dense ? 'Compact' : 'Confort'}
            />
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ width: { xs: '100%', sm: 'auto' } }}>
            <TextField
              value={search}
              onChange={e => setSearch(e.target.value)}
              size="small"
              placeholder="Rechercher (email, id, rôle)"
              sx={{ minWidth: { xs: '100%', sm: 280 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                )
              }}
            />
            <Tooltip title="Rafraîchir">
              <IconButton onClick={fetchUsers}>
                <Refresh />
              </IconButton>
            </Tooltip>
          </Stack>
        </Toolbar>

        <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
          <TableContainer sx={{ maxHeight: { xs: 420, md: 600 }, overflowX: 'auto' }}>
            <Table size={dense ? 'small' : 'medium'} stickyHeader sx={{ minWidth: 800 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>
                    <TableSortLabel
                      active={orderBy === 'email'}
                      direction={orderBy === 'email' ? order : 'asc'}
                      onClick={() => handleRequestSort('email')}
                    >
                      Email
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold', display: { xs: 'none', sm: 'table-cell' } }}>
                    <TableSortLabel
                      active={orderBy === 'id'}
                      direction={orderBy === 'id' ? order : 'asc'}
                      onClick={() => handleRequestSort('id')}
                    >
                      ID Utilisateur
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold', display: { xs: 'none', sm: 'table-cell' } }}>
                    <TableSortLabel
                      active={orderBy === 'created_at'}
                      direction={orderBy === 'created_at' ? order : 'asc'}
                      onClick={() => handleRequestSort('created_at')}
                    >
                      Créé le
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold', display: { xs: 'none', sm: 'table-cell' } }}>
                    <TableSortLabel
                      active={orderBy === 'last_sign_in_at'}
                      direction={orderBy === 'last_sign_in_at' ? order : 'asc'}
                      onClick={() => handleRequestSort('last_sign_in_at')}
                    >
                      Dernière connexion
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 'bold' }}>
                    <TableSortLabel
                      active={orderBy === 'role'}
                      direction={orderBy === 'role' ? order : 'asc'}
                      onClick={() => handleRequestSort('role')}
                    >
                      Rôle
                    </TableSortLabel>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">Aucun utilisateur trouvé</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map(user => (
                    <TableRow key={user.id} hover>
                      <TableCell sx={{ wordBreak: 'break-word' }}>{user.email || '—'}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', display: { xs: 'none', sm: 'table-cell' } }}>{user.id}</TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{user.created_at ? new Date(user.created_at).toLocaleString('fr-FR') : '—'}</TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('fr-FR') : '—'}</TableCell>
                      <TableCell>
                        <FormControl size="small" sx={{ minWidth: 140 }}>
                          <InputLabel id={`role-label-${user.id}`}>Rôle</InputLabel>
                          <Select
                            labelId={`role-label-${user.id}`}
                            label="Rôle"
                            value={user.role || 'visiteur'}
                            onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          >
                            <MenuItem value="visiteur">Visiteur</MenuItem>
                            <MenuItem value="technicien">Technicien</MenuItem>
                            <MenuItem value="admin">Admin</MenuItem>
                          </Select>
                        </FormControl>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
        <TablePagination
          component="div"
          count={sorted.length}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[5, 10, 25]}
        />
      </Paper>
    </Box>
  );
}
export default GestionRoles;