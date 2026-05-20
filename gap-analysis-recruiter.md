# CAPSTONE PROJECT GROUP 8 - GAP ANALYSIS TECRUITER

## DATABASE SCHEMA REFERENCE (schema.ts)
- Users Table: users (userId: uuid, name: varchar, email: varchar, isAnonymous: boolean)
- Applications Table: applications (applicationId: uuid, jobId: uuid, userId: uuid, status: enum, createdAt: timestamp, cvUrl: text)
- Companies Table: companies (companyId: uuid, logoUrl: text)
- Recruiter Preferences: Need new table (recruiter_preferences)

## MISSING & PARTIAL FEATURES TO IMPLEMENT

### 1. [APPLICANT] Filter & Sort Pelamar
- File: src/routes/applications.routes.ts
- Requirement: Update endpoint `GET /jobs/:jobId/applications` agar mendukung query params `status` (filter berdasarkan status lamaran) serta `sort=appliedAt` dan `order=asc|desc`.

### 2. [APPLICANT] Detail Pelamar & Masking Anonim
- File: src/routes/applications.routes.ts
- Requirement: Buat endpoint baru `GET /applications/:applicationId/detail`. 
- Logic: Ambil data lamaran, join dengan `users` dan `jobSeekerProfiles`. JIKA `applications.isAnonymous` bernilai true, maka data user (nama, email, photoUrl) harus di-masking menjadi "Anonymous Candidate", "hidden@cognijob.com", dan null pada list maupun detail.

### 3. [APPLICANT] Summary Stats Pelamar per Job (Kanban Board)
- File: src/routes/jobs.routes.ts atau src/routes/applications.routes.ts
- Requirement: Buat endpoint `GET /jobs/:jobId/applications/summary`.
- Logic: Lakukan `count()` dan `groupBy` berdasarkan `applications.status` untuk jobId tersebut agar UI Kanban bisa menampilkan jumlah pelamar per stage (submitted, reviewed, next_stage, accepted, rejected).

### 4. [COMPANY] Upload Logo Perusahaan
- File: src/routes/company.routes.ts
- Requirement: Buat endpoint `POST /company/logo`.
- Logic: Gunakan upload middleware ke Supabase Storage, dapatkan publicUrl, lalu update kolom `logoUrl` di tabel `companies` berdasarkan companyId milik recruiter yang sedang login.

### 5. [SETTINGS] Recruiter Preferences
- File: src/db/schema.ts & src/routes/users.routes.ts
- Requirement: 
  1. Tambahkan skema tabel `recruiterPreferences` di `schema.ts` (fields: preferenceId, userId, language, notificationEnabled).
  2. Buat endpoint `GET /users/preferences` dan `PUT /users/preferences` di `users.routes.ts`.