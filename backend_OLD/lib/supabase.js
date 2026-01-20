// Supabase Client Configuration
// This module provides Supabase client for database and storage operations

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Use service role key for backend operations (bypasses RLS)
const supabaseKey = supabaseServiceKey || supabaseAnonKey;

if (!supabaseUrl || !supabaseKey) {
  console.warn('[SUPABASE] Supabase credentials not configured. Using file system fallback.');
  console.warn('[SUPABASE] Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
}

// Create Supabase client (null if credentials not provided)
const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

// Test connection
if (supabase) {
  console.log('[SUPABASE] Client initialized successfully');
  console.log('[SUPABASE] URL:', supabaseUrl);
} else {
  console.warn('[SUPABASE] Client not initialized. File system will be used.');
}

module.exports = { 
  supabase,
  isSupabaseEnabled: () => supabase !== null
};
