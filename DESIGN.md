---
name: RTC Site Selection
colors:
  charcoal-ink: "#2D2D2A"
  deep-forest: "#454E3A"
  moss: "#6F8443"
  mist: "#DBDFD1"
  cream-paper: "#FEFFF8"
  paper-tint: "#F5F6EC"
  muted-text: "#74786D"
  dek-text: "#5F6358"
  status-new: "#A67C7C"
  status-accepted: "#517C78"
  status-dismissed: "#9D9D91"
  result-on-site: "#B33A3A"
  result-on-site-ink: "#A33232"
  result-on-site-deep: "#8E2B2B"
  result-within: "#C9A227"
  result-within-ink: "#7D630F"
  result-within-deep: "#6B5410"
  result-clear-ink: "#4F6030"
  result-outside-line: "#5F6358"
  result-outside-label: "#45493F"
typography:
  headline:
    fontFamily: "Noto Serif Display"
    fontSize: 34px
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: -0.025em
  article-headline:
    fontFamily: "Noto Serif Display"
    fontSize: 30px
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: -0.02em
  standfirst:
    fontFamily: Montserrat
    fontSize: 11.5px
    fontWeight: 600
    lineHeight: 1.6
    letterSpacing: 0.08em
  index-title:
    fontFamily: Montserrat
    fontSize: 12.5px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: 0.05em
  body:
    fontFamily: Montserrat
    fontSize: 13.5px
    fontWeight: 500
    lineHeight: 1.6
  section-head:
    fontFamily: Montserrat
    fontSize: 10.5px
    fontWeight: 700
    letterSpacing: 0.12em
  ui:
    fontFamily: Montserrat
    fontSize: 12.5px
    fontWeight: 600
  meta:
    fontFamily: Montserrat
    fontSize: 11.5px
    fontWeight: 500
  report-label:
    fontFamily: Montserrat
    fontSize: 9.5px
    fontWeight: 700
    letterSpacing: 0.12em
rounded:
  sm: 5px
  md: 6px
  lg: 8px
  stage: 10px
  pill: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 22px
  xxl: 28px
components:
  button-primary:
    backgroundColor: "{colors.deep-forest}"
    textColor: "{colors.cream-paper}"
    typography: "{typography.ui}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 0 14px
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.deep-forest}"
    typography: "{typography.ui}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 0 14px
  text-button:
    backgroundColor: transparent
    textColor: "{colors.deep-forest}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    height: 30px
    padding: 0 10px
---

# Design System: RTC Site Selection

## Overview

**North star: the graphics desk.** The app reads like a newspaper's map feature, held strictly inside the Rose Tinsley Consulting brand. The map is the page. Beside it sit an index (the site list) and an article (the site panel). Headlines and site names are serif; everything else, including subtitles and notes, is Montserrat. Structure comes from hairline rules and typography, never from boxed cards, filled chips or stat tiles.

Two audiences see the same surfaces. Clients see the shortlist. Platform admins see the same pages plus admin tools, always grouped and labelled as admin-only (`.admin-tools`, `.admin-only-tag`) and gated on `profile.isPlatformAdmin`. Never mix admin controls into client-visible chrome without that gate and label.

Basemaps (3 Nov 2026): Match theme (default: light grey in light mode, dark grey in dark mode), Light grey, Dark grey, Streets and Topographic, chosen in the Layers panel and remembered per browser. All are OSM or OpenTopoMap raster tiles; the greys are made in the renderer (saturation -1, and brightness-min above brightness-max to invert for dark). No satellite: the free sources are non-commercial or need a paid licence.

## Colors

**Restrained strategy.** Cream paper and charcoal ink carry nearly everything. Forest is the one brand field (sidebar, auth brand column) and the primary action colour. Moss is the focus and selection accent.

### Primary
- **Deep forest** `#454E3A`: sidebar field, primary buttons, link text, active toggles.
- **Moss** `#6F8443`: focus rings, input focus underline, selected-row tint (at 13% alpha), admin-only labels.

### Neutral
- **Cream paper** `#FEFFF8`: page ground, panels, popovers.
- **Paper tint** `#F5F6EC`: secondary surfaces (admin tools group, map-settings panel, sheet footers).
- **Charcoal ink** `#2D2D2A`: headlines, values, and the 1px section rules.
- **Dek** `#5F6358` and **muted** `#74786D`: standfirsts and metadata.
- Rules: `rgba(45,45,42,.14)` for structure, `rgba(45,45,42,.08)` between rows.

### Data ink
- Status colours come from each workspace's map config and are exposed as `--st-new`, `--st-accepted`, `--st-dismissed`. Defaults: dusty rose `#A67C7C`, verdigris teal `#517C78`, grey `#9D9D91`. List status marks and the map key read the same variables as the markers, so they always match.
- Review flags keep their own fixed colours (`REVIEW_FLAG_COLORS`).

### Named Rules
- **Colour is data.** Rose, teal and grey appear only where they encode a site's status or flag. They are never decoration.

## Typography

Two brand faces only: **Noto Serif Display** (700 for headlines and wordmarks to match the bold serif of the RTC logo; 600 for site names in lists and tables; never lighter) and **Montserrat**.

