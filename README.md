# Reelendar

Reelendar is a cinematic React film diary and separate TV series tracker powered by TMDB and Supabase.

## Current features

- Monthly, yearly, and daily calendar views
- A dedicated film diary with monthly, yearly, and daily views
- A separate series calendar for logging episodes by day
- Series shelves for watching, waiting for a new season, completed, and dropped titles
- Animated film/series mode switcher
- TMDB movie and TV search in their respective areas
- Email/password authentication with Supabase Auth
- Password recovery and Google OAuth-ready authentication
- RLS-protected cloud sync for the film diary, watchlist, series library, and episode history
- Automatic migration of existing local film and series data after sign-in
- Profile analytics, notes, language, avatar, and account controls
- Vitest integration tests for recovery, OAuth and export flows
- Secure server-side TMDB proxy on Vercel

## Setup

```bash
npm install
copy .env.example .env
npm run dev
```

Configure `.env`:

```env
TMDB_ACCESS_TOKEN=your_token
PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key
```

`TMDB_ACCESS_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY` are server-only. The Supabase publishable key is safe for the browser when Row Level Security policies are enabled.

## Supabase connection

Follow [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) to create the project, run the database migration, configure redirect URLs and enable Google OAuth.

## Test

```bash
npm test
```

## Interface copy

Keep product copy concise and neutral. Cinematic styling may appear in visual details, but avoid assigning the user production roles or using role-play language such as “director,” “cast,” or “roll camera.”

TMDB provides movie and TV data and imagery. This project is not endorsed or certified by TMDB.
