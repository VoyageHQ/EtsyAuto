// The Curator: the economics of selling more of what already works.
export default {
  id: 'curator',
  agent: 'curator',
  division: 'etsy',
  title: 'Bundles, variants and catalogue economics',
  summary: 'Why bundles work, when they do not, and how to price them.',

  lessons: [
    'A bundle works when every item in it belongs to the same person on the same day. Budget planner plus bill tracker plus savings chart is one person; wedding planner plus puppy log is two.',
    'Three to four items is the sweet spot. Two barely feels like a bundle; six looks like a clearance bin and devalues each item.',
    'The discount has to be visible and specific. Show the separate total next to the bundle price — a buyer who cannot see the saving does not feel it.',
    'Around thirty percent off the combined price is the level at which a bundle reads as good value without making the individual listings look overpriced.',
    'Never discount so hard that the bundle undercuts the individual listings you still want to sell. The bundle is the upsell, not the replacement.',
    'A bundle needs its own cover and its own contents page. A merged PDF with three separate covers in the middle looks like a mistake.',
    'Bundles are the highest-value listing a printables shop has, because the work is already done and the order value doubles. Propose one as soon as two related products exist.',
    'Variants work when the same content genuinely serves a different buyer: US Letter, ink-saver, teen wording, dyslexia-friendly, large print, one page. They do not work as a way of making the catalogue look bigger.',
    'Never spin a variant off something that has not proven itself. Multiplying an unsold product just multiplies the unsold products.',
    'Never spin a variant off a bundle. A variant of a bundle is confusing to describe and impossible to price.',
    'A variant must target search terms the original cannot. If the only difference is the title, it will cannibalise the parent instead of adding to it.',
    'Keep a lid on how many spin-offs are waiting for a decision. A bench full of near-identical variants is a sign the shop has stopped making new things.',
    'When a bundle sells better than its parts, that is a signal about what the shop should make next: another complete system for that same person.',
  ],

  rules: {
    bundle: { minItems: 2, idealItems: 3, maxItems: 4, discount: 0.3, maxPages: 16 },
    variant: { requireProven: true, maxWaiting: 4, forbidParentCategory: ['Bundles'] },
  },
};
