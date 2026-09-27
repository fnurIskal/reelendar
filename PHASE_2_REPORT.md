# Reelendar — Phase 2 report

## Completed work

| Work | What it is used for |
| --- | --- |
| Password recovery request | Sends a Supabase recovery email without revealing whether an account exists. |
| `/reset-password` page | Accepts the recovery session and lets the user choose a new password. |
| Google OAuth entry point | Starts Google sign-in and returns the user to `/app`. Provider credentials will be connected in Supabase. |
| Account settings panel | Displays the signed-in email and library totals, edits the optional display name stored in Supabase user metadata, and provides sign-out. |
| Signed-in profile control | Shows the user's Google image when available, otherwise a name/email initial, and opens the existing account panel. |
| Registration success toast | Confirms account creation, explains email verification when required, and carries the success message across an immediate redirect. |
| JSON library export | Downloads diary dates, films, ratings, notes and watchlist in a versioned portable format. |
| Vercel reset route | Ensures direct visits and email redirects to `/reset-password` load the React application. |
| Automated tests | Verifies export ordering, password recovery redirect configuration and Google OAuth redirect configuration. |
| Supabase setup checklist | Documents credentials, migration, RLS, redirect URLs, email configuration, Google OAuth and verification steps. |

## Main files

- `src/pages/LoginPage.tsx`: email auth, password recovery and Google OAuth actions.
- `src/pages/ResetPasswordPage.tsx`: recovery-session password update screen.
- `src/App.tsx`: account settings, profile metadata and export entry point.
- `src/lib/account.ts`: deterministic export document creation and browser download.
- `src/lib/supabase.ts`: Supabase client and diary/watchlist persistence.
- `supabase/migrations/202609110001_create_film_library.sql`: database tables, indexes and RLS policies.
- `src/pages/LoginPage.test.tsx`: recovery and Google OAuth integration tests.
- `src/lib/account.test.ts`: export-format test.
- `SUPABASE_SETUP.md`: connection and production configuration checklist.

## Supabase connection status

- The real project URL and publishable key are configured locally in the ignored `.env.local` file.
- The development-specific `.env.development.local` override was also updated; it had been pointing the running Vite server at an older Supabase project and caused `Failed to fetch` during registration.
- The Supabase Auth endpoint accepts the credentials and email authentication is enabled.
- Google authentication is currently disabled in the Supabase project.
- `diary_entries` and `watchlist_items` are not present yet; run the prepared SQL migration once in Supabase SQL Editor.

## Remaining Supabase dashboard work

- Run the SQL migration against the real database.
- Production site and recovery redirect URLs.
- Google OAuth client ID and secret.
- Email sender and authentication templates.
- End-to-end verification with real accounts.

## Security boundary

Account deletion remains deferred because deleting an Auth user requires a protected server-side function with elevated privileges. A service-role key must never be shipped to the browser.
