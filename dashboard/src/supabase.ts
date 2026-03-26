import { createClient } from '@supabase/supabase-js';

// TODO: Replace with your Supabase project values
const SUPABASE_URL = 'https://vlaxnupgdviexicirfcq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_62WFR5KXOQcK0Hu_BslujQ_Cs2X3iN9';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
