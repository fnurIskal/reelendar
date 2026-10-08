# Supabase connection checklist

The application-side integration is ready. Complete these steps after creating the Supabase project.

## 1. Project credentials

Copy the project URL and publishable key from Supabase project settings into `.env`:

```env
PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
```

Add the same variables to the production host. `SUPABASE_SERVICE_ROLE_KEY` is used only by the protected `/api/account` deletion endpoint. Never place it in browser code or a `PUBLIC_` variable.

Vite gives mode-specific files such as `.env.development.local` higher priority than `.env.local`. If one exists, keep its Supabase values in sync or remove the stale override before restarting the development server.

## 2. Database and Row Level Security

Open the Supabase SQL editor and run:

`supabase/migrations/202609110001_create_film_library.sql`

Then run:

`supabase/migrations/202609290001_add_tv_support.sql`

Finally run:

`supabase/migrations/202609290002_create_series_tracker.sql`

Then run:

`supabase/migrations/202610060001_add_series_notes.sql`

These create the film diary and watchlist tables plus the separate `series_library_items` and `episode_entries` tracker tables. They also configure indexes, triggers, and user-owned Row Level Security policies. Existing film rows are retained.

## 3. Authentication URLs

In **Authentication → URL Configuration** set the production site URL and add these redirect URLs:

- `http://localhost:5173/app`
- `http://localhost:5173/reset-password`
- `https://YOUR_DOMAIN/app`
- `https://YOUR_DOMAIN/reset-password`

## 4. Email authentication

Keep the email provider enabled. Configure the project sender and confirmation/recovery templates before production use. Recovery links must return to `/reset-password`.

## 5. Google authentication

Enable Google under **Authentication → Providers**, then add the Google OAuth client ID and secret. In Google Cloud, use the callback URL shown by Supabase, normally:

`https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`

Add the local and production domains to the authorized JavaScript origins.

## 6. Verification

Verify these flows in order:

1. Create an email account and confirm it.
2. Sign in and add a diary entry plus a watchlist item.
3. Sign out and sign back in; confirm both records return.
4. Request password recovery and set a new password.
5. Sign in with Google.
6. Open Profile and verify the language, avatar, sign-out confirmation, and account settings.
7. Confirm one user cannot read another user's rows.
8. Test account deletion with `SUPABASE_SERVICE_ROLE_KEY` configured on the server host.
