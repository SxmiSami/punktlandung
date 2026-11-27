/* Verbindung zum Online-Speicher (Supabase).
   Beides findest du in Supabase unter: Project Settings → API.
   Der "anon public"-Schlüssel ist absichtlich öffentlich – deine Daten schützt
   die Datenbank-Regel (Row Level Security), sodass jeder nur seine eigenen Noten sieht. */
window.PL_CONFIG = {
  supabaseUrl: 'https://quurwakilvvunjhcbmzz.supabase.co',
  supabaseAnonKey: 'sb_publishable_jvnIIUVtss5IG27f01JB4Q_5DX3o3SK', // Publishable key (öffentlich)

  // Lernzettel-Speicher (kostenloser Supabase-Plan: 1 GB für alle zusammen).
  // Bei Änderungen auch die 250 MB in supabase/lernzettel.sql anpassen.
  // GIFs im Chat: kostenloser Schlüssel von https://developers.giphy.com (siehe SYNC-EINRICHTEN.md, GIFs).
  // Leer lassen = GIF-Suche aus (GIF-Links von GIPHY/Tenor werden trotzdem als Bild gezeigt).
  giphyKey: '',

  notes: { bucket: 'lernzettel', quotaMB: 250, totalMB: 1024, maxFileMB: 25 },
};
