import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env";

// Server-side Supabase client built with the service-role key.
// Used to validate incoming user JWTs (never exposed to the frontend).
export const supabaseAdmin = createClient(
  env.supabaseUrl,
  env.supabaseServiceRoleKey,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
