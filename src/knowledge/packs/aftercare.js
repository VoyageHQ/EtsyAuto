// What happens after the sale, which is where a printables shop is actually
// made or broken.
export default {
  id: 'aftercare',
  agent: null,
  division: 'etsy',
  title: 'Reviews, refunds and messages',
  summary: 'The unglamorous half of the shop, and the one that compounds.',

  lessons: [
    'Digital downloads are not legally required to be refundable in most places, but refusing a refund over a two pound file costs more in reviews than it saves in revenue. Refund quickly and quietly, then fix the cause.',
    'The most common message is a printer setting, not a broken file. A line in the listing and in the read-me telling people to print at 100% prevents most of them.',
    'The second most common is someone expecting a physical item. That is a listing problem, not a buyer problem — say it is digital in the first three lines.',
    'The third is someone wanting an editable version. Either ship one or say plainly that the file is not editable, in the listing.',
    'Ask for a review only after the buyer has had time to use the thing, and only once. Never offer anything in exchange for a review — that breaks Etsy\'s rules and can close a shop.',
    'Reply to every review, good or bad, briefly and without defensiveness. Future buyers read the replies more carefully than the reviews.',
    'A one-star review with a specific complaint is free product research. Fix the thing, then say in the reply that it is fixed.',
    'Never argue with a review, never mention a refund you gave, and never post anything that identifies the buyer.',
    'Include a read-me in every download: what is included, how to print it, and one line inviting people to message before leaving a review if anything is wrong. It works.',
    'Every message answered quickly improves shop-level search placement. It is the cheapest ranking work available.',
  ],

  rules: {
    aftercare: {
      refundThreshold: 'refund immediately below the cost of arguing',
      askForReviewAfterDays: 7,
      neverDo: ['incentivise reviews', 'argue publicly', 'name the buyer', 'mention refunds in replies'],
    },
  },
};
