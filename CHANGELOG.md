# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-03-25

### Added
- **Rules** — full condition/action builder with support for all actual-http-api operations (`contains`, `matches`, `oneOf`, `is`, `isNot`, `gt`, `lt`, `gte`, `lte`, `isapprox`, `isbetween`, `onBudget`, `offBudget`)
- **Accounts** — inline rename, toggle on/off budget status, CSV import/export
- **Payees** — inline rename, delete, CSV import/export
- **Categories** — inline rename, show/hide, reorder within groups, CSV import/export
- **Staged editing** — all changes held locally until Save; supports undo/redo
- **Multi-connection support** — save and switch between multiple Actual Budget servers; staged data and query cache are scoped per connection
- **Draft panel** — live summary of pending creates, updates, and deletions with per-entity error display
- **CSV import/export** — UTF-8 with BOM for Excel compatibility across all entity pages
- **Connection naming** — optional friendly name for each saved connection
- **Docker support** — dev compose (Turbopack, named volume cache) and production multi-stage Dockerfile
