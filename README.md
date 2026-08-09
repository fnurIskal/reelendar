# Reelendar Frontend

Reelendar is a cinematic React film diary powered by the TMDB API.

## Current features

- Monthly, yearly, and daily calendar views
- TMDB movie search and monthly releases
- Vertical poster calendar entries
- Notes and 0.5-step ratings
- Animated note preview and delete confirmation
- Session-based watchlist
- Future-date restrictions and responsive UI

## Setup

```bash
npm install
copy .env.example .env
npm run dev
```

Add your TMDB API Read Access Token to `.env`:

```env
VITE_TMDB_ACCESS_TOKEN=your_token
```

## Planned

- ASP.NET Core Web API
- PostgreSQL and EF Core persistence
- Identity login with secure cookies
- Persistent diary and watchlist
- Backend TMDB proxy, validation, tests, and deployment

TMDB provides movie data and imagery. This project is not endorsed or certified by TMDB.
