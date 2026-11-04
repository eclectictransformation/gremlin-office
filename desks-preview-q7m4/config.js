// ===== Change the app name / backend here, nowhere else. =====
window.DESKS_CONFIG = {
  APP_NAME: "The Gremlin Office Desks",
  SHORT_NAME: "Desks",
  LOGIN_DOMAIN: "@eclectictransformation.com",
  SUPABASE_URL: "https://dotwzemmkrxswoeqcggj.supabase.co",
  // Public anon key (safe for browsers; Row Level Security protects the data). NEVER put a service_role key here.
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvdHd6ZW1ta3J4c3dvZXFjZ2dqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4Mjk1MzEsImV4cCI6MjEwOTQwNTUzMX0.4X-qz3sKSrgMSSCLuCdxIb91rz3PNGgZ4d-sFkVj3RQ",
  // CAPTCHA hook (Cloudflare Turnstile). TODO(Bryan): paste the site key here and set CAPTCHA_SECRET as a Supabase function secret. Off while null.
  CAPTCHA_SITE_KEY: null,
  PHOTO_URL_SECONDS: 300, // signed photo links expire after 5 minutes
  MAX_TICKET_CHARS: 2000,
};
