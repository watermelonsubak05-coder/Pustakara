import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ekazuvbfxuipaeqnlnov.supabase.co";
const supabaseKey = "sb_publishable_IHVSsMZvZXBO3-3kiwgbBQ_cYLKd5BG";

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
);