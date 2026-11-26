// Desks hub access settings. One copy per deployment (exported client copies edit this file + their own database row).
window.DESKS_ACCESS = {
  // "mock" = local prototype, everything stays in this browser. "live" = real sign-in (only after Bryan approves go-live).
  MODE: "live",
  // Live mode reuses the Gremlin Office's existing project. Public anon key only; never a service key.
  SUPABASE_URL: "https://dotwzemmkrxswoeqcggj.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvdHd6ZW1ta3J4c3dvZXFjZ2dqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4Mjk1MzEsImV4cCI6MjEwOTQwNTUzMX0.4X-qz3sKSrgMSSCLuCdxIb91rz3PNGgZ4d-sFkVj3RQ", // public anon key (same as the Office). Never a service key.
  OFFICE_PATH: "desks-preview-q7m4/",
  // Shown to people so they know where a ticket lands. The real address lives server-side (app_config.visitor_ticket_inbox).
  TICKET_DEST_LABEL: "Bryan",
  GUEST: { samplesPerRoomPerVisit: 1, maxChars: 1200, deepAllowed: false },
  MAX_TICKET_CHARS: 2000,
  // Business Planning: levels, turn limits and the Wren time note live in the database (Access page -> Business Planning).
  // Everyone starts at the 5-step action plan intake (no greeting room, no first-screen fork).
  // Guests (no login) get the FREE action plan through the bp-guest function: 1 plan, 6 messages, no Wren (Bryan t731).
  // Guest caps (25 plans a day, 2 per network a day, 6 messages, on/off) live in the database: Access page -> Business Planning.
  // (The old optional check-in hook is replaced by step B of the intake, BP_STATE_QUESTIONS below.)
  // Cloudflare Turnstile for the guest intake. OFF while empty. To turn on: paste the public site key here AND add
  // CAPTCHA_SECRET as a Supabase function secret. Both are needed; the page then shows a small check on the last step.
  TURNSTILE_SITE_KEY: "",
  // PLACEHOLDER: public Remixer link shown next to "Copy the script". Left empty on purpose (no confirmed public URL yet).
  // Bryan: paste the real link here, e.g. REMIXER_URL: "https://...". While empty, no link is shown.
  REMIXER_URL: "",
  // PLACEHOLDER: Business action plan intake, step 2. A few short questions for each "Where's your business right now?" answer.
  // Saji writes these for Bryan's review. Format: { id: "short_key", q: "Question text?" }. Empty array = that step is skipped.
  // Saji's DRAFT questions are in STATE-QUESTIONS-DRAFT.md. They are NOT approved: leave these empty until Bryan says yes.
  BP_STATE_QUESTIONS: {
    beginning: [],      // Just beginning
    chaos: [],          // In chaos
    grounded: [],       // Grounded
    doing_well: [],     // Doing well
    something_new: [],  // Looking for something new
    other: []           // Other
  },
  AREAS: [
    { key: "gremlin_world", label: "Gremlin World", guest: true },
    { key: "recipe_shelf", label: "Recipe Shelf", guest: true },
    { key: "saji_room", label: "Quick sorter (full)" },
    { key: "send_tickets", label: "Send tickets" },
    { key: "office", label: "Gremlin Office", officeLogin: true },
    { key: "annex", label: "Gremlin game", officeLogin: true }
  ]
};
