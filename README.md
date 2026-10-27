# Project Arrival Hub

/skill:migrate-external-project Source: code archive. Migrate the attached project into Lovable.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://project-arrival-hub.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1e8d3dd0-bb0d-400d-9647-66eaef6d216a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Deploying to Netlify

1. Push this repo to GitHub and import it in Netlify (build settings come from `netlify.toml`).
2. Add the environment variables listed in `.env.example`.
3. Make sure the database schema in `drizzle/migrations/0000_migration.sql` has been applied to the Supabase project the variables point at.
