---
name: pos-kantin
description: Build, extend, or maintain the POS Kantin monorepo that uses vanilla HTML/CSS/JS for the frontend, Google Apps Script for the backend, Google Sheets as the database, Netlify for frontend hosting, and GitHub for version control. Use when working inside the `pos-kantin` repo, updating its docs, wiring CLASP workflows, implementing Apps Script actions, or preserving the project-specific folder structure and migration rules.
---

# POS Kantin

Use this skill when the task is specific to the `pos-kantin` project.

## Core rules

- Keep frontend code framework-free and multi-page.
- Keep Apps Script code modular under `apps-script/`.
- Keep all user-facing docs in Bahasa Indonesia.
- Treat legacy Drive spreadsheets as read-only references.
- Prefer the normalized spreadsheet schema documented in `references/spreadsheet-mapping.md`.
- Do not commit live `.clasp.json`, spreadsheet IDs, Web App URLs, or secrets.

## Workflow

1. Read `references/repo-conventions.md` before changing structure or file placement.
2. Read `references/gas-workflow.md` before touching Apps Script or CLASP docs.
3. Read `references/git-workflow.md` before changing git or GitHub guidance.
4. Read `references/spreadsheet-mapping.md` before changing schema, migration notes, or API field names.

## Project defaults

- Admin utama adalah Evander.
- Frontend default source may use mock mode until the real Apps Script Web App URL is configured.
- API contract stays on `{ action, token?, payload? }` with `{ success, message, data }` responses.

