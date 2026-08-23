// Site configuration for the prototype property.
// Geocode is approximate (street-level); good enough for weather + zone lookups.
window.SITE = {
  brand: 'GardenStar',
  tagline: 'The farm game that grows your real garden',
  address: '11102 Cliffwood Dr, Houston, TX 77035',
  lat: 29.6524,
  lon: -95.4479,
  timezone: 'America/Chicago',
  usdaZone: '9b',            // 2023 USDA hardiness map
  ecoregion: 'Gulf Coast Prairies & Marshes',
  soil: 'Gulf Coast clay (amend beds with compost; drainage matters more than fertility)',

  // Yard grid: 1 tile = 3 ft
  gridW: 40,
  gridH: 26,
  tileFeet: 3,

  storageKey: 'cliffwood-farm-v1',

  // ---- Monetization ----------------------------------------------------
  // Everything below is OFF until you paste your own IDs. Signup order that
  // pays fastest: supportUrl (instant) → amazonTag (days) → adsenseClient
  // (needs a custom domain + approval). See README "Getting paid".
  monetization: {
    // Google AdSense: 'ca-pub-XXXXXXXXXXXXXXXX' once approved. Empty = ads off,
    // slots show a quiet placeholder.
    adsenseClient: '',
    adSlotSide: '',     // AdSense slot id for the sidebar unit
    adSlotBottom: '',   // AdSense slot id for the under-map unit

    // Amazon Associates tracking tag, e.g. 'cliffwoodfarm-20'.
    // Adds "Buy seeds/plants" buttons to every plant card.
    amazonTag: '',

    // Instant tip jar: Buy Me a Coffee / Ko-fi / Stripe Payment Link.
    // e.g. 'https://buymeacoffee.com/yourname'
    supportUrl: '',
  },
};
