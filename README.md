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

## API Endpoints

Daftar lengkap endpoint API proyek ini beserta request body, status response, dan role akses dapat dilihat pada file dokumentasi khusus:
👉 **[API_ENDPOINTS.md](API_ENDPOINTS.md)**

---

## Cara Menjalankan Proyek

### 1. Menjalankan Lokal (Development)

1.  **Persiapan Environment**:
    Salin file `.env.example` menjadi `.env` dan sesuaikan nilainya (kredensial database PostgreSQL, JWT secret, Supabase URL, dll.).
    ```bash
    cp .env.example .env
    ```
2.  **Instalasi Dependensi**:
    ```bash
    npm install
    ```
3.  **Migrasi Database**:
    Jalankan migrasi Drizzle untuk membuat tabel dan kolom di database target:
    ```bash
    npm run db:migrate
    ```
4.  **Seed Data Pengujian**:
    Masukkan data awal ke database:
    ```bash
    npm run db:seed
    ```
5.  **Menjalankan Server Lokal**:
    Jalankan server dalam mode pemantauan perubahan (watch mode):
    ```bash
    npm run dev
    ```
    Server akan berjalan di `http://localhost:3000`. Dokumentasi Swagger interaktif dapat diakses langsung melalui `http://localhost:3000/docs`.

### 2. Menjalankan Pengujian (Testing)

Jalankan rangkaian pengujian integrasi (integration tests) menggunakan Vitest:
```bash
npm run test
```

---

## Cara Mendeploy ke Vercel

Proyek ini telah dikonfigurasi untuk dideploy ke platform **Vercel** menggunakan entrypoint Serverless Functions di `api/index.ts` dan konfigurasi perutean di `vercel.json`.

### Langkah-langkah Mendeploy via Vercel CLI:

1.  **Instal Vercel CLI** secara global (jika belum):
    ```bash
    npm install -g vercel
    ```
2.  **Login ke Akun Vercel**:
    ```bash
    vercel login
    ```
3.  **Inisialisasi & Deploy Proyek**:
    Jalankan perintah berikut di root folder proyek:
    ```bash
    vercel
    ```
    Ikuti langkah interaktif untuk menautkan atau membuat proyek baru di akun Vercel Anda.
4.  **Konfigurasi Environment Variables**:
    Pastikan semua variabel lingkungan berikut telah ditambahkan di dashboard Vercel proyek Anda (Settings > Environment Variables):
    *   `DATABASE_URL` (PostgreSQL Connection String)
    *   `DIRECT_URL` (Direct Connection String untuk migrasi)
    *   `JWT_SECRET` (Kunci rahasia JWT token)
    *   `JWT_EXPIRES_IN` (Masa berlaku token, contoh: `1d`)
    *   `SUPABASE_URL` (URL proyek Supabase)
    *   `SUPABASE_SERVICE_ROLE_KEY` (Key otorisasi backend Supabase)
    *   `SUPABASE_BUCKET` (Nama bucket storage, default: `cv-files`)
    *   `APP_BASE_URL` (URL utama aplikasi)
5.  **Deploy Production**:
    Setelah environment variables selesai dikonfigurasi, deploy ke production menggunakan:
    ```bash
    vercel --prod
    ```

---

## Catatan Penting

- Registrasi perekrut (Recruiter) mendukung pembuatan perusahaan baru maupun memilih perusahaan yang sudah ada (`existingCompanyId`).
- Kuota perekrut dalam satu perusahaan dibatasi maksimal 3 akun.
- Vercel menggunakan `api/index.ts` sebagai entrypoint serverless.
- Seluruh endpoint diatur menggunakan otorisasi berbasis peran (Role-Based Access Control).

