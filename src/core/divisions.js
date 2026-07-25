// Two businesses, one dashboard.
//
//   valley  — the Etsy shop: digital downloads, designed and listed.
//   harbour — the venture arm: startup ideas found in real discussions,
//             validated for money, built as an MVP, and marketed.
//
// They share the runtime — the queue, the approvals, the event bus, Discord —
// and nothing else. No venture agent reads the shop's tables and no shop agent
// reads the ventures'. Keeping the data apart is what stops one business's
// results quietly steering the other's decisions.
export const DIVISIONS = [
  {
    id: 'etsy',
    name: 'Hartistic Valley',
    short: 'Valley',
    world: 'valley',
    blurb: 'Digital downloads: invented, designed, listed.',
  },
  {
    id: 'ventures',
    name: 'The Harbour',
    short: 'Harbour',
    world: 'harbour',
    blurb: 'Startup ideas found in the wild, built and marketed.',
  },
];

export const DIVISION_IDS = DIVISIONS.map((d) => d.id);

export const divisionById = (id) => DIVISIONS.find((d) => d.id === id) || DIVISIONS[0];

export default DIVISIONS;
