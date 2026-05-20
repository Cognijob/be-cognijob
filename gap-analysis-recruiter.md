
# GAP ANALYSIS: RECRUITER PAGES

Dokumen ini merangkum kesenjangan antara kebutuhan fitur UI/UX dengan implementasi *backend* saat ini untuk modul Recruiter pada Capstone Project Group 8.

---

### [DASHBOARD]

* **Stats Overview:** (Status: ❌ Missing)
* Kebutuhan: Belum ada endpoint untuk agregat (Lowongan Aktif, Total Pelamar, Perlu Review).
* Tindakan: Buat `GET /jobs/summary`.


* **Postingan Job Terbaru:** (Status: ⚠️ Partial)
* Kebutuhan: Respons list belum menyertakan jumlah pelamar.
* Tindakan: Tambahkan `applicantCount` & `pendingReviewCount` via JOIN/subquery.


* **Notifikasi Pelamar Baru:** (Status: ⚠️ Partial)
* Kebutuhan: Belum ada trigger otomatis ke recruiter saat ada aplikasi masuk.
* Tindakan: Hubungkan `createNotification` pada service `POST /applications`.



### [JOB]

* **Buat & Edit Lowongan:** (Status: ⚠️ Partial)
* Kebutuhan: Schema (Zod) belum mencakup field baru (benefits, level, skills).
* Tindakan: Update `createJobSchema` dan `updateJobSchema`.


* **List Lowongan:** (Status: ⚠️ Partial)
* Kebutuhan: UI memerlukan badge jumlah pelamar per job.
* Tindakan: Enrich response `GET /jobs` dengan subquery count pelamar.


* **Detail Lowongan (Recruiter View):** (Status: ⚠️ Partial)
* Kebutuhan: Field tambahan belum masuk dalam `jobSelect`.
* Tindakan: Tambahkan `benefits`, `level`, dan `skills` ke dalam query detail job.



### [APPLICANT]

* **Daftar Pelamar per Job:** (Status: 🔍 Cek)
* Tindakan: Validasi ulang logic `is_anonymous` (masking) dan status pelamar.


* **Filter & Sort Pelamar:** (Status: ❌ Missing)
* Tindakan: Implementasi query params `status`, `sort` (appliedAt), dan `order` pada endpoint list pelamar.


* **Detail Pelamar:** (Status: ⚠️ Partial)
* Kebutuhan: Belum ada join detail profil + riwayat status.
* Tindakan: Buat `GET /applications/:id/detail`.


* **Summary Stats (Kanban):** (Status: ❌ Missing)
* Tindakan: Buat `GET /jobs/:jobId/applications/summary` untuk breakdown status pelamar.



### [COMPANY]

* **Upload Logo Perusahaan:** (Status: ❌ Missing)
* Tindakan: Tambahkan kolom `logo_url` di DB dan buat endpoint `POST /company/logo` (Supabase Storage).


* **Daftar Recruiter (Members):** (Status: 🔍 Cek)
* Tindakan: Buat `GET /company/members` untuk menampilkan daftar anggota perusahaan.



### [NOTIFICATIONS & SETTINGS]

* **Notifikasi Real-Time:** (Status: ⚠️ Partial)
* Tindakan: Tambahkan `supabase.channel().send()` pada `notification.service.ts` agar update bersifat *real-time*.


* **Recruiter Preferences:** (Status: ❌ Missing)
* Tindakan: Buat tabel `recruiter_preferences` serta endpoint `GET/PUT /users/preferences`.