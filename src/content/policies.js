// Copy for /policies. The approved wording lives in Obsidian (Admin/Strategy/Site Selection and Appraisal/
// Portal pages/); change it there first, then here. Inline marks: **bold** and [label](https://url).
// Blocks: { p }, { ul: [] }, { table: { head: [], rows: [[]] } }, { note } (a quiet aside).

// Set to true once Eilish has approved the drafts (and the solicitor check is done). Until then the page
// carries a visible "draft" notice.
export const POLICIES_APPROVED = false;
export const POLICIES_UPDATED = '12 November 2026';

export const POLICY_SECTIONS = [
  {
    id: 'privacy',
    title: 'Privacy notice',
    summary: 'What personal data we hold when you use the portal, and why.',
    blocks: [
      { p: 'This notice explains what personal data Rose Tinsley Consulting Limited holds when you use the Site Selection portal, and why. It covers portal accounts only. Our website privacy policy covers the main website.' },
      { h: 'Who we are' },
      { p: 'Rose Tinsley Consulting Limited (company number 15880463) runs the portal and is the controller of the personal data described here. Registered office: 22 Clover Avenue, Colchester, CO5 9GF. Email: [hello@rosetinsleyconsulting.com](mailto:hello@rosetinsleyconsulting.com).' },
      { h: 'What we hold about you' },
      { p: '**Your account.** Your email address, your name if you or we add one, the workspaces you can see, whether you have admin access, and when your account was created. Your password is held by our sign-in provider in hashed form. We never see it.' },
      { p: '**What you do in the portal.** When you accept or dismiss a site, request or withdraw an appraisal, or add notes to a request, we record who did it and when. Administrators’ actions, such as invites, access changes and password resets, are recorded the same way.' },
      { p: '**Security records.** For each recorded action we keep the IP address it came from. Our sign-in provider keeps its own records of sign-ins, including IP address and browser type. If the portal hits an error while handling your request, we log the page or action, the time and your user number, so we can fix it.' },
      { p: '**In your browser.** The portal stores your sign-in session, your light or dark theme choice and, for administrators, report drafts in your browser’s local storage. We don’t use cookies for advertising or analytics, and the portal has no analytics tracking.' },
      { p: 'We don’t ask for special category data, and we don’t make automated decisions about you.' },
      { h: 'Why we use it' },
      { table: { head: ['Purpose', 'Lawful basis'], rows: [
        ['Giving you access to your organisation’s workspace and the reports we prepare for it', 'Contract with your organisation, and our legitimate interest in delivering the work it has asked for'],
        ['Sending sign-in emails: invitations and password resets', 'Same as above'],
        ['Keeping a record of decisions and requests in each workspace', 'Legitimate interest: your organisation and RTC both need to know who decided what'],
        ['Security records and error logs', 'Legitimate interest: keeping the portal and client data secure, and investigating misuse'],
      ] } },
      { h: 'Who else handles it' },
      { p: 'We use these providers to run the portal. Each one only processes data on our instructions.' },
      { ul: [
        '**Supabase:** sign-in and account management',
        '**Resend:** delivers invitation and password reset emails',
        '**Cloudflare:** carries all traffic between your browser and our server, and protects it from attack',
        '**OpenFreeMap:** serves the background map. Your browser fetches map tiles directly from it, so it sees your IP address.',
        '**Google Fonts:** serves the portal’s typefaces. Your browser fetches them directly, so Google sees your IP address.',
      ] },
      { p: 'The portal itself, its database and all workspace data are hosted on RTC’s own server in the UK. We don’t sell personal data or share it for marketing.' },
      { h: 'Transfers outside the UK' },
      { p: 'Some of the providers above may process data outside the UK. Where they do, we rely on the safeguards in their data processing terms, such as the UK International Data Transfer Addendum or the UK extension to the EU-US Data Privacy Framework.' },
      { h: 'How long we keep it' },
      { table: { head: ['Data', 'Kept for'], rows: [
        ['Your account', 'While your organisation’s engagement with RTC is active. We remove it when the engagement ends or when your organisation asks.'],
        ['Record of actions (audit log)', '2 years'],
        ['Error logs', '90 days'],
        ['Backups', 'Daily backups for 14 days, weekly copies for 4 weeks'],
      ] } },
      { h: 'Your rights' },
      { p: 'You can ask us to give you a copy of the personal data we hold about you, correct anything that’s wrong, delete your data or restrict how we use it, stop using it where we rely on legitimate interests, or give it to you in a portable format. We aim to reply within one month. Email [hello@rosetinsleyconsulting.com](mailto:hello@rosetinsleyconsulting.com). Your organisation can also ask us to remove your account at any time.' },
      { h: 'Complaints' },
      { p: 'Please contact us first if you’re unhappy with how we’ve handled your data. If you’re still not satisfied, you can complain to the Information Commissioner’s Office at [ico.org.uk](https://ico.org.uk) or on 0303 123 1113.' },
    ],
  },
  {
    id: 'terms',
    title: 'Terms of access',
    summary: 'The rules for using the portal and what its reports are.',
    blocks: [
      { p: 'These terms apply to everyone who signs in to the Site Selection portal, which is run by Rose Tinsley Consulting Limited (“RTC”, “we”). Your organisation’s engagement contract with RTC comes first. If anything here conflicts with that contract, the contract applies.' },
      { h: 'Who can use the portal' },
      { p: 'Accounts are by invitation only. We create them for people your organisation names as part of an engagement with RTC. Your account is for you alone: please don’t share your sign-in details or let anyone else use your account.' },
      { h: 'Keeping your account secure' },
      { p: 'Use a password you don’t use anywhere else. If you think someone else has used your account, tell us straight away at [hello@rosetinsleyconsulting.com](mailto:hello@rosetinsleyconsulting.com) and reset your password.' },
      { h: 'What you may not do' },
      { ul: [
        'Try to reach a workspace, report or dataset you haven’t been given access to',
        'Copy the portal’s data in bulk, or use automated tools to download it',
        'Try to probe, overload or get round the portal’s security',
        'Share reports or data outside your organisation, except as described under “Using our reports and the data”',
      ] },
      { h: 'What the portal and its reports are' },
      { p: 'The portal shows evidence about sites against the criteria your organisation set. It is not a recommendation to buy, lease or develop any site.' },
      { p: 'Our reports and site checks are GIS analysis of published data. They are not legal advice or a report on title, planning advice, a valuation or a survey. INSPIRE parcel outlines show the general position of registered land, not legal boundaries.' },
      { p: 'Published datasets have gaps and errors, and they change. Each dataset’s coverage limits are listed on the [Data sources](/data) page. Where a dataset doesn’t cover an area, we report the result as unknown rather than clear. Check anything you rely on with the relevant professional before acting on it.' },
      { h: 'Using our reports and the data' },
      { p: 'Your organisation may use the reports we deliver for its own purposes, including sharing them with its advisers and funders.' },
      { p: 'The underlying data belongs to its publishers and is used under their licences, mostly the Open Government Licence. If you reuse any of it, keep the attribution statements shown on the [Data sources](/data) page and in each report. The portal’s design, our analysis and the wording of our reports remain RTC’s.' },
      { h: 'Availability and liability' },
      { p: 'We aim to keep the portal available but can’t promise it will always be. We may take it offline for maintenance or updates. Our liability for the work delivered through the portal is set out in your organisation’s engagement contract with RTC.' },
      { h: 'Suspending access' },
      { p: 'We may suspend or remove an account that breaks these terms or puts the portal or other clients’ data at risk. We remove accounts when your organisation’s engagement ends or when your organisation asks us to.' },
      { h: 'Changes and law' },
      { p: 'We may update these terms. We’ll tell your organisation’s contact about any significant change. These terms are governed by the law of England and Wales.' },
    ],
  },
  {
    id: 'licences',
    title: 'Data licences and attribution',
    summary: 'Who owns the data behind the portal, and how you may reuse it.',
    blocks: [
      { p: 'Every dataset in the portal is published open data, used under its publisher’s licence. Almost all of it is under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).' },
      { p: 'The [Data sources](/data) page lists each dataset with its licence and the exact attribution statement its publisher asks for. Each report carries the statements for the datasets it uses. If you reuse data or maps from the portal or a report, keep those statements with it.' },
      { p: 'Some publishers add their own conditions. Historic England asks that its data carries the date it was obtained and a pointer to the current version on its website. HM Land Registry’s INSPIRE conditions require its copyright statements and don’t allow the parcel outlines to be used as proof of a legal boundary.' },
      { p: 'Background map: © OpenStreetMap contributors, served by OpenFreeMap using OpenMapTiles.' },
    ],
  },
  {
    id: 'security',
    title: 'Security',
    summary: 'How we keep your workspace and its data safe.',
    blocks: [
      { ul: [
        'Access is by invitation only. Passwords must be at least 10 characters, reset links expire, and changing your password signs out your other sessions.',
        'Every request, down to each map tile, is checked against the workspaces you can access. No client can see another client’s workspace.',
        'All traffic is encrypted (HTTPS), and the portal’s server can’t be reached directly from the internet.',
        'Each client’s data is held separately, and each part of the portal can only reach the data it needs.',
        'Backups run every night and are checked to be readable, with weekly copies held off the server.',
        'Administrative actions are recorded in a log that can’t be edited.',
        'The portal and its data updates are monitored, and we’re alerted if anything fails.',
      ] },
      { p: 'If you notice anything that looks wrong, or think your account has been used by someone else, email [hello@rosetinsleyconsulting.com](mailto:hello@rosetinsleyconsulting.com).' },
    ],
  },
];
