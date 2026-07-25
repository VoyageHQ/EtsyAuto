// The Builder: making the first version real, and safe.
export default {
  id: 'builder',
  agent: 'builder',
  division: 'ventures',
  title: 'Building the first version',
  summary: 'Landing pages that convert, and the security basics you cannot skip.',

  lessons: [
    // --- the landing page ------------------------------------------------------
    'The headline says what it does for whom, not what it is. "Chase unpaid invoices without the awkward email" beats "Invoice management platform".',
    'Put the buyer\'s own words on the page. Quoting the actual complaint, with a link to where it was said, is the most persuasive thing an unknown product can do.',
    'One call to action, repeated. A page offering a signup, a demo, a newsletter and a Twitter follow converts on none of them.',
    'The form asks for an email address and nothing else. Every extra field costs signups, and you can ask the rest in the first reply.',
    'Show the price. A page that hides pricing behind "contact us" loses the small buyers this business is built for.',
    'Say plainly what state it is in. "Early access, building it now" is honest and sets expectations; implying a finished product to people who then pay is not.',
    'The page must work on a phone and load without a build step. Most of the traffic from a forum reply is mobile.',

    // --- taking money -----------------------------------------------------------
    'Use a hosted checkout — a Stripe Payment Link or equivalent. Card details must never touch your server, and building a checkout yourself takes on obligations you do not want.',
    'Do not build billing before the first sale. A payment link and a manual email is a perfectly good way to take the first ten payments, and it teaches you what the billing actually needs to do.',
    'Keep prices in one place in the code, matching the pricing page. Two sources of truth for a price is a refund conversation waiting to happen.',

    // --- not getting burned --------------------------------------------------------
    'Never commit secrets. Keys go in the environment, and the example file carries names with empty values only.',
    'Signup data is personal data: gitignored, backed up somewhere you control, never pasted into anything, deletable on request.',
    'Validate anything that arrives from a form before it touches disk. Cap the length, check the shape, and never write user input into a filename or a path.',
    'Serve static files from one known directory and refuse anything containing a path traversal. It is three lines and it prevents the oldest bug on the web.',
    'Rate limit anything that writes. An unprotected signup endpoint will be filled with junk within a week of being found.',
    'Log enough to debug and nothing more. Never log email addresses or anything you would not want in a screenshot.',

    // --- honesty about what has been made -----------------------------------------
    'Be precise about what has been built and what has not. A scaffold with a landing page and a waitlist is a real start; calling it a product is a lie that the owner will discover at the worst moment.',
    'Never overwrite work someone has done by hand. Generated files are a starting point, and once a human has edited one it belongs to them.',
    'Leave the plan next to the code, not in a wiki. The next person to open the folder is the owner at nine at night, and they need to know what to do next.',
  ],

  rules: {
    landing: { fields: 1, ctas: 1, showPrice: true, mobileFirst: true, statementOfState: true },
    security: {
      never: ['commit secrets', 'store card details', 'log emails', 'trust form input', 'interpolate input into paths'],
      always: ['cap body size', 'validate shape', 'gitignore user data', 'rate limit writes'],
    },
    protectedFiles: ['public/index.html', 'public/styles.css', 'server.js'],
  },
};
