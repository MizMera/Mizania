// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

// Lire et déquoter les variables d'environnement (en local .env ou Vercel)
const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const rawAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
// enlever les guillemets si présents
const supabaseUrl = rawSupabaseUrl?.replace(/^"(.*)"$/, '$1') || rawSupabaseUrl;
const supabaseAnonKey = rawAnonKey?.replace(/^"(.*)"$/, '$1') || rawAnonKey;

// Une sécurité pour s'assurer que les clés sont bien présentes
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Erreur: Les variables d'environnement Supabase (VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY) sont requises.");
}

// Client Supabase avec persistance de session et auto-refresh activés
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: supabaseAnonKey ? `Bearer ${supabaseAnonKey}` : undefined,
    },
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // storageKey optionnel si vous avez plusieurs projets/déploiements
    // storageKey: 'mizania-auth',
  },
});