import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, Outlet } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Box, CircularProgress } from '@mui/material';
import Login from './Login';
import SignUp from './SignUp';
import Layout from './Layout';
import Dashboard from './Dashboard';
import VuePDV from './VuePDV';
import VueReparations from './VueReparations';
import CreerFiche from './CreerFiche';
import DetailFiche from './DetailFiche';
import Clients from './Clients';
import ClientDetail from './ClientDetail';
import GestionDepenses from './GestionDepenses';
import GestionEncaisse from './GestionEncaisse';
import EnhancedGestionEncaisse from './EnhancedGestionEncaisse';
import ClotureCaisse from './ClotureCaisse';
import HistoriqueEncaisse from './HistoriqueEncaisse';
import Transferts from './Transferts';
import SmartTransferSystem from './SmartTransferSystem';
import CashManagementSystem from './CashManagementSystem';
import CartePostaleManager from './CartePostaleManager';
import AdminSecurite from './AdminSecurite';
import StatutUtilisateurActuel from './StatutUtilisateurActuel';
import Inventaire from './Inventaire';

const ProtectedRoute = ({ user, role, allowedRoles, pending, children }) => {
  if (!user) return <Navigate to="/login" replace />;
  if (pending) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    toast.error('Accès non autorisé.');
    return <Navigate to="/" replace />;
  }
  return children ? children : <Outlet />;
};

function App() {
  const [session, setSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    setAuthLoading(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => { authListener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!session?.user) { setUserProfile(null); return; }
      setProfileLoading(true);
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile:', error);
        toast.error('Erreur de chargement du profil.');
      } else {
        setUserProfile(profile);
      }
      setProfileLoading(false);
    };
    fetchProfile();
  }, [session]);

  useEffect(() => {
    if (!session?.user) return;
    const channel = supabase.channel('user_profile_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles', filter: `id=eq.${session.user.id}` }, payload => {
        setUserProfile(payload.new);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user]);

  if (authLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <ToastContainer position="bottom-right" autoClose={5000} hideProgressBar={false} />
      <Router>
        <Routes>
          <Route path="/login" element={!session ? <Login /> : <Navigate to="/" />} />
          <Route path="/signup" element={!session ? <SignUp /> : <Navigate to="/" />} />
          <Route
            path="/"
            element={
              <ProtectedRoute user={session?.user} role={userProfile?.role} pending={session && profileLoading && !userProfile}>
                <Layout userProfile={userProfile} />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="inventaire" element={<Inventaire />} />
            <Route path="pdv" element={<VuePDV />} />
            <Route path="reparations" element={<VueReparations />} />
            <Route path="reparations/nouveau" element={<CreerFiche />} />
            <Route path="reparations/:id" element={<DetailFiche />} />
            <Route path="creer-fiche" element={<CreerFiche />} />
            <Route path="fiche/:id" element={<DetailFiche />} />
            <Route path="clients" element={<Clients />} />
            <Route path="clients/:id" element={<ClientDetail />} />
            <Route path="client/:id" element={<ClientDetail />} />
            <Route path="depenses" element={<GestionDepenses />} />
            <Route path="caisse" element={<GestionEncaisse />} />
            <Route path="caisse-amelioree" element={<EnhancedGestionEncaisse />} />
            <Route path="cloture-caisse" element={<ClotureCaisse />} />
            <Route path="historique-caisse" element={<HistoriqueEncaisse />} />
            <Route path="transferts" element={<Transferts />} />
            <Route path="transfert-intelligent" element={<SmartTransferSystem />} />
            <Route path="cash-management" element={<CashManagementSystem />} />
            <Route path="carte-postale" element={<CartePostaleManager />} />
            <Route path="user-status" element={<StatutUtilisateurActuel />} />
            <Route
              path="admin"
              element={
                <ProtectedRoute user={session?.user} role={userProfile?.role} allowedRoles={['admin']} pending={session && profileLoading && !userProfile}>
                  <AdminSecurite />
                </ProtectedRoute>
              }
            />
            <Route path="admin/securite" element={<Navigate to="/admin" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Router>
    </>
  );
}

export default App;