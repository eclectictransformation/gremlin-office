/* Wandering the Local Parks — wording and chips. Edit freely; nothing here is secret.
   Chips, prompts and every visitor-facing line live in this one file. */
window.PARKS_CONFIG = {
  radii: [15, 25, 40, 75],          // distance chips (miles from Hackettstown, straight line)
  defaultRadius: 25,
  pageSize: 10,                      // cards shown before "Show more places"
  wideRadius: 40,                    // the empty-state button

  // Filter groups behind the "Filters" button. "value" must match the database fields; labels are free text.
  filters: [
    { key: "state",   label: "State",     options: [ { value: "NJ", label: "New Jersey" }, { value: "PA", label: "Pennsylvania" } ] },
    { key: "stay",    label: "Stay type", options: [ { value: "tent", label: "Tent" }, { value: "rv", label: "RV" }, { value: "cabin", label: "Cabin" }, { value: "group", label: "Group site" } ] },
    { key: "winter",  label: "Winter",    options: [ { value: "yes", label: "Open in winter" } ] },
    { key: "pets",    label: "Pets",      options: [ { value: "yes", label: "Pets allowed" } ] },
    { key: "electric",label: "Electric",  options: [ { value: "yes", label: "Electric" } ] }
  ],

  // Card icons (at most 3 show, only the ones that apply)
  icons: {
    pets: "Pets allowed",
    petsSome: "Pets allowed at some sites",
    electric: "Electric hookups or power",
    winter: "Open in winter"
  },

  stayLabels: { tent: "Tent", rv: "RV", cabin: "Cabin or shelter", group: "Group site" },

  // Visitor review prompts. "key" must stay fav_saw / wildlife / why_go (database columns); "label" can change.
  reviewPrompts: [
    { key: "fav_saw",  label: "What was your favorite thing you saw?" },
    { key: "wildlife", label: "Did you spot any birds or wildlife?" },
    { key: "why_go",   label: "Why would you tell a friend to go?" }
  ],

  seasons: [ { value: "spring", label: "Spring" }, { value: "summer", label: "Summer" }, { value: "fall", label: "Fall" }, { value: "winter", label: "Winter" } ],

  text: {
    kicker: "Eclectic Transformation · Out and about",
    title: "Wandering the Local Parks",
    intro: "A local list we're putting together ourselves from official park pages, so it's easier to see where you can stay and where to book. Distances are straight-line miles from Hackettstown, NJ.",
    note: "Hours, fees and openings change. Check the official page before you go.",
    tabCamp: "Places to camp",
    tabSee: "Places to see",
    seeSoon: "Coming soon. We're still walking these.",
    searchPlaceholder: "Search by name or town",
    filtersButton: "Filters",
    filtersDone: "Done",
    clearFilters: "Clear filters",
    results: "{n} {places} within {r} miles, closest first",
    resultsOne: "place",
    resultsMany: "places",
    empty: "Nothing here yet. Try a wider distance.",
    emptyButton: "Show {r} mi",
    showMore: "Show more places",
    book: "Book (opens their site)",
    official: "Official page",
    lastChecked: "Last checked {d}",
    suggest: "Suggest a correction",
    about: "About this place",
    parkLevel: "The booking link opens the park's main booking page. Pick this area there.",
    noticed: "What visitors noticed",
    noticedNone: "Nobody has shared a note here yet.",
    readMore: "Read more",
    visitor: "A visitor",
    shareOpen: "Share a little about your visit",
    loadError: "The park list didn't load. Check your signal and try again.",

    corrTitle: "Suggest a correction",
    corrLead: "Thank you. We're putting this together ourselves and did our best, so a fix really helps.",
    corrWhat: "What should we fix?",
    corrWhere: "Where did you see the right info? (optional)",
    corrSend: "Send",
    corrThanks: "Thanks, we'll check it.",

    revTitle: "Share a little about your visit (optional)",
    revHelp: "Answer one, or all three. A sentence is plenty.",
    revSeason: "When did you go? (optional)",
    revPhoto: "Add a photo (optional). Bryan looks at photos before they're shared.",
    revSend: "Share my visit",
    revThanks: "Thank you. Your note will show up once it's been looked over.",
    revNeedOne: "Please answer at least one question.",
    revPhotoFail: "Your note was sent, but the photo didn't go through. You're welcome to try once more.",
    close: "Close",
    sendFail: "Sorry, that didn't go through. Please try again in a little bit.",
    backLink: "Back to the Desks",
    footer: "Built by hand, one park at a time. If something's wrong, tell us and we'll fix it."
  }
};
