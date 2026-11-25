/* Verbindung zum Online-Speicher (Supabase).
   Beides findest du in Supabase unter: Project Settings → API.
   Der "anon public"-Schlüssel ist absichtlich öffentlich – deine Daten schützt
   die Datenbank-Regel (Row Level Security), sodass jeder nur seine eigenen Noten sieht. */
window.PL_CONFIG = {
  supabaseUrl: '',      // z. B. 'https://abcdefgh.supabase.co'
  supabaseAnonKey: '',  // langer Schlüssel, beginnt mit 'eyJ...'
};
