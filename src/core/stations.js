// The map. Every station is a real place in the valley, a real building on
// the dashboard, and a real queue in the database. Tile coordinates are on a
// 64 x 40 grid; the renderer scales them to the canvas.
export const STATIONS = [
  {
    id: 'office',
    name: 'Office',
    building: 'manor',
    tile: { x: 28, y: 8 },
    door: { x: 30, y: 13 },
    blurb: 'Where the Manager decides what the valley works on next.',
    counter: 'jobsQueued',
    counterLabel: (n) => (n ? `${n} in flight` : 'link up'),
  },
  {
    id: 'research-bench',
    name: 'Research Bench',
    building: 'cabin',
    tile: { x: 7, y: 8 },
    door: { x: 9, y: 12 },
    blurb: 'Fresh product ideas land here waiting for your yes or no.',
    counter: 'ideasProposed',
    counterLabel: (n) => (n ? `${n} rankable` : 'nothing new'),
  },
  {
    id: 'workshop',
    name: 'Workshop',
    building: 'workshop',
    tile: { x: 6, y: 17 },
    door: { x: 8, y: 21 },
    blurb: 'The Maker builds the actual printable files in here.',
    counter: 'productsInDesign',
    counterLabel: (n) => (n ? `${n} on the bench` : 'tools down'),
  },
  {
    id: 'library',
    name: 'Library',
    building: 'library',
    tile: { x: 44, y: 16 },
    door: { x: 46, y: 20 },
    blurb: 'Approved ideas and finished listing copy are shelved here.',
    counter: 'ideasShelved',
    counterLabel: (n) => (n ? `${n} shelved` : 'empty shelves'),
  },
  {
    id: 'calendar',
    name: 'Calendar',
    building: 'tower',
    tile: { x: 52, y: 7 },
    door: { x: 53, y: 11 },
    blurb: 'Seasonal pushes. Digital products sell on a calendar, not a whim.',
    counter: 'campaign',
    counterLabel: (v) => v || 'no season set',
  },
  {
    id: 'ledger',
    name: 'Ledger',
    building: 'hut',
    tile: { x: 58, y: 17 },
    door: { x: 59, y: 20 },
    blurb: 'Sales and what each listing has actually earned.',
    counter: 'salesTotal',
    counterLabel: (v) => v || 'no data',
  },
  {
    id: 'review-hall',
    name: 'Review Hall',
    building: 'hall',
    tile: { x: 9, y: 27 },
    door: { x: 12, y: 31 },
    blurb: 'Nothing leaves the valley until the Inspector signs it off.',
    counter: 'productsInReview',
    counterLabel: (n) => (n ? `${n} to check` : 'nothing waiting'),
  },
  {
    id: 'shopfront',
    name: 'Shopfront',
    building: 'stalls',
    tile: { x: 26, y: 32 },
    door: { x: 30, y: 32 },
    blurb: 'Listings that are live, or packed and ready for you to upload.',
    counter: 'listingsLive',
    counterLabel: (n) => (n ? `${n} live` : 'shutters down'),
  },
  {
    id: 'lookout',
    name: 'Lookout',
    building: 'tower',
    tile: { x: 48, y: 27 },
    door: { x: 49, y: 30 },
    blurb: 'The Researcher watches what buyers are searching for.',
    counter: 'lookout',
    counterLabel: (v) => v || 'scanning',
  },
];

export const STATION_IDS = STATIONS.map((s) => s.id);

export const stationById = (id) => STATIONS.find((s) => s.id === id) || STATIONS[0];

/** Fountain in the middle of the crossroads; agents idle around it. */
export const PLAZA = { x: 31, y: 22 };

/** Water. Purely decorative, but every valley needs a pond. */
export const POND = { x: 44, y: 33, w: 15, h: 7 };

/** Dirt paths, as polylines of tile coordinates. */
export const PATHS = [
  [
    { x: 9, y: 12 },
    { x: 9, y: 21 },
    { x: 12, y: 21 },
  ],
  [
    { x: 8, y: 21 },
    { x: 31, y: 21 },
  ],
  [
    { x: 31, y: 13 },
    { x: 31, y: 32 },
  ],
  [
    { x: 12, y: 31 },
    { x: 49, y: 31 },
  ],
  [
    { x: 46, y: 20 },
    { x: 46, y: 31 },
  ],
  [
    { x: 31, y: 21 },
    { x: 59, y: 21 },
  ],
  [
    { x: 53, y: 11 },
    { x: 53, y: 21 },
  ],
  [
    { x: 49, y: 30 },
    { x: 49, y: 31 },
  ],
];

export default STATIONS;
