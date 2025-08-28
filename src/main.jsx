// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

import App from './App.jsx';
import './global.css';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#6366F1' }, // Indigo
    secondary: { main: '#22C55E' },
    background: { default: '#0B1220', paper: '#111827' },
    text: { primary: '#E5E7EB', secondary: '#94A3B8' }
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: 'Inter, Roboto, Helvetica, Arial, sans-serif',
    h1: { fontWeight: 800 },
    h2: { fontWeight: 800 },
    h3: { fontWeight: 800 },
    button: { textTransform: 'none', fontWeight: 600 }
  },
  components: {
    MuiPaper: { styleOverrides: { root: { borderRadius: 16, backgroundImage: 'none' } } },
    MuiCard: { styleOverrides: { root: { borderRadius: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.35)', backgroundImage: 'none' } } },
    MuiButton: { styleOverrides: { root: { borderRadius: 10, paddingInline: 18, paddingBlock: 10 } } },
    MuiAppBar: { styleOverrides: { root: { backgroundColor: 'rgba(2,6,23,0.6)', backdropFilter: 'blur(8px)', boxShadow: '0 4px 20px rgba(0,0,0,0.35)' } } },
    MuiDrawer: { styleOverrides: { paper: { backgroundColor: '#0F172A', color: '#E5E7EB', borderRight: '1px solid rgba(148,163,184,0.08)' } } },
    MuiTableHead: { styleOverrides: { root: { background: 'rgba(148,163,184,0.08)' } } },
    MuiInputBase: { styleOverrides: { root: { color: '#E5E7EB' } } },
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);