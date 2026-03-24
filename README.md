# VigoTech Website (Astro)

This project is the Astro migration of the VigoTech website.

## Commands

| Command                 | Action                                   |
| ----------------------- | ---------------------------------------- |
| `pnpm install`          | Install dependencies                     |
| `pnpm dev`              | Start local dev server                   |
| `pnpm dev --mockEvents` | Start dev with synthetic upcoming events |
| `pnpm check`            | Run Astro checks                         |
| `pnpm build`            | Type-check and build static site         |

## Data source

By default, the site reads source files from:

- `/works/vigotech/vigotech.github.io/static/vigotech.json`
- `/works/vigotech/vigotech.github.io/static/vigotech-generated.json`
- `/works/vigotech/vigotech.github.io/static/friends.json`

Override path with `VIGOTECH_DATA_DIR` if needed.

## Environment variables

- `VIGOTECH_MOCK_EVENTS`
  - Used in development to generate synthetic upcoming events when real events are not available.
  - Automatically set by `pnpm dev --mockEvents`.

- `VIGOTECH_CONFIG_DATA_DIR`
  - Optional override for local source JSON directory.
  - Default: `public`.
  - Used for `vigotech.json` and `friends.json`.

- `VIGOTECH_GENERATED_DATA_DIR`
  - Optional override for generated JSON directory.
  - Default: `/works/vigotech/vigotech.github.io/static`.
  - Used only for `vigotech-generated.json`.

- `GOOGLE_CALENDAR_API_KEY`
  - Used by `/api/calendar.json` to fetch events from VigoTech public Google Calendar.
  - If omitted, the Axenda block still renders and keeps the iCal download link, but no live events are shown.

## Group status

- Group active/inactive is now manual.
- Set `inactive: true` in source data for archived groups.

Copy `.env.example` to `.env` and customize values for local work.