### Hierarchy
- **Headline** 34px serif: page title (workspace name, admin section). 27px on phones.
- **Standfirst** 11.5px Montserrat 600, uppercase, 0.08em tracking, dek colour: one sentence summarising the page, figures in 700 ink. This replaces stat tiles.
- **Article headline** 30px serif: site name in the site panel.
- **Index title** 12.5px Montserrat 700, uppercase, 0.05em tracking: site names in the floating site list (reads better over the map than small serif). Admin table names stay 16px serif 600.
- **Body** 13.5px Montserrat 500/1.6: dek under the site name, confidence notes, field notes, nearby notes, VOA match note. Serif is for headlines and names only; small serif text proved hard to read.
- **Section head** 10.5px Montserrat 700, uppercase, 0.12em tracking, sitting on a 1px charcoal rule.
- **UI** 12.5px Montserrat 600: buttons and controls. Sentence case.
- **Meta** 11.5px Montserrat 500: borough · category lines, figures, timestamps.

### Named Rules
- **Figures are tabular.** Every count, area and value uses `font-variant-numeric: tabular-nums`.
- **No labels above headlines.** The heading carries its own weight; context goes in the standfirst below it.
- **Missing data is said, not hidden.** "Not recorded" or "… not recorded" in a lighter tone, never a dash or a blank.

## Layout

- **Workspace is map-first (changed 3 Nov 2026, Esri Map Viewer pattern).** No banner (removed 3 Nov 2026): panels sit either side and the map runs edge to edge with no frame, radius or shadow. Over the top of the map float translucent pills: workspace plus site counts top centre (the status counts also toggle the status filter), and Admin, theme and sign out top right. On a narrow map (both panels open, or phones) the status pills drop to dot and number, and Admin becomes an icon.
  - Left: a 64px action bar of icon-plus-label tools (Sites, Filters, Layers, Legend, and Styling for admins, pinned to the bottom). One tool panel at a time docks beside it (340px; 300px at ≤1050px) and pushes the map rather than floating over it.
  - Right: the site article docks flush (420px; 360px at ≤1050px). The map's zoom, home and attribution controls shift left to clear it.
  - Map controls: zoom and "zoom to all sites" top right, scale bar bottom left, attribution bottom right.
  - ≤700px: the action bar moves to the bottom, panels open as a bottom sheet and the article goes full screen.
- **Panel themes:** dark (default) and light, toggled by the sun/moon button in the header and remembered per browser (`rtc-site-selection-theme` in localStorage). Dark re-points the shell tokens (`--paper` `#1C1F19`, `--ink` `#ECEEE3`, `--accent-text` `#B4C786` for links and active states) under `.gis-shell[data-theme="dark"]`. It covers the action bar, tool panels and site article only. Pills follow the theme (cream or near-black at about 70% opacity). The map, basemap and map controls don't change.
- **Panel gradient (3 Nov 2026):** the side panels sit on the website's React Bits Grainient (`src/Grainient.jsx`, copied from `GitHub/website`), one shared behind the action bar and tool panel, one behind the site article. Dark is deliberately subtle (`#2B3325`, `#232920`, `#1C2018`, low contrast, broad diagonal blend), light uses pale sage (`#E3E9D3`, `#EEF1E3`, `#FBFCF4`). Slow movement, still under reduced motion, off on phones and when WebGL2 is missing.
- The map fits itself to the shortlist on load and from the home button.
- Admin (3 Nov 2026) shares the workspace system: same dark/light theme (usePanelTheme, one stored choice), a 252px nav rail on the grain gradient with the small type-set RTC logo, an Admin tag and icon nav items with counts (open appraisals in gold), theme and sign-out pills top right, and tables in a soft rounded surface (radius 12, hairline rules, Montserrat 600 names). Side sheets, fields, switches and notices all have dark versions. On phones the rail is the off-canvas drawer.
- Admin: headline block, search toolbar, then a full-width ruled table. Forms open in a right-hand sheet (460px).
- Spacing steps on a 4px base: 4, 8, 12, 16, 22, 28.

## Elevation & Depth

Depth only separates floating layers from the map:
- Floating panels (index, key): `0 1px 2px rgba(45,45,42,.06), 0 14px 36px rgba(25,35,25,.14)`.
- Site article and sheets: a leftward shadow, `-18px 0 44px rgba(25,35,25,.14)`.
- Page-level content (tables, headline) has no shadow; rules do the work.

## Shapes

Radii stay small: 5–6px controls, 8px floating panels, 10px map stage, full pill only for small badges (admin-only tag, role badge).

## Components

### Buttons
- `.decision.accept` / `.adm-btn-primary`: forest fill, cream text, 36px.
- `.decision` / `.adm-btn-ghost`: transparent, forest text, hairline border.
- `.decision.is-done`: the accepted state, a teal tint at 12% with teal text.
- `.text-button`: borderless, for toolbars (admin tools).

### Site index row (`.site-row`)
Montserrat caps site name with a status mark (dot plus uppercase label) on the right, a meta line, and a figures line. Rows are separated by soft rules. Hover tints 5% forest; selected tints 13% moss; dismissed titles drop to muted.

### Site article (`.detail-panel`)
Status mark, serif headline, dek ("{category} in {borough}, London"), then Accept/Dismiss, then rule-topped sections: The figures (definition rows, value right-aligned, VOA match confidence as a small note under the value), Data confidence, Field notes, Nearby, Look further.

### Tool panels (`.tool-panel`)
Docked, full height, hairline right border, 50px head with title and close. Filters holds review status (with counts), borough, category, review flag, sort and Reset; a rose dot on the Filters button shows filters are applied. Layers lists operational layers and the basemap. Legend explains every symbol. Styling is the admin map-appearance form. The old floating map key is gone.

### Linked hover (signature interaction)
Hovering a row marks its marker (feature-state `hover`: bigger radius, charcoal ring) and opens a name label on the map, set like the list (Montserrat caps). Hovering a marker does the same and highlights its row. One shared `hoveredId` drives both.

### Inputs
Bordered 38–42px fields with a moss focus ring. The index search is the exception: an underlined field with a charcoal rule that turns moss on focus.

## Do's and Don'ts

### Do:
- Put page context in a standfirst sentence with the real numbers in it.
- Top every content section with a 1px charcoal rule and a section head.
- Show every recorded figure with its confidence, and say "not recorded" when it isn't.
- Gate and label anything admin-only.

### Don't:
- Use boxed cards, filled status pills or big-number stat tiles.
- Put a kicker or eyebrow label above a headline.
- Use glass blur anywhere except the floating map pills, or new accent colours outside the brand palette. Grain belongs only to the panel gradient (`PanelBackground`), never on the map or on individual components.
- Add a basemap without checking its tile licence and usage policy first (record it in the Site Selection data register).

### Site appraisal requests (added 3 Nov 2026)
Gold (rye `#B6955B`) is the appraisal colour, used only for appraisal state: a ring on the map marker, an "Appraisal requested" tag in the site list, a gold pill counting open requests (click to filter), and the request block in the site article. The block starts as a single "Request site appraisal · £200 plus VAT" button, expands into a confirm form (what's covered, fixed fee, optional notes), then shows the request state with a Withdraw link while it's still "requested". Price is a placeholder held once in `APPRAISAL_OFFER` (server/routes/api.js). Admins manage requests under Admin → Site appraisals.

### Site appraisal report (11 Nov 2026)
Admin → Site appraisals → Build report (`src/ReportBuilder.jsx`, styles in `src/report-builder.css`, verdict logic in `src/lib/siteCheck.js`). The editor on the left follows the admin theme. The report on the right is always paper (cream, charcoal ink, tokens pinned in `.rb-preview`) and is the printed page: 180 mm wide on screen and in print, so what you see is what prints.
- **Result colours are data.** On the site: red `#B33A3A` (text `#A33232`, labels `#8E2B2B`). Within the search area: gold `#C9A227` (text `#7D630F`, labels `#6B5410`). Clear: moss ring. No data: dashed grey ring. Nearby outside the search area (map only): grey fill with a `#5F6358` outline. Use these for constraint results and nothing else. Rye gold stays the appraisal-request colour, so it's never used for "within".
- **One vocabulary.** "On the site", "Within the search area", "Clear", "No data", from `CHECK_STATUS`. Don't paraphrase them per view.
- **Never colour alone.** Findings sit under group headings that say the result in words. The pip is reinforcement.
- **Section order.** Each section has a 1px charcoal rule above it, then the serif heading, a count standfirst, notes, a 3:2 map, the findings table (Constraint, What's there), then clear layers as outlined chips (hairline border, no fill, pip and name inside; the one place chips are allowed, at Eilish's request, 11 Nov 2026) under group headings: "Clear of the search area" (with nearest distance), "Nothing within 3 km", and "No data loaded".
- **Map labels** use Noto Sans from OpenFreeMap's glyph server, a third face allowed only on this map because the glyph server has no Montserrat.
- **Print** forces colours on (`print-color-adjust: exact`), keeps rows, maps and headings whole rather than whole sections, numbers pages, hides empty notes and shows a plain basemap attribution line.
- Client-facing labels avoid internal dataset codes. The internal review flag doesn't print.

### Sign-in and sign-up (3 Nov 2026)
Matches the website hero (toned down 4 Nov 2026): charcoal ground (`#2D2D2A`) with the React Bits Topography background (`src/Topography.jsx`, copied unmodified with its MIT + Commons Clause notice) drawing brand moss (`#6F8443`) contour lines at low glow, plus the hero grain (SVG noise, 55%) and a soft charcoal fade at the bottom. No product title or strapline: the type-set RTC logo (as on the website nav, cream, linking to the website) sits top left, and the form is a centred glass card matching the website (translucent cream gradient, 24px blur, fine light border, top highlight, radius 18) with cream text, see-through inputs with a moss focus ring, and a solid cream Continue button. Still under reduced motion; plain forest when WebGL2 is missing. Dark grey basemap lightened the same day to a mid charcoal (brightness-max 0.24).
