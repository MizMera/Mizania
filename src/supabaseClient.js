// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

// Cette ligne va lire les variables d'environnement
// En local, elle lira votre fichier .env
// Sur Vercel, elle lira les variables que vous avez configurées dans leur interface
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Une sécurité pour s'assurer que les clés sont bien présentes
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Erreur: Les variables d'environnement Supabase (VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY) sont requises.");
}

// Client Supabase avec persistance de session et auto-refresh activés
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // storageKey optionnel si vous avez plusieurs projets/déploiements
    // storageKey: 'mizania-auth',
  },
});