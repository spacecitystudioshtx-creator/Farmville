// Site configuration for the prototype property.
// Geocode is approximate (street-level); good enough for weather + zone lookups.
window.SITE = {
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
};
