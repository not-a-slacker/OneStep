import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// This module is evaluated during `next build` while client components are
// prerendered, so the variables must be present at build time as well as at
// runtime. The previous non-null assertions turned a missing variable into
// supabase-js's opaque "supabaseUrl is required." (ROADMAP B-15).
if (!supabaseUrl || !supabaseKey) {
  const missing = [
    !supabaseUrl && 'NEXT_PUBLIC_SUPABASE_URL',
    !supabaseKey && 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ].filter(Boolean).join(' and ')

  throw new Error(
    `Supabase is not configured: ${missing} is missing. `
    + 'Copy web/.env.example to web/.env.local and fill both values. '
    + 'CI and Vercel need them set as environment variables too. '
    + 'Never use a service_role or secret key in a NEXT_PUBLIC_ variable.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey)
