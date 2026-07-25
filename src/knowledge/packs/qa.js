// The Inspector: what actually goes wrong, and what to refuse.
export default {
  id: 'qa',
  agent: 'qa',
  division: 'etsy',
  title: 'What goes wrong and how to catch it',
  summary: 'The real failure modes of digital listings, in the order they cost you money.',

  lessons: [
    // --- the expensive failures, worst first --------------------------------
    'The most expensive failure is a file that does not open. Check the PDF header and the end-of-file marker on every file, every time, and treat a suspiciously small file as broken until proven otherwise.',
    'The second most expensive is a listing that is vague about being digital. If the description does not say plainly that nothing is posted, send it back — that one sentence prevents more refunds than everything else combined.',
    'The third is a layout that clips when printed. Anything closer than about 12mm to the page edge will be cut off on a home printer, and the buyer will blame the file.',
    'A product that only works on one paper size, without saying so, generates international refunds. Either ship both A4 and Letter or state the limitation in the title.',
    'Text below about 9pt, or pale grey text, disappears when printed. Judge the page as printed paper, not as a screen.',

    // --- policy and legal ------------------------------------------------------
    'Reject on sight any brand, character, film, band, show or celebrity name in the title, tags, description or filenames — including deliberate misspellings and "inspired by". This is not a style note; it is what closes shops.',
    'Reject any claim to treat, cure, diagnose, guarantee or improve a medical, financial or legal outcome. "Designed for ADHD brains" is fine; "reduces ADHD symptoms" is not.',
    'Reject invented social proof: review counts, customer numbers, ratings, "best seller", "as seen in". If it is not demonstrably true today, it does not go out.',
    'Reject fake urgency: countdowns, "limited time", "only 3 left" on a digital product that cannot run out.',
    'Check the filenames as carefully as the listing. A file called "bluey-chore-chart.pdf" is a trademark problem even if the listing text is clean.',

    // --- quality bars -----------------------------------------------------------
    'A single page is not a paid product unless it is genuinely a poster. Send back anything under three pages that is priced as a pack.',
    'Fewer than four listing images means the listing will underperform whatever else is right. Etsy shows a gallery and buyers scroll it.',
    'Placeholder content is an automatic rejection. "Item 1", "Lorem ipsum", "Section title" or empty rows where content was promised means it is unfinished.',
    'Check that the description matches the file. If the description promises a spreadsheet and no CSV exists, that is a refund and a bad review, not a small mismatch.',
    'Check the page count claimed in the listing against the pages actually produced. Buyers count.',

    // --- how to review ------------------------------------------------------------
    'Be specific about what is wrong and what would fix it. "Thin description" is useless; "the description never says it is a digital download, add that in the first three lines" is actionable.',
    'Separate what must be fixed from what would merely be better. Blocking a listing over a stylistic preference wastes the shop\'s time.',
    'When the same class of problem appears twice, write the rule that prevents it rather than rejecting it a third time. Teaching is cheaper than inspecting.',
    'Do not pad a review with praise. The shop needs to know what is broken, not to be encouraged.',
    'If you are unsure whether something crosses a policy line, treat it as if it does and ask the owner. A held listing costs a day; a policy strike costs the shop.',
  ],

  rules: {
    thresholds: {
      minPdfBytes: 3000,
      minPages: 3,
      minImages: 4,
      minDescriptionChars: 400,
      maxTitleChars: 140,
      requiredTags: 13,
    },
    placeholderMarkers: ['lorem ipsum', 'item 1', 'section title', 'your text here', 'tbc', 'todo', 'xxx'],
    refundTriggers: [
      'not clearly digital',
      'wrong paper size only',
      'file will not open',
      'promised file missing',
      'page count mismatch',
      'clipped margins',
    ],
  },
};
