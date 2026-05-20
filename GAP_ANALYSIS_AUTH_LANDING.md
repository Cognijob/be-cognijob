# Gap Analysis: Landing Page & Auth Screen vs Backend CogniJob

Diperbarui berdasarkan `schema.ts`, `auth.schema.ts`, dan `auth.routes.ts`

---

## Legenda Status

| Status | Keterangan |
| --- | --- |
| ✅ Sesuai | Field/endpoint sudah tersedia dan cocok dengan desain |
| ⚠️ Partial | Sebagian tersedia, namun ada gap yang perlu ditangani |
| ❌ Missing | Belum ada di backend, perlu ditambahkan |

---

## Landing Page — Navbar & Hero

| Fitur / Screen | File Terkait | Status | Catatan |
| --- | --- | --- | --- |
| Navbar: Masuk & Daftar | `auth.routes.ts` | ✅ Sesuai | Navigasi murni frontend ke halaman login dan register. Tidak memerlukan endpoint baru. |
| Hero CTA: "Mulai Melamar" & "Lihat cara kerjanya" | — | ✅ Sesuai | Scroll atau navigasi ke section lain. Tidak memerlukan backend. |
| Statistik: 99.7%, 53%, 1 Platform | — | ⚠️ Partial | Saat ini hardcoded di frontend. Tidak ada `GET /public/stats`. Jika ingin dinamis di masa depan, perlu endpoint tersendiri. |

---

## Landing Page — Konten Statis

| Fitur / Screen | File Terkait | Status | Catatan |
| --- | --- | --- | --- |
| Cara Kerja, Keunggulan, Footer | — | ✅ Sesuai | Konten marketing statis. Fitur inti yang dipromosikan (anonymous apply, company transparency) sudah didukung backend. |
| FAQ Accordion (3 pertanyaan) | — | ✅ Sesuai | Konten statis hardcoded. Tidak memerlukan endpoint. |

---

## Auth — Role Selection Screen

| Fitur / Screen | File Terkait | Status | Catatan |
| --- | --- | --- | --- |
| Pilih Role: Job Seeker atau Recruiter | `schema.ts` — `userRoleEnum` | ✅ Sesuai | DB sudah punya `userRoleEnum("job_seeker", "recruiter")` dan kolom `role` di tabel `users`. Layar pemilihan role di frontend cukup meneruskan nilai ini ke form register yang sesuai. |

---

## Auth — Register Job Seeker

| Fitur / Screen | File Terkait | Status | Catatan |
| --- | --- | --- | --- |
| Field: Nama Depan + Nama Belakang | `auth.schema.ts` — `jobSeekerRegistrationSchema`, `schema.ts` — `users.name` | ❌ Missing | Desain memisahkan **Nama Depan** dan **Nama Belakang** menjadi dua input field. Backend hanya punya satu field `name varchar(150)` di tabel `users`, dan schema validasi juga hanya `name: z.string()`. **Dua pilihan solusi:** (1) Frontend menggabungkan keduanya menjadi satu string sebelum dikirim ke API, atau (2) Tambah kolom `first_name` + `last_name` di DB dan update schema validasi. |
| Field: Email | `auth.schema.ts` — `email: z.email()` | ✅ Sesuai | Ada di schema validasi dan kolom `email varchar(255) unique` di DB. |
| Field: Password | `auth.schema.ts` — `passwordSchema` | ✅ Sesuai | Min 8, max 100 karakter. Disimpan sebagai `password_hash` di DB. Desain belum menampilkan hint kekuatan password — bisa dipertimbangkan untuk UX. |
| Field: Lokasi (Kota & Provinsi) | `auth.schema.ts` — `jobSeekerRegistrationSchema`, `schema.ts` — `users` | ❌ Missing | Desain memiliki input lokasi (kota & provinsi) di form register Job Seeker. Field ini **tidak ada** di `jobSeekerRegistrationSchema` maupun di tabel `users`. Lokasi ada di tabel `companies` dan `job_listings`, namun tidak di `users` atau `job_seeker_profiles`. **Solusi:** Tambah kolom `location varchar(150)` ke tabel `job_seeker_profiles` atau `users`, lalu tambahkan ke schema validasi register. |
| Field: Nomor WhatsApp | `auth.schema.ts` — `jobSeekerRegistrationSchema`, `schema.ts` — `users` | ❌ Missing | Desain mencantumkan field **Nomor WhatsApp** dengan catatan "Pastikan nomor aktif agar dapat dihubungi perusahaan". Field ini **tidak ada** di schema validasi maupun tabel `users` atau `job_seeker_profiles`. **Solusi:** Tambah kolom `whatsapp_number varchar(20)` ke tabel `users` atau `job_seeker_profiles`, tambahkan validasi format nomor (misal: regex `^\+62`) di schema. |
| Field opsional: Gender, Age, Photo | `auth.schema.ts` — `gender`, `age`, `photoUrl` | ✅ Sesuai | Tersedia di schema validasi dan DB, semua opsional. Tidak ditampilkan di form register desain — sesuai, kemungkinan diisi saat edit profil. |

