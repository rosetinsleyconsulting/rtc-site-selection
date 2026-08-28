# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, separated by workspace:

- **RTC consultants** (Rose Tinsley Consulting staff) who source and vet candidate sites on behalf of a client engagement.
- **Client-side reviewers** who log into their own workspace to review the sites RTC has sourced for them and decide what stays on the shortlist.

Platform admins (`isPlatformAdmin`) exist as a separate role for managing workspaces/users across tenants.

## Product Purpose

A multi-tenant site-selection workspace for commercial property search in the UK. It replaces spreadsheet-and-map juggling with a single tool where each site carries its own data-confidence context (VOA rateable value, match confidence, planning applications, parking, spare land) alongside a lightweight accept/dismiss/new workflow, so shortlisting decisions are made on data whose reliability is visible, not assumed.

## Positioning

Data-confidence-aware shortlisting: every site record surfaces not just the numbers (footprint, rateable value, spare land) but how confident that data is (`voaMatchConfidence`, `dataConfidenceNotes`), which a plain spreadsheet or generic map tool doesn't carry. The accept/new/dismissed status workflow turns that into an auditable shortlisting decision per workspace.

## Operating Context

- Multi-tenant: `workspaces` + `memberships` scope every site and status to a specific client engagement.
- Auth via Clerk (`@clerk/clerk-react`, `@clerk/express`, `@clerk/backend`); the app shows a configuration notice until Clerk keys are set.
- Map view built on MapLibre GL; site list/filter alongside it.
- Backend: Express + Drizzle ORM over Postgres (`server/db/schema.js`, `server/routes/api.js`).
- Data ingestion includes CSV parsing (`src/lib/parseCsv.js`) and a seed script (`server/seed-lowlu.js`).

## Capabilities and Constraints

- Locale is fixed to the UK: London-area boroughs, £ (GBP) currency formatting, VOA rateable values — this is not going international.
- Site status workflow: `new` → `accepted` / `dismissed`, tracked per site with `updatedBy`/`updatedAt`.
- Fields tracked per site: type, borough, site name, category, priority, footprint (m²), spare land on title (m²), VOA rateable value, VOA match confidence, nearby planning applications, nearby parking, data confidence notes, spare area comments, lat/lon.

## Evidence on Hand

No testimonials, case studies, or press assets on hand — none should be invented. Site data itself (via CSV import/seed) is the primary evidence source; no other content acts as marketing/proof copy since this is an internal/client operate tool, not a persuade surface.

## Product Principles

- Never hide or flatten data confidence — a number without its confidence context is worse than no number.
- Keep RTC and client workspaces cleanly separated; nothing crosses tenant boundaries.
- The shortlist workflow (new/accepted/dismissed) is the spine of the UI — every view should make it obvious where a site stands.
- UK-specific data conventions (£, VOA, boroughs) stay hard-coded assumptions, not configurable options.

## Accessibility & Inclusion

No product-specific accessibility requirement established yet.
