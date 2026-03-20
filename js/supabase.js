// js/supabase.js

// Replace these values with your actual Supabase URL and Anon Key
window.SUPABASE_URL = "https://wynmejzsybkxhqvazjzu.supabase.co";
window.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5bm1lanpzeWJreGhxdmF6anp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzU4MzAsImV4cCI6MjA4OTE1MTgzMH0.f9MFrnPZ4ODzJOz71zuWtuCThWO5UUyEv1FkWDEzRiU";

// Correctly initialize window.supabase so all scripts can access it
if (window.supabase && typeof window.supabase.createClient === 'function') {
  window.supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
} else if (typeof supabase !== 'undefined' && typeof supabase.createClient === 'function') {
  window.supabase = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
}

// Create a global alias so all scripts can use `supabase` directly (without `window.` prefix)
var supabase = window.supabase;
// GLOBAL SMS DISPATCHER (EDGE FUNCTION CALL)
window.sendSmsNotification = async function(phone, message) {
  try {
    if (!window.supabase) return;
    
    // Call our secure backend Edge Function
    const { data, error } = await window.supabase.functions.invoke('send-sms', {
      body: { to: phone, msg: message }
    });
    
    if (error) throw error;
    console.log("SMS Dispatch Triggered:", data);
  } catch (err) {
    console.error("SMS Dispatch Failed:", err.message);
  }
};
