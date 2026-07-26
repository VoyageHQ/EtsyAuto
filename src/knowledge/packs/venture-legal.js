// The lines a one-person venture cannot cross without a lawyer, an
// accountant, or a licence it will never get.
export default {
  id: 'venture-legal',
  division: 'ventures',
  title: 'What a solo venture is allowed to build',
  summary: 'Regulated ground, data obligations, and the promises no agent may make.',

  lessons: [
    'Anything holding other people\'s money needs authorisation in every country it operates in. That is not a hurdle to plan around, it is the end of the idea.',
    'Giving financial, medical or legal advice is regulated even when it is free and even when it is obviously good advice. A tool that helps someone organise their own information is not advice; a tool that tells them what to do is.',
    'Storing health data puts a venture under a much heavier regime than storing anything else. For a one-person evening project the correct answer is not to store it.',
    'The safest one-person venture stores as little personal data as it can get away with. Every field you collect is a field you have to protect, disclose, export on request and delete on request.',
    'An email address is personal data. Collecting one means you owe the person a privacy notice, a lawful basis, a way to unsubscribe and a way to be deleted — before the first signup, not after.',
    'Consent has to be freely given, specific and unambiguous. A pre-ticked box is not consent, and neither is "by signing up you agree to marketing".',
    'A waitlist is not permission to market. Someone who asked to be told when it launches has consented to being told when it launches.',
    'Deleting a user must actually delete them, including from the mailing list and any backups you can reach. "We marked them inactive" is not deletion.',
    'Terms and a privacy policy are needed before launch, not after the first customer. They can be short and honest; they cannot be absent.',
    'Taking payment means the venture is a business, with the tax and record-keeping that implies. That is the owner\'s decision to make, not an agent\'s, and it must be raised before the first payment link exists.',
    'Never build something whose value depends on scraping another company\'s site. It breaches their terms, it breaks whenever they change their markup, and it cannot be sold on.',
    'Do not build on an API whose terms forbid the thing you are building. Read the acceptable use section, not just the pricing page.',
    'A two-sided marketplace needs both sides before either side is worth anything. One person cannot start both, and this venture arm should not try.',
    'Anything aimed at children carries its own regime — parental consent, no behavioural advertising, stricter data rules. Out of scope for an evening project.',
    'If an idea needs a licence, an insurance policy or a compliance officer to be legal, kill it at the analysis stage and say plainly which one it needed.',
    'No agent has a payment method or posting credentials, and none should ever be given one. Anything that requires spending money or publishing publicly goes to the owner as an approval.',
  ],

  rules: {
    // Reasons the Analyst kills an idea outright rather than scoring it.
    hardKills: [
      'holds customer funds',
      'gives financial advice',
      'gives medical advice',
      'gives legal advice',
      'stores health records',
      'requires a licence',
      'requires fca authorisation',
      'aimed at children',
      'depends on scraping',
      'two-sided marketplace',
    ],

    // What must exist before anything is put in front of a real person.
    preLaunchRequirements: [
      'privacy notice',
      'terms of use',
      'a working unsubscribe',
      'a way to request deletion',
      'a named contact',
    ],

    data: {
      // Collect the minimum that makes the thing work, and nothing that merely
      // might be interesting later.
      allowedAtWaitlist: ['email'],
      neverCollect: ['date of birth', 'address', 'phone', 'national insurance', 'health', 'card number'],
      retainWaitlistDays: 365,
    },
  },
};
