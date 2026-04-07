# Backend Structure

```text
New project/
|-- api/
|   |-- index.ts
|-- docs/
|   |-- backend-structure.md
|-- drizzle/
|   |-- 0000_init.sql
|   |-- meta/
|       |-- _journal.json
|-- src/
|   |-- app.ts
|   |-- index.ts
|   |-- config/
|   |   |-- env.ts
|   |-- controllers/
|   |   |-- applications.controller.ts
|   |   |-- auth.controller.ts
|   |   |-- bookmarks.controller.ts
|   |   |-- companies.controller.ts
|   |   |-- jobs.controller.ts
|   |   |-- notifications.controller.ts
|   |   |-- ratings.controller.ts
|   |   |-- users.controller.ts
|   |-- db/
|   |   |-- index.ts
|   |   |-- schema.ts
|   |   |-- seeds/
|   |       |-- seed.ts
|   |-- lib/
|   |   |-- access.ts
|   |   |-- api-response.ts
|   |   |-- applicant-status.ts
|   |   |-- http-error.ts
|   |   |-- jwt.ts
|   |   |-- logger.ts
|   |   |-- password.ts
|   |   |-- profile-completeness.ts
|   |   |-- supabase.ts
|   |   |-- swagger.ts
|   |-- middlewares/
|   |   |-- authenticate.ts
|   |   |-- authorize.ts
|   |   |-- error-handler.ts
|   |   |-- upload.ts
|   |   |-- validate.ts
|   |-- routes/
|   |   |-- applications.routes.ts
|   |   |-- auth.routes.ts
|   |   |-- bookmarks.routes.ts
|   |   |-- companies.routes.ts
|   |   |-- index.ts
|   |   |-- jobs.routes.ts
|   |   |-- notifications.routes.ts
|   |   |-- ratings.routes.ts
|   |   |-- users.routes.ts
|   |-- schemas/
|   |   |-- applications.schema.ts
|   |   |-- auth.schema.ts
|   |   |-- bookmarks.schema.ts
|   |   |-- companies.schema.ts
|   |   |-- jobs.schema.ts
|   |   |-- notifications.schema.ts
|   |   |-- ratings.schema.ts
|   |   |-- users.schema.ts
|   |-- modules/
|   |   |-- applications/
|   |   |-- auth/
|   |   |-- bookmarks/
|   |   |-- companies/
|   |   |-- jobs/
|   |   |-- notifications/
|   |   |-- ratings/
|   |   |-- users/
|   |-- services/
|   |   |-- notification.service.ts
|   |-- tests/
|   |   |-- applicant-status.test.ts
|   |   |-- health.test.ts
|   |   |-- setup.ts
|   |-- types/
|       |-- express/
|           |-- index.d.ts
|-- .env.example
|-- .gitignore
|-- drizzle.config.ts
|-- package.json
|-- README.md
|-- schema.sql
|-- tsconfig.json
|-- vercel.json
|-- vitest.config.ts
```

## Notes

- `controllers`, `routes`, and `schemas` now exist to match the team-preferred layout in the reference image.
- Domain logic is still temporarily implemented in `src/modules/` to avoid breaking working code during refactor.
- The next cleanup step would be moving handler bodies from `src/modules/*/*.routes.ts` into real controllers and services.
- `schema.sql` is the raw SQL source of truth for direct database setup.
- `drizzle/0000_init.sql` is the baseline migration committed to the repo.
- `src/db/schema.ts` is the Drizzle schema used by the application.
- `src/db/seeds/seed.ts` provides local development seed data.
- `src/tests/` contains the basic automated test suite.
