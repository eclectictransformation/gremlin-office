/* Things to Do — wording and labels. Edit freely; nothing here is secret. */
window.THINGS_CONFIG = {
  /* "mock": form works in this preview and keeps the note on this device only.
     Switch to "live" after sql/028_things_to_do.sql has been applied and Bryan says yes. */
  correctionsMode: "mock",
  dataUrl: "data.json",

  typeLabels: {
    karaoke: "Karaoke",
    trivia: "Trivia",
    "open-mic": "Open mic",
    "live-music": "Live music",
    "game-night": "Game night",
    "community-event": "Community event"
  },
  dayOrder: ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"],
  dayLabels: {
    sunday: "Sunday", monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
    thursday: "Thursday", friday: "Friday", saturday: "Saturday"
  },
  ageLabels: { "all-ages": "All ages", "18+": "18+", "21+": "21+" },
  costLabels: { free: "Free", paid: "Paid", unknown: "Not listed" },

  text: {
    kicker: "Eclectic Transformation · Out and about",
    title: "Things to Do",
    intro: "A local list of karaoke nights, trivia, open mics, live music and town events, put together by us from the venues' own pages. Times and details change, so please confirm with the venue before you go.",
    note: "This is a first pass around Hackettstown, Blairstown and nearby towns.",
    searchPlaceholder: "Search by event, venue or town",
    filtersButton: "Filters",
    filtersDone: "Done",
    clearFilters: "Clear filters",
    results: "{n} {things}",
    resultsOne: "thing to do",
    resultsMany: "things to do",
    empty: "Nothing matches those filters. Clear them or try another search.",
    tell: "Tell us about an event or a correction",
    venueLink: "Venue page",
    sourceLink: "Source page",
    directions: "Get directions",
    lastChecked: "Last checked {d}",
    confirm: "Please confirm with the venue before you go.",
    substanceFree: "Substance-free",
    notConfirmed: "Not confirmed yet",
    unverified: "Unverified: found on a secondhand listing.",
    suggest: "Suggest a correction",
    loadError: "The list didn't load. Check your signal and try again.",
    backLink: "Back to the Desks",
    footer: "Built by hand, one listing at a time. If something's off, or you know a night we should add, tell us.",

    filterTown: "Town",
    filterDay: "Day of the week",
    filterType: "Type",
    filterSubstance: "Substance-free",
    filterAge: "Ages",
    filterCost: "Cost",
    substanceYes: "Substance-free",

    corrTitle: "Tell us about an event or a correction",
    corrLead: "Thank you. We're putting this together ourselves, so a tip or a fix really helps. You don't need to leave a name.",
    corrStage: "This preview keeps your note on this device only. When the page is live, notes will be held for review.",
    corrWhat: "What should we add or fix?",
    corrWhere: "Where did you see it? (optional)",
    corrSend: "Send",
    corrThanks: "Thanks, we'll check it.",
    corrThanksMock: "Thanks, we'll check it. In this preview the note stays on this device only.",
    close: "Close",
    sendFail: "Sorry, that didn't go through. Please try again in a little bit.",
    rateLimit: "Too many notes right now. Please try again a little later."
  }
};
