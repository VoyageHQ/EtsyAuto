// The maps. Every station is a real place, a real building on the dashboard,
// and a real queue in the database. Tile coordinates are on a 64 x 40 grid;
// the renderer scales them to the canvas.
//
// Two worlds: the valley is the Etsy shop, the harbour is the venture arm.
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
    id: 'packhouse',
    name: 'Packhouse',
    building: 'barn',
    tile: { x: 16, y: 8 },
    door: { x: 19, y: 13 },
    blurb: 'The Curator packs finished products into bundles and spin-offs.',
    counter: 'bundles',
    counterLabel: (n) => (n ? `${n} packing` : 'crates empty'),
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
  {
    id: 'signpost',
    name: 'Signpost',
    building: 'hut',
    tile: { x: 36, y: 15 },
    door: { x: 38, y: 20 },
    blurb: 'The Signwriter checks how findable every listing is, and the shop as a whole.',
    counter: 'seoIssues',
    counterLabel: (n) => (n ? `${n} to fix` : 'all findable'),
  },
];

/** The harbour: where startup ideas get found, built and marketed. */
export const HARBOUR_STATIONS = [
  {
    id: 'lighthouse',
    name: 'Lighthouse',
    building: 'lighthouse',
    tile: { x: 51, y: 6 },
    door: { x: 52, y: 13 },
    blurb: 'The Prospector watches real discussions for problems worth solving.',
    counter: 'signals',
    counterLabel: (n) => (n ? `${n} signals` : 'scanning'),
  },
  {
    id: 'harbour-office',
    name: 'Harbour Office',
    building: 'office-block',
    tile: { x: 27, y: 7 },
    door: { x: 30, y: 13 },
    blurb: 'The Harbourmaster decides which venture the yard works on next.',
    counter: 'venturesActive',
    counterLabel: (n) => (n ? `${n} in hand` : 'quiet'),
  },
  {
    id: 'counting-house',
    name: 'Counting House',
    building: 'counting-house',
    tile: { x: 7, y: 8 },
    door: { x: 9, y: 13 },
    blurb: 'The Analyst decides whether an idea can actually make money.',
    counter: 'venturesUnderReview',
    counterLabel: (n) => (n ? `${n} on the books` : 'ledgers closed'),
  },
  {
    id: 'drawing-office',
    name: 'Drawing Office',
    building: 'drawing-office',
    tile: { x: 8, y: 19 },
    door: { x: 10, y: 23 },
    blurb: 'The Architect cuts an idea down to something buildable in a fortnight.',
    counter: 'venturesPlanning',
    counterLabel: (n) => (n ? `${n} on the board` : 'drawings filed'),
  },
  {
    id: 'boatyard',
    name: 'Boatyard',
    building: 'boatyard',
    tile: { x: 24, y: 20 },
    door: { x: 27, y: 25 },
    blurb: 'The Builder scaffolds the MVP: landing page, API, pricing, deploy notes.',
    counter: 'venturesBuilding',
    counterLabel: (n) => (n ? `${n} in the slipway` : 'yard empty'),
  },
  {
    id: 'billboard',
    name: 'Billboard',
    building: 'billboard',
    tile: { x: 44, y: 20 },
    door: { x: 46, y: 24 },
    blurb: 'The Marketer plans the launch, the channels and the ad copy.',
    counter: 'campaignsLive',
    counterLabel: (n) => (n ? `${n} campaigns` : 'no campaigns'),
  },
  {
    id: 'warehouse',
    name: 'Warehouse',
    building: 'warehouse',
    tile: { x: 14, y: 30 },
    door: { x: 17, y: 34 },
    blurb: 'Ventures that are live, and what each one has actually earned.',
    counter: 'venturesLive',
    counterLabel: (n) => (n ? `${n} live` : 'shutters down'),
  },
];

/** The harbour has water along the bottom right, and a quay. */
export const HARBOUR_PLAZA = { x: 31, y: 22 };

export const HARBOUR_POND = { x: 30, y: 31, w: 34, h: 9 };

export const HARBOUR_PATHS = [
  [
    { x: 30, y: 13 },
    { x: 30, y: 29 },
  ],
  [
    { x: 9, y: 13 },
    { x: 9, y: 23 },
    { x: 10, y: 23 },
  ],
  [
    { x: 9, y: 23 },
    { x: 52, y: 23 },
  ],
  [
    { x: 52, y: 13 },
    { x: 52, y: 23 },
  ],
  [
    { x: 46, y: 24 },
    { x: 46, y: 29 },
  ],
  [
    { x: 17, y: 29 },
    { x: 52, y: 29 },
  ],
  [
    { x: 17, y: 29 },
    { x: 17, y: 34 },
  ],
  [
    { x: 27, y: 25 },
    { x: 27, y: 29 },
  ],
];

const ALL_STATIONS = [...STATIONS, ...HARBOUR_STATIONS];

export const STATION_IDS = ALL_STATIONS.map((s) => s.id);

export const stationById = (id) => ALL_STATIONS.find((s) => s.id === id) || STATIONS[0];

export const worldFor = (stationId) =>
  HARBOUR_STATIONS.some((s) => s.id === stationId) ? 'harbour' : 'valley';

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
  [
    { x: 19, y: 13 },
    { x: 19, y: 21 },
  ],
];

/** Both maps, keyed the way the dashboard asks for them. */
export const WORLDS = {
  valley: {
    id: 'valley',
    stations: STATIONS,
    plaza: PLAZA,
    pond: POND,
    paths: PATHS,
    palette: 'green',
  },
  harbour: {
    id: 'harbour',
    stations: HARBOUR_STATIONS,
    plaza: HARBOUR_PLAZA,
    pond: HARBOUR_POND,
    paths: HARBOUR_PATHS,
    palette: 'coast',
  },
};

export default STATIONS;
