import { createClient } from "@supabase/supabase-js";

const createServerClient = (key: string) =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

export const createSupabaseServiceClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase service-role environment variables are missing.");
  }

  return createServerClient(serviceRoleKey);
};

export const createSupabasePublicServerClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase public environment variables are missing.");
  }

  return createServerClient(anonKey);
};

// Backward-compatible alias for existing write paths.
export const createSupabaseServerClient = createSupabaseServiceClient;
