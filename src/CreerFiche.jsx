// src/CreerFiche.jsx - Component for creating new repair tickets with client and device information

// Import React hook for managing component state
import { useState } from 'react';
// Import Supabase client for database operations
import { supabase } from './supabaseClient';
// Import React Router hook for programmatic navigation
import { useNavigate } from 'react-router-dom';
// Import toast notifications for user feedback
import { toast } from 'react-toastify';
// Import Material-UI components
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Stack,
  Divider
} from '@mui/material';
import { Save as SaveIcon, ArrowBack as ArrowBackIcon, Close as CloseIcon } from '@mui/icons-material';

function CreerFiche() {
  // State to store the client's name input
  const [nomClient, setNomClient] = useState('');
  // State to store the client's phone number input
  const [telClient, setTelClient] = useState('');
  // State to store the device description input
  const [appareil, setAppareil] = useState('');
  // State to store the problem description input
  const [probleme, setProbleme] = useState('');
  // Hook for programmatic navigation between routes
  const navigate = useNavigate();

  // Async function to handle form submission
  const handleSubmit = async (e) => {
    // Prevent default form submission behavior (page reload)
    e.preventDefault();
    try { 
      const { data: { user } } = await supabase.auth.getUser();
      // Étape 1 : Créer le client dans la base de données
      // Step 1: Create the client in the database first
      
      const { data: clientData, error: clientError } = await supabase
        .from('clients') // Target the 'clients' table
        .insert({ nom: nomClient, telephone: telClient }) // Insert new client with name and phone
        .select() // Important: return the inserted data to get the generated ID
        .single(); // Expect only one result (the newly created client)

      // If client creation failed, throw error to be caught by catch block
      if (clientError) throw clientError;

      // Étape 2 : Utiliser l'ID du client pour créer la fiche de réparation
      // Step 2: Use the client's ID to create the repair ticket
      const { error: ficheError } = await supabase
        .from('fiches_reparation') // Target the 'fiches_reparation' table
        .insert({
          client_id: clientData.id, // Foreign key linking to the newly created client
          appareil_description: appareil, // Device description from form input
          probleme_signale: probleme, // Problem description from form input
          statut: 'Reçu', // Set initial status to 'Reçu' (Received)
          user_id: user.id 
        });
      
      // If repair ticket creation failed, throw error to be caught by catch block
      if (ficheError) throw ficheError;

      // Show success message to user
      toast.success('Nouvelle fiche de réparation créée avec succès !');
      // Redirect user to the repairs list page
      navigate('/reparations'); // Rediriger vers la liste des réparations

    } catch (error) {
      // Handle any errors from client or repair ticket creation
      toast.error("Erreur lors de la création de la fiche : " + error.message);
    }
  };

  // Render the form for creating a new repair ticket
  return (
    <Box sx={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header */}
      <Box sx={{ flexShrink: 0 }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Button 
            variant="outlined" 
            startIcon={<ArrowBackIcon />} 
            onClick={() => navigate('/reparations')}
            size="small"
          >
            Retour
          </Button>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Créer une Nouvelle Fiche de Réparation
          </Typography>
        </Stack>
      </Box>

      {/* Form Card */}
      <Card sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Box component="form" onSubmit={handleSubmit} sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Client Information Section */}
            <Box>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                Informations Client
              </Typography>
              <Stack spacing={2}>
                <TextField 
                  label="Nom du client"
                  value={nomClient} 
                  onChange={e => setNomClient(e.target.value)} 
                  required
                  fullWidth
                  variant="outlined"
                />
                <TextField 
                  label="Téléphone"
                  type="tel"
                  value={telClient} 
                  onChange={e => setTelClient(e.target.value)} 
                  fullWidth
                  variant="outlined"
                />
              </Stack>
            </Box>

            <Divider />

            {/* Device Information Section */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                Informations Appareil
              </Typography>
              <Stack spacing={2} sx={{ flex: 1 }}>
                <TextField 
                  label="Description de l'appareil"
                  value={appareil} 
                  onChange={e => setAppareil(e.target.value)} 
                  placeholder="ex: PC HP Pavilion G7, iPhone 12, Samsung Galaxy S21..."
                  required
                  fullWidth
                  variant="outlined"
                />
                <TextField 
                  label="Problème signalé par le client"
                  value={probleme} 
                  onChange={e => setProbleme(e.target.value)} 
                  placeholder="Décrivez le problème en détail..."
                  required
                  fullWidth
                  multiline
                  rows={6}
                  variant="outlined"
                  sx={{ flex: 1 }}
                />
              </Stack>
            </Box>

            {/* Action Buttons */}
            <Box sx={{ flexShrink: 0, pt: 2 }}>
              <Stack direction="row" spacing={1.5} justifyContent="flex-end">
                <Button 
                  variant="text" 
                  onClick={() => navigate('/reparations')}
                  size="small"
                  color="inherit"
                  startIcon={<CloseIcon />}
                >
                  Annuler
                </Button>
                <Button 
                  type="submit" 
                  variant="contained" 
                  startIcon={<SaveIcon />}
                  size="small"
                  disableElevation
                >
                  Enregistrer la Fiche
                </Button>
              </Stack>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

// Export component for use in other files
export default CreerFiche;