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
  // Guests and anyone not approved see the example run in business-planning/example.json.
  // OPTIONAL "getting started" check-in, shown in a closed fold BELOW the main box before someone's first post (never blocks Send). OFF until Bryan and Saji write the questions.
  // To turn it on: enabled: true, and list a few short questions, e.g. { id: "stage", q: "Where are you with this today?" }.
  // Answers are optional and are added to the top of the first message to Saji. Keep it to 3 questions or fewer.
  BP_CHECKIN: { enabled: false, title: "A few optional questions, if they help.", questions: [] },
  // PLACEHOLDER: public Remixer link shown next to "Copy the script". Left empty on purpose (no confirmed public URL yet).
  // Bryan: paste the real link here, e.g. REMIXER_URL: "https://...". While empty, no link is shown.
  REMIXER_URL: "",
  // PLACEHOLDER: Business action plan intake, step 2. A few short questions for each "Where's your business right now?" answer.
  // Saji writes these for Bryan's review. Format: { id: "short_key", q: "Question text?" }. Empty array = that step is skipped.
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
