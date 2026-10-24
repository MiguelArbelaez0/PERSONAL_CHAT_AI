# Identity detection and onboarding (v1.2.0)

The extension now requires a confirmed Stripchat model account and a complete account-scoped profile before response generation is enabled. A new installation starts without a personal identity or a preselected personality. The wizard stores its step and draft profile identifier in Chrome local storage; profile data itself remains in the existing FastAPI profile store.

## Identity handling

`extension/account-detector.js` only inspects semantic identity signals in the page's global `header` or `[role="banner"]`. It does not read cookies, credentials, or tokens. It excludes nodes inside chat and conversation containers. A unique candidate is still shown for confirmation during initial setup. Multiple candidates, missing signals, or a name collision require explicit selection or manual entry. Platform IDs are used to match accounts; artist names are not unique keys.

Stripchat may change its DOM and its accessible labels. The detector intentionally falls back to manual confirmation when it cannot establish one unambiguous candidate. Its selectors and identity signals have only been checked against deterministic DOM fixtures in this release; a live Stripchat/Chrome validation is still required before claiming site-level detection reliability.

If Stripchat exposes no stable account ID, two different accounts with the same artist name cannot be distinguished from the DOM alone. The extension does not treat the stage name as a unique key. That deployment must rely on explicit account confirmation and live validation of the account-menu signal; if the signal becomes ambiguous or loses a previously available stable ID, generation is locked until confirmation.

## Account-scoped API

The extension uses the account and profile contracts already implemented in Phase 2:

- `GET /api/accounts` lists local model accounts.
- `POST /api/accounts` and `PUT /api/accounts/{account_id}` create or confirm the selected identity.
- `GET /api/accounts/{account_id}/profiles` checks readiness and loads account-scoped profiles.
- `POST`/`PUT /api/accounts/{account_id}/profiles[/{profile_id}]` save onboarding progress and completed profiles.

Generation requests include the active `model_account_id`, and remain disabled until the backend returns a confirmed account with an active, onboarding-complete profile. No automatic message sending is introduced.

## Manual Chrome validation

1. Load the unpacked `extension/` directory in Chrome with the local backend running.
2. With a fresh local database, open Stripchat and confirm that the wizard appears and generation is disabled.
3. Verify a unique account signal is displayed for confirmation; if the page does not expose a reliable signal, enter the stage name manually.
4. Complete all eight steps, close and reopen the panel midway once, and verify that the saved step resumes.
5. Finish the wizard and verify the header reads `Asistente de [NombreArtístico]`, then edit preferences under “Mi asistente”.
6. Switch Stripchat accounts and confirm the current suggestions/context are cleared and setup is required before generation resumes.
7. Verify each generated response remains a draft requiring human review and copying; the extension must not send it automatically.

Do not use a real user database for first-run testing. Use an isolated backend database and synthetic account data.
