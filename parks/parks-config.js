/* Wandering the Local Parks — wording and chips. Edit freely; nothing here is secret.
   Chips, prompts and every visitor-facing line live in this one file. */
window.PARKS_CONFIG = {
  radii: [15, 25, 40, 75],          // distance chips (miles from Hackettstown, straight line)
  defaultRadius: 25,
  pageSize: 10,                      // cards shown before "Show more places"
  wideRadius: 40,                    // the empty-state button

  // Filter groups behind the "Filters" button. "value" must match the database fields; labels are free text.
  filters: [
    { key: "state",   label: "State",     options: [ { value: "NJ", label: "New Jersey" }, { value: "NY", label: "New York" }, { value: "PA", label: "Pennsylvania" } ] },
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

  // Map for "My trip" (loaded only when the pop-up opens). Free OpenStreetMap tiles; keep the attribution.
  tripMap: {
    leafletCss: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
    leafletCssSri: "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=",
    leafletJs: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
    leafletJsSri: "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=",
    tiles: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
  },

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
    footer: "Built by hand, one park at a time. If something's wrong, tell us and we'll fix it.",

    // Card extras
    closedBadge: "Closed",
    closedNoBooking: "Not taking bookings right now",
    unconfirmed: "Some details here aren't confirmed yet. Check the official page before you go.",
    seePhotos: "See photos",
    directions: "Get directions",
    eventLinkHint: "Opens our workshops page",
    tripAdd: "Add to my trip",
    tripAdded: "In my trip",

    // Plan my park trip (saved only in this browser; nothing is sent to us)
    tripButton: "My trip ({n})",
    tripTitle: "My park trip",
    tripLead: "Here are the parks you picked. This list lives only on this device, so nothing is sent to us. Print it, save it, or send it to yourself.",
    tripEmpty: "Nothing here yet. Tap \"Add to my trip\" on a park or two.",
    tripMapNote: "Map: pins show roughly where each park is.",
    tripRemove: "Remove",
    tripPrint: "Print or save as PDF",
    tripShare: "Share",
    tripText: "Text it to myself",
    tripEmail: "Email it to myself",
    tripClear: "Clear my trip",
    tripClearAsk: "Clear every park from your trip?",
    tripShareTitle: "My park trip",
    tripShareHeader: "My park trip, from Wandering the Local Parks",
    tripShareFooter: "Hours, fees and openings change. Check each official page before you go.",
    tripEmailSubject: "My park trip",
    tripDirections: "Directions",
    tripPrintNote: "Put together with Wandering the Local Parks. Hours, fees and openings change, so check each official page before you go."
  }
};
