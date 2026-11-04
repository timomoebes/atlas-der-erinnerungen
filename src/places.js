// Offline place list for the route picker (no geocoding service, so no place names leave the device).
export const PLACES = [
  ['Berlin', 52.52, 13.405], ['Hamburg', 53.551, 9.994], ['München', 48.137, 11.575], ['Köln', 50.938, 6.96],
  ['Frankfurt', 50.11, 8.682], ['Leipzig', 51.34, 12.375], ['Wien', 48.208, 16.373], ['Zürich', 47.377, 8.541],
  ['Paris', 48.857, 2.352], ['London', 51.507, -0.128], ['Amsterdam', 52.368, 4.904], ['Kopenhagen', 55.676, 12.568],
  ['Stockholm', 59.329, 18.069], ['Oslo', 59.914, 10.752], ['Warschau', 52.23, 21.012], ['Prag', 50.075, 14.438],
  ['Budapest', 47.498, 19.04], ['Rom', 41.903, 12.496], ['Mailand', 45.464, 9.19], ['Barcelona', 41.385, 2.173],
  ['Madrid', 40.417, -3.704], ['Lissabon', 38.722, -9.139], ['Palma de Mallorca', 39.57, 2.65], ['Teneriffa', 28.292, -16.629],
  ['Athen', 37.984, 23.728], ['Kreta (Heraklion)', 35.339, 25.134], ['Istanbul', 41.008, 28.978], ['Antalya', 36.897, 30.713],
  ['Paphos', 34.775, 32.425], ['Larnaka', 34.92, 33.624], ['Kairo', 30.044, 31.236], ['Dubai', 25.205, 55.27],
  ['Kapstadt', -33.925, 18.424], ['Mauritius', -20.348, 57.552], ['Malediven (Malé)', 4.175, 73.509], ['Bangkok', 13.756, 100.502],
  ['Bali (Denpasar)', -8.65, 115.217], ['Tokio', 35.676, 139.65], ['Sydney', -33.869, 151.209], ['Auckland', -36.848, 174.763],
  ['New York', 40.713, -74.006], ['Los Angeles', 34.052, -118.244], ['Miami', 25.762, -80.192], ['Rio de Janeiro', -22.907, -43.173]
].map(([name, lat, lon]) => ({ name, lat, lon }));

export const findPlace = name => PLACES.find(place => place.name === name);
