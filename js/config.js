// =============================================
// CONFIGURAZIONE SUPABASE
// =============================================
export const SUPABASE_URL = 'https://bocbgtkjwlkxeyainiku.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_EasJeYL89yOTHBO5s20A3w_OaZKeawF';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvY2JndGtqd2xreGV5YWluaWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2ODEzNzIsImV4cCI6MjA5NDI1NzM3Mn0.AXJWAd6kbbrDTHcmspYjmqq8co7STx_Knx5cPjZrqio';
// =============================================
// COSTANTI TORNEI
// =============================================
export const TORNEO_CONFIG = {
  amichevole: {
    moltiplicatore: 1,
    punti: { 1: 50, 2: 25, 3: 10, 4: 10 }
  },
  importante: {
    moltiplicatore: 1.5,
    punti: { 1: 120, 2: 70, 3: 30, 4: 10 }
  },
  stagionale: {
    moltiplicatore: 2,
    punti: { 1: 200, 2: 120, 3: 60, 4: 30 }
  }
};

// =============================================
// COLORI AVATAR
// =============================================
export const AVATAR_COLORS = [
  ['#ff3366','#ff6699'], ['#3366ff','#6699ff'], ['#ff9900','#ffcc00'],
  ['#00cc88','#00ffaa'], ['#cc33ff','#ee66ff'], ['#ff6600','#ff9944'],
  ['#00ccff','#66eeff'], ['#ff3399','#ff77bb']
];