---

## Auth — Register Recruiter

| Fitur / Screen | File Terkait | Status | Catatan |
| --- | --- | --- | --- |
| Field: Nama (Recruiter) | `auth.schema.ts` — `name: z.string()` | ✅ Sesuai | Tersedia di `recruiterRegistrationSchema` dan DB. |
| Field: Email & Password | `auth.schema.ts` | ✅ Sesuai | Sama dengan job seeker — sudah ada dan tervalidasi. |
| Field: Nama Perusahaan | `auth.schema.ts` — `recruiterRegistrationSchema`, `schema.ts` — `companies`, `companyRecruiters` | ⚠️ Partial | Backend sudah mendukung dua mode via `companyMode: "existing" \| "new"`: mode `"new"` membuat record baru di tabel `companies`, mode `"existing"` recruiter bergabung ke perusahaan yang ada via `existingCompanyId`. **Gap:** Desain hanya menampilkan satu input "Perusahaan" — tidak ada UI untuk memilih `companyMode`. Frontend perlu menambahkan logika: apakah input perusahaan adalah teks bebas (create new) atau dropdown/search (join existing). Tanpa ini, flow dua mode di backend tidak bisa dimanfaatkan. |
| Field opsional Perusahaan: industry, location, workplaceTag, description | `auth.schema.ts` — `newCompany` object | ✅ Sesuai | Semua opsional di schema. Tidak ditampilkan di form register — sesuai, diisi di halaman profil perusahaan. |

---

## Auth — Login

| Fitur / Screen | File Terkait | Status | Catatan |
| --- | --- | --- | --- |
| Form Login: Email + Password | `auth.schema.ts` — `loginSchema` | ✅ Sesuai | `loginSchema` hanya berisi `email` dan `password` — tepat sesuai desain form. |
| Error state: "Email atau kata sandi salah" | `lib/http-error.ts` | ⚠️ Partial | `http-error.ts` tersedia untuk standardisasi error. Namun karena `auth.controller.ts` belum dibuat, belum bisa dipastikan apakah pesan error yang dikembalikan API cocok dengan teks di desain. **Risiko:** Jika controller mengembalikan pesan generik ("Unauthorized" / "Invalid credentials"), frontend perlu melakukan mapping pesan sendiri agar sesuai teks desain dalam Bahasa Indonesia. |

---

## Auth — Forgot Password

| Fitur / Screen | File Terkait | Status | Catatan |
| --- | --- | --- | --- |
| Form: Input email → kirim link reset | `auth.schema.ts` — `forgotPasswordSchema`, `schema.ts` — `passwordResetTokens` | ⚠️ Partial | Infrastruktur DB sudah siap: tabel `password_reset_tokens` dengan kolom `token_hash`, `expires_at`, `used_at`. Schema validasi `forgotPasswordSchema` dan `resetPasswordSchema` sudah ada. **Yang masih missing:** (1) Endpoint `POST /auth/forgot-password` belum diimplementasikan — hanya schema-nya yang ada. (2) Endpoint `POST /auth/reset-password` juga belum ada implementasinya. (3) Integrasi email sender (SMTP / Resend / SendGrid) untuk mengirim link belum terlihat di struktur backend. Ini yang paling mendekati selesai — tinggal implementasi controller dan integrasi email. |

---

## Ringkasan Prioritas Perbaikan

### 🔴 Missing — Harus ditambah sebelum frontend bisa jalan

| # | Aksi | File yang Diubah |
| --- | --- | --- |
| 1 | Tambah kolom `whatsapp_number varchar(20)` di tabel `users` atau `job_seeker_profiles` + validasi regex format nomor di `auth.schema.ts` | `schema.ts`, `auth.schema.ts` |
| 2 | Tambah kolom `location varchar(150)` untuk job seeker di tabel `users` atau `job_seeker_profiles` + tambahkan ke `jobSeekerRegistrationSchema` | `schema.ts`, `auth.schema.ts` |
| 3 | Keputusan nama depan/belakang: split jadi `first_name` + `last_name` di DB, atau frontend menggabungkan sebelum kirim ke API | `schema.ts`, `auth.schema.ts` (jika split) |

### 🟡 Partial — Perlu keputusan atau implementasi lanjutan

| # | Aksi | File yang Diubah |
| --- | --- | --- |
| 4 | Implementasi controller forgot password + integrasi email sender | `auth.controller.ts` (baru), `auth.routes.ts`, `.env` |
| 5 | Diskusi desain register recruiter: tambah UI pemilihan `companyMode` (create new vs join existing) agar dua mode backend bisa dimanfaatkan | Frontend form register recruiter |
| 6 | Pastikan response error login menggunakan Bahasa Indonesia, atau frontend melakukan mapping pesan dari response API | `auth.controller.ts` (baru) |