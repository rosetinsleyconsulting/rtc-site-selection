---
target: appraisal report builder
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
timestamp: 2026-11-11T14-17-54Z
slug: src-reportbuilder-jsx
---
# Critique: appraisal report builder (src/ReportBuilder.jsx)

Method: dual-agent. Score 20/40 (Acceptable). Heuristics: status 2, real world 3, control 1, consistency 2, error prevention 1, recognition 3, efficiency 1, minimalism 3, error recovery 2, help 2.

## Priority issues
- [P0] Print loses its result colours (no print-color-adjust; pips and swatches are backgrounds). Section-level break-inside pushes long sections to the next page. Maps aren't resized before printing. -> harden
- [P1] Preview is up to 1080px wide on screen vs 180mm in print. The map is a 280px-high letterbox (3.6:1), so the rings fill about a quarter of the width. Fix: preview at 180mm, map aspect-ratio 3/2, optionally drop maps for all-clear sections. -> layout
- [P1] No deliverable furniture (RTC identity, reference, page numbers, sources/licence attribution for NE/HE/EA/OS). Builder text and the internal review flag print. -> clarify, harden
- [P1] Editor column unreadable in dark mode (default): textarea #fff with a pale --charcoal; .rb-layer about 2:1. The preview is pinned, the editor isn't. -> polish
- [P2] Inside table repeats the radius and nearest distance; count line counts layers but the legend counts features; vocabulary drifts. Cut to Constraint | Detail with the radius as meta; one vocabulary. -> distill
- Also P1: no persistence (autosave, beforeunload guard, confirm before a preset overwrites custom radii).

## Detector
20 unique advisory findings: 13 real (9 undocumented report status colours, 3 off-scale 7px radii, 2 #fff fills; 1 of the 13 is out of scope in main.jsx), 7 false positives (rye tints, print white, legend swatch radii). Browser overlay skipped: auth-gated route.

## Personas
Alex: no numeric radius entry; nav counts show ticked layers, not findings; all maps refit on every keystroke (sections={[section]} breaks memoisation).
Sam: identical slider names; on-site vs within differ by colour only; disclaimer about 2.5:1; false chevron affordance.
Consultant: no draft/final state; must enable background graphics to print; branding and attributions added by hand.

## Minor
Pip hanging indent; pip alignment inconsistent between table and clear list; dead CSS; clear-list pips carry no information; figures orphan; pip key duplicates the legend; rings unlabelled; outside grey faint; attribution prints as a button; disclaimer uses appraisal gold; nav rose at zero.
