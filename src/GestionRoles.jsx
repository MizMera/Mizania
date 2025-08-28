// src/GestionRoles.jsx
import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { toast } from 'react-toastify';
import {
  Select,
  MenuItem,
  FormControl,
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
  Switch,
  Button
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

  const [search, setSearch] = useState('');
  const [order, setOrder] = useState('asc');
  const [orderBy, setOrderBy] = useState('email');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setUsers(data || []);
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
    setUsers(prev => prev.map(u => (u.id === userId ? { ...u, role: newRole } : u)));
    const { error } = await supabase.from('user_profiles').update({ role: newRole }).eq('id', userId);
    if (error) {
      toast.error('Erreur de mise à jour: ' + error.message);
      fetchUsers();
    } else {
      toast.success('Rôle mis à jour !');
    }
  };

  const handleApprovalChange = async (userId, newStatus) => {
    setUsers(prev => prev.map(u => (u.id === userId ? { ...u, approved: newStatus } : u)));
    const { error } = await supabase.from('user_profiles').update({ approved: newStatus }).eq('id', userId);
    if (error) {
      toast.error('Erreur de mise à jour: ' + error.message);
      fetchUsers();
    } else {
      toast.success(`Utilisateur ${newStatus ? 'approuvé' : 'désapprouvé'} !`);
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
    <Box>
      <Toolbar sx={{ gap: 1, justifyContent: 'space-between', flexWrap: 'wrap', px: '0 !important' }}>
        <TextField
          value={search}
          onChange={e => setSearch(e.target.value)}
          size="small"
          placeholder="Rechercher (email, rôle)"
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
      </Toolbar>

      <TableContainer>
        <Table size="small" stickyHeader sx={{ minWidth: 650 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>
                <TableSortLabel
                  active={orderBy === 'email'}
                  direction={orderBy === 'email' ? order : 'asc'}
                  onClick={() => handleRequestSort('email')}
                >
                  Email
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>
                <TableSortLabel
                  active={orderBy === 'role'}
                  direction={orderBy === 'role' ? order : 'asc'}
                  onClick={() => handleRequestSort('role')}
                >
                  Rôle
                </TableSortLabel>
              </TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                <TableSortLabel
                  active={orderBy === 'approved'}
                  direction={orderBy === 'approved' ? order : 'asc'}
                  onClick={() => handleRequestSort('approved')}
                >
                  Approuvé
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: 'bold', display: { xs: 'none', sm: 'table-cell' } }}>
                <TableSortLabel
                  active={orderBy === 'created_at'}
                  direction={orderBy === 'created_at' ? order : 'asc'}
                  onClick={() => handleRequestSort('created_at')}
                >
                  Créé le
                </TableSortLabel>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">Aucun utilisateur trouvé</Typography>
                </TableCell>
              </TableRow>
            ) : (
              paginated.map(user => (
                <TableRow key={user.id} hover>
                  <TableCell sx={{ wordBreak: 'break-word' }}>{user.email || '—'}</TableCell>
                  <TableCell>
                    <FormControl size="small" sx={{ minWidth: 120 }}>
                      <Select
                        value={user.role || 'visiteur'}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      >
                        <MenuItem value="visiteur">Visiteur</MenuItem>
                        <MenuItem value="technicien">Technicien</MenuItem>
                        <MenuItem value="admin">Admin</MenuItem>
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell align="center">
                    <Switch
                      checked={user.approved}
                      onChange={(e) => handleApprovalChange(user.id, e.target.checked)}
                      size="small"
                      color={user.approved ? "success" : "default"}
                    />
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    {user.created_at ? new Date(user.created_at).toLocaleString('fr-FR') : '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={sorted.length}
        page={page}
        onPageChange={handleChangePage}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        rowsPerPageOptions={[5, 10, 25]}
      />
    </Box>
  );
}
export default GestionRoles;