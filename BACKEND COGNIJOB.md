GAP ANALYSIS: DESAIN UI vs Backend CogniJob  
Based on Job Seeker Pages (Figma)

| Fitur / Screen | File Terkait | Status | Catatan |
| ----- | ----- | ----- | ----- |
| JOB LISTING (Browse & Detail) |  |  |  |
| Browse Jobs Filter: Lokasi, Skill, Level | public-jobs.routes.ts | Partial | Filter location, category, employment\_type ✓ — tapi filter skill dan level belum ada di schema job\_listings. Kolom level tidak ada di DB. Perlu tambah kolom level (Junior/Senior/Lead) di tabel job\_listings \+ migration. |
| Rekomendasi Job “Direkomendasikan Untukmu” | Belum ada | Missing | Desain menampilkan section khusus rekomendasi berbasis profil job seeker. Tidak ada endpoint `GET /public/jobs/recommended` maupun logic matching skill user vs job.  |
| Detail Job Deskripsi, Persyaratan, Benefit, Perusahaan | public-jobs.routes.ts | Partial | Field `description`, `requirements`, `salaryRange` ✓ — tapi field **benefit perusahaan** dan **level seniority** belum ada di schema.  |
| Bookmark Job | bookmarks.routes.ts | Sesuai | Route `POST/DELETE /bookmarks/:jobId` dan `GET /bookmarks` sudah ada dan berfungsi dengan baik.  |
| COMPANIES |  |  |  |
| Browse Companies Filter: Industri, Lokasi, Ukuran | companies.routes.ts | Sesuai | Filter ukuran perusahaan menggunakan `size` via `employee_count` sudah tersedia di `GET /companies`.  |
| Follow Perusahaan  Tombol “Ikuti” | companies.routes.ts | Sesuai | Route `POST/DELETE /companies/:id/follow` dan `GET /follows/companies` sudah tersedia. |
| Detail Perusahaan About, Lowongan Terbaru, Lokasi, Kontrak | companies.routes.ts | Sesuai | Endpoint `GET /companies/:id/public` menggunakan `companyPublicSelect` yang sudah meliputi `website`, `contactEmail`, `foundedAt`, `employeeCount`. |
| MESSAGES (Percakapan) |  |  |  |
| Daftar Percakapan  Preview Pesan, Unread Badge | conversations.routes.ts | Sesuai | Schema dan endpoint `GET /conversations` sudah mengembalikan payload yang sesuai untuk daftar chat. |
| Chat Real-Time Kirim & Terima Pesan | conversations.routes.ts | Sesuai | Sudah diupdate menggunakan Supabase Realtime via `supabase.channel().send()` dan route `PATCH /conversations/:id/read` sudah siap. |
| APPLICANT STATUS |  |  |  |
| Status Pipeline Submitted → Reviewed → Next Stage → Accepted/Rejected  | applicant-status.ts | Sesuai | 5 status enum cocok dengan desain. APPLICANT\_STATUS\_MAP dan VALID\_TRANSITIONS sudah benar sesuai flow desain.  |
| Summary Stats Count Per Status di Atas List | applications.routes.ts  | Missing | Desain menampilkan summary `Submitted: 1, Reviewed: 1, Next Stage: 1...`. Endpoint `GET /applications` hanya return list — tidak ada `GET /applications/summary` yang mengembalikan count per status.  |
| Detail Status Per Lamaran Timeline DILAMAR → UPDATE TERAKHIR, pesan kontekstual  | GET /applications/:id/status  | Partial | `appliedAt` dan `updatedAt` sudah ada ✓. Tapi desain menampilkan pesan kontekstual per status (contoh: "Selamat\! Offer sudah dikirim. Cek detail offer di Messages...") — belum ada logic untuk generate pesan ini di response.  |
| LAMAR PEKERJAAN |  |  |  |
| Form Lamaran Pilih CV Profil / Upload Baru, Toggle Anonymous | POST /applications  | Sesuai | `isAnonymous` ✓, `cvUrl` ✓. Logic cek job published & expired ✓. Prevent duplicate apply ✓.  |
| CV Upload Endpoint PDF maks 5MB | users.routes.ts | Sesuai | Endpoint `POST /users/cv` sudah ada dengan middleware validasi PDF dan ukuran <= 5MB ke Supabase Storage. |
| PROFILE JOB SEEKER |  |  |  |
| Data Profil Lengkap Skills, Pengalaman, Bidang Minat, Prestasi, Volunteering | `job_seeker_profiles` schema  | Sesuai | Tipe data sudah dimigrasi ke `jsonb` untuk mendukung struktur JSON dari frontend. |
| Edit Profile & Resume | users.routes.ts | Sesuai | Endpoint `GET /users/profile` dan `PUT /users/profile` sudah tersedia dan dimodifikasi untuk mendukung format `jsonb` baru. |
| NOTIFICATIONS |  |  |  |
| 4 Tipe Notifikasi Status: Update, Pesan Baru, Rekomendasi, Deadline | `notification_type` enum  | Sesuai | Enum `application_status`, `new_message`, `job_recommendation`, `deadline_reminder` cocok persis dengan 4 notifikasi di desain.  |
| List & Read Notifikasi | notifications.routes.ts | Sesuai | Route `GET /notifications` dan `PATCH /notifications/:id/read` maupun `PATCH /read-all` sudah ada. |
| Trigger Notifikasi Otomatis Saat Status Berubah, Pesan Masuk | notification.service.ts | Sesuai | Trigger untuk Application status, Deadline Reminder, dan Chat Message Broadcast sudah diimplementasikan. |

