// Copy for /methodology: how the site check works, written for clients. Source notes: Obsidian
// Admin/Strategy/Site Selection and Appraisal/03 Method and Terminology and 07 Data Methodology.
// The result key, search distances and the 3 km extent are rendered from src/lib/siteCheck.js, not written here,
// so the page can't drift from what the report builder does. Inline marks: **bold** and [label](url).
// Vocabulary rule (03 Method and Terminology): "the data indicates", never "this site is suitable".

export const METHOD_INTRO = 'Every site appraisal tests the site against published constraint data. This page explains how that test works, what each result means and where its limits are.';

// What each result means, keyed by CHECK_STATUS
export const RESULT_MEANINGS = {
  'on-site': 'The constraint overlaps the site. For areas such as flood zones we give the share of the site they cover.',
  within: 'Nothing on the site, but the constraint lies within the search distance for that dataset. We give how many and the nearest.',
  clear: 'Nothing on the site or within the search distance. We still name the nearest one within 3 km, if there is one.',
  unknown: 'The dataset doesn’t cover this area, or isn’t loaded yet. We treat this as unknown, never as clear.',
};

export const METHOD_SECTIONS = [
  {
    id: 'what',
    title: 'What we check',
    blocks: [
      { p: 'We check each site against every constraint dataset listed on the [Data sources](/data) page: nature and landscape designations, flood risk, heritage, and planning designations such as Green Belt and Article 4 directions.' },
      { p: 'Each dataset is checked on its own, as its publisher released it. We don’t merge datasets or edit them, so every result in a report can be traced back to one source and one date.' },
    ],
  },
  {
    id: 'basis',
    title: 'Measuring from a boundary or a point',
    blocks: [
      { p: 'When your site has an agreed boundary, we measure from that boundary. Until a boundary is agreed, we measure from the site’s point location, and the report says which was used.' },
      { p: 'A point can miss a constraint that only touches the edge of a site. Read a point-based “Clear” with that in mind, and ask us to confirm the boundary before relying on it.' },
    ],
  },
  { id: 'results', title: 'What the results mean', results: true },
  {
    id: 'distances',
    title: 'Search distances',
    distances: true,
    blocks: [
      { p: 'What matters near a site depends on the constraint. A conservation area next door can shape a scheme, while a nature reserve two kilometres away may only matter for some uses. So each dataset has its own search distance.' },
      { p: 'These are the starting points for urban and rural sites. Your consultant adjusts them for each site, and every result in the report states the distance used.' },
    ],
    after: [
      { p: 'Whatever the search distance, the check looks out to 3 km, so a report can name the nearest constraint even when it is outside the search area.' },
    ],
  },
  {
    id: 'unknown',
    title: 'Unknown stays unknown',
    blocks: [
      { p: 'Some datasets don’t cover the whole country. Green Belt, Article 4 directions, conservation areas and tree preservation areas come from planning.data.gov.uk, which collects them from councils, and not every council has supplied its data yet.' },
      { p: 'Where a dataset has gaps, its entry on the [Data sources](/data) page says so. For those datasets, no result is not the same as no designation. Check with the local planning authority before relying on it.' },
    ],
  },
  {
    id: 'currency',
    title: 'How current the data is',
    blocks: [
      { p: 'We keep our own copy of every dataset rather than querying publishers on the fly, so results are fast and a report can be reproduced later. Every night we check each publisher for a new release, and load it when there is one. A new copy only replaces the old one after it passes checks on its size and shape.' },
      { p: 'Each report states the date its data was current. The [Data sources](/data) page shows when each dataset was last checked and last updated.' },
    ],
  },
  {
    id: 'limits',
    title: 'What a report is not',
    blocks: [
      { p: 'A report sets out evidence against the criteria you set. It is not a recommendation to buy, lease or develop a site.' },
      { ul: [
        'It isn’t legal advice or a report on title. INSPIRE parcel outlines show the general position of registered land, not its legal boundary.',
        'It isn’t planning advice or a planning opinion.',
        'It isn’t a valuation or a survey of the site.',
      ] },
      { p: 'A consultant reviews every result before a report is issued, and adds notes where the data needs explaining.' },
    ],
  },
];
