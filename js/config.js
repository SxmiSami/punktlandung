/* Verbindung zum Online-Speicher (Supabase).
   Beides findest du in Supabase unter: Project Settings → API.
   Der "anon public"-Schlüssel ist absichtlich öffentlich – deine Daten schützt
   die Datenbank-Regel (Row Level Security), sodass jeder nur seine eigenen Noten sieht. */
window.PL_CONFIG = {
  supabaseUrl: 'https://quurwakilvvunjhcbmzz.supabase.co',
  supabaseAnonKey: 'sb_publishable_jvnIIUVtss5IG27f01JB4Q_5DX3o3SK', // Publishable key (öffentlich)
};
