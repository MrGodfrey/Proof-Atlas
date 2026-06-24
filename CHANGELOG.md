# Changelog

All notable changes to Proof Atlas are documented here.

This project follows the common open-source convention of grouping changes by
version and release date, with user-facing changes organized as Added, Changed,
Fixed, and Documentation.

## [0.1.5] - 2026-06-24

### Added

- Added a proof-tree Generated View for route files, with a route summary,
  selected proof path, narrative notes, open-route diagnostics, and a
  Foundation / context section.
- Added route proof-tree tests and regenerated the semidiscrete generated views
  for null controllability and partial null controllability.

### Changed

- Simplified generated routes to the proof-tree/narrative workflow and removed
  the older Linear / Graph generated-view tabs.
- Reordered detail-panel Relations so proof-reading relationships appear first:
  Proved by, Used by, Proves, then supporting/background relations.
- Updated route and generated-view documentation in the English and Chinese
  wiki pages.

### Fixed

- Fixed object-card expand/collapse controls so temporary UI state does not
  persist when re-entering a view.
- Fixed proof-tree disclosure controls so clicking the arrow does not conflict
  with opening the object in the right detail panel.
- Fixed Foundation / context disclosure styling so it matches proof-tree
  chevron controls and is visually centered.
- Fixed center-pane scrolling so clicking a Markdown object link opens the
  linked object in the right detail panel without jumping the center view back
  to the focused card.

## [0.1.4] - 2026-06-19

### Added

- Added static Cloudflare demo support, including demo-data generation,
  read-only demo mode, and the hosted Pages deployment workflow.
