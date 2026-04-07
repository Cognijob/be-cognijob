# Cognijob Backend

Backend API for Cognijob using:

- Node.js
- TypeScript
- Express.js
- PostgreSQL
- Drizzle ORM
- JWT
- Zod
- Swagger
- Supabase Storage

## Setup

1. Copy `.env.example` to `.env`
2. Install dependencies:
   - `npm install`
3. Run migrations:
   - `npm run db:migrate`
4. Seed local data:
   - `npm run db:seed`
5. Start the server:
   - `npm run dev`
6. Open Swagger docs:
   - `http://localhost:3000/docs`

## Final folder structure

See [backend-structure.md].

## Dependencies to install

Main dependencies:

- `express`
- `cors`
- `helmet`
- `dotenv`
- `drizzle-orm`
- `pg`
- `jsonwebtoken`
- `bcrypt`
- `zod`
- `multer`
- `@supabase/supabase-js`
- `pino`
- `pino-http`
- `pino-pretty`
- `swagger-jsdoc`
- `swagger-ui-express`

Dev dependencies:

- `typescript`
- `tsx`
- `drizzle-kit`
- `vitest`
- `supertest`
- `@types/node`
- `@types/express`
- `@types/cors`
- `@types/jsonwebtoken`
- `@types/bcrypt`
- `@types/multer`
- `@types/pg`
- `@types/swagger-jsdoc`
- `@types/swagger-ui-express`
- `@types/supertest`

## Main modules

- Auth
- User profile
- Company
- Job listings
- Job applications
- Bookmarks
- Workplace ratings
- Notifications

## Notes

- Recruiter registration supports existing company selection or new company creation.
- Company membership is limited to 3 recruiters.
- Applicant-facing status is mapped from recruiter-facing status.
- Notification MVP is in-app only.
- Vercel uses [`api/index.ts`] as the serverless entrypoint.
- Baseline migration is stored in [`drizzle/0000_init.sql`].
- Seed script is stored in [`src/db/seeds/seed.ts`].
- Basic tests are stored in [`src/tests`].
