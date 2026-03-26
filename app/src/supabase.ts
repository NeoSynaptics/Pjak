import { createClient } from '@supabase/supabase-js';

// TODO: Replace with your Supabase project values
const SUPABASE_URL = 'https://vlaxnupgdviexicirfcq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_62WFR5KXOQcK0Hu_BslujQ_Cs2X3iN9';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// How close (meters) the player must be to collect an egg
export const PROXIMITY_RADIUS_M = 15;
