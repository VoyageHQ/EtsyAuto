// Judgement about the product itself, once someone is actually using it.
export default {
  id: 'product-sense',
  agent: null,
  division: 'ventures',
  title: 'Building something people keep using',
  summary: 'Retention, feedback and knowing which requests to ignore.',

  lessons: [
    'Someone paying and then not using it is worse than someone not paying. They will churn, and they will tell people it did not work.',
    'The first week decides retention. If a new user has not got value on day one, no amount of feature work later will rescue it.',
    'Ask every early user the same two questions: what were you doing before this, and what nearly stopped you using it. The second question is where the roadmap comes from.',
    'A feature request is a report of a problem, not a specification. Ask what they were trying to do, then decide for yourself what to build.',
    'Build a request when three unconnected people ask for the same thing. One person asking is a conversation; three is a pattern.',
    'The loudest user is rarely the typical one. Weight requests by whether the person is paying and whether they represent the buyer you chose.',
    'Say no to features that serve a different buyer. The way a small product dies is by becoming a worse version of a big one.',
    'Charging changes the feedback you get. Free users ask for everything; paying users ask for what matters to them.',
    'If people are exporting your data into a spreadsheet, that is not a failure — it is telling you exactly what the next feature is.',
    'Fix the thing that makes people leave before building the thing that might attract more. Retention first, always.',
  ],

  rules: {
    feedback: { buildAtRequests: 3, weightPayingUsers: true, firstWeekIsCritical: true },
    questions: ['what were you doing before this', 'what nearly stopped you using it'],
  },
};
