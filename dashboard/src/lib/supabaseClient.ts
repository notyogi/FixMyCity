import { createClient } from '@supabase/supabase-js';

/**
 * SECURITY NOTICE:
 * In browser-side web applications, use ONLY the Supabase Anonymous Key (VITE_SUPABASE_ANON_KEY).
 * NEVER expose or import the Supabase Service Role Key here, as it would grant full root database
 * access directly from the user's browser, bypassing Row Level Security (RLS).
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[SupabaseClient] Warning: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing from environment.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

