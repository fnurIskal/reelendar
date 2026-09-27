# Supabase connection checklist

The application-side integration is ready. Complete these steps after creating the Supabase project.

## 1. Project credentials

Copy the project URL and publishable key from Supabase project settings into `.env`:

```env
PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Add the same variables to the production host. Never place a service-role key in browser code or a `PUBLIC_` variable.

Vite gives mode-specific files such as `.env.development.local` higher priority than `.env.local`. If one exists, keep its Supabase values in sync or remove the stale override before restarting the development server.

## 2. Database and Row Level Security

Open the Supabase SQL editor and run:

`supabase/migrations/202609110001_create_film_library.sql`

This creates `diary_entries` and `watchlist_items`, their indexes, update trigger and user-owned Row Level Security policies.

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
6. Open Account and export the library JSON.
7. Confirm one user cannot read another user's rows.

Account deletion is intentionally not implemented in the browser. It requires a protected server-side function using elevated Supabase privileges.
