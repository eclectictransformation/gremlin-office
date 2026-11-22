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
  AREAS: [
    { key: "gremlin_world", label: "Gremlin World", guest: true },
    { key: "recipe_shelf", label: "Recipe Shelf", guest: true },
    { key: "wren_room", label: "Wren's Room (full)" },
    { key: "saji_room", label: "Saji Tori (full)" },
    { key: "send_tickets", label: "Send tickets" },
    { key: "office", label: "Gremlin Office", officeLogin: true },
    { key: "annex", label: "Gremlin game", officeLogin: true }
  ]
};
