# GAS Workflow

- Use CLASP as the bridge between local files and Google Apps Script.
- Work from the `apps-script` folder when running `clasp` commands.
- Ignore `.clasp.json` in git.
- Use the named CLASP profile `ivan` for this project's Google-side operations.
- Treat script `10R4EHwxFWyMfSVxmYDyIWF-sNaGbtFv9zxa7vviguI64qk8ZDjDYAKFB` as the canonical Apps Script target.
- Use `setupApplicationSpreadsheet()` to create or normalize the new spreadsheet.
- Use `setUserPinByEmail()` to set initial login PIN hashes safely.
- Keep `doGet` limited to `health`.
- Route app behavior through `doPost` actions only.
