# CogniJob API Endpoints Documentation

Dokumentasi ini menyediakan daftar lengkap endpoint API, peran (role) yang diizinkan untuk mengakses, skema request body, dan response status.

---

## Format Response Standar

Semua response dari backend CogniJob dibungkus dalam format standar berikut:

### Success Response (Status 200/201)
```json
{
  "success": true,
  "message": "Deskripsi pesan sukses",
  "data": { ... } // Atau array, null, dll.
}
```

### Error Response (Status 400/401/403/404/409/500)
```json
{
  "success": false,
  "message": "Deskripsi detail kesalahan"
}
```

---

## Daftar Endpoint Lengkap Berdasarkan Modul

### 1. Authentication (Autentikasi & Registrasi)
Prefix: `/auth`

| Method | Path | Role Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `POST` | `/register/job-seeker` | Public | Registrasi Pencari Kerja (Job Seeker) |
| `POST` | `/register/recruiter` | Public | Registrasi Perekrut (Recruiter) |
| `POST` | `/login` | Public | Login Pengguna |
| `POST` | `/forgot-password` | Public | Mengirimkan link reset kata sandi |
| `POST` | `/reset-password` | Public | Mengatur ulang kata sandi dengan token |
| `GET` | `/me` | All Authenticated | Mendapatkan profil sesi login aktif |

#### Detail Request & Response Auth

*   **POST `/register/job-seeker`**
    *   **Request Body**:
        ```json
        {
          "firstName": "Nadia",
          "lastName": "Jasmine",
          "email": "nadia@example.com",
          "password": "Password123",
          "gender": "Female", // optional
          "age": 22, // optional
          "photoUrl": "https://...", // optional
          "location": "Jakarta, DKI Jakarta",
          "whatsappNumber": "081234567890" // format regex Indonesia
        }
        ```
    *   **Response (201 Created)**:
        ```json
        {
          "success": true,
          "message": "Job seeker registered successfully",
          "data": {
            "user": {
              "userId": "uuid",
              "name": "Nadia Jasmine",
              "firstName": "Nadia",
              "lastName": "Jasmine",
              "email": "nadia@example.com",
              "role": "job_seeker",
              "location": "Jakarta, DKI Jakarta",
              "whatsappNumber": "081234567890"
            },
            "token": "jwt-token"
          }
        }
        ```
    *   **Response Error**:
        *   `400 Bad Request`: Validasi skema gagal (misalnya format email/nomor WhatsApp salah).
        *   `409 Conflict`: `"Email sudah terdaftar"`.

*   **POST `/register/recruiter`**
    *   **Request Body**:
        ```json
        {
          "firstName": "Budi",
          "lastName": "Utomo",
          "email": "budi@corporate.com",
          "password": "Password123",
          "companyMode": "new", // "new" atau "existing"
          "existingCompanyId": "uuid", // diperlukan jika companyMode = "existing"
          "newCompany": { // diperlukan jika companyMode = "new"
            "companyName": "TechVision Indonesia",
            "industry": "Teknologi Informasi",
            "location": "Jakarta",
            "workplaceTag": "Inclusive",
            "description": "Platform rekrutmen digital"
          }
        }
        ```
    *   **Response (201 Created)**:
        ```json
        {
          "success": true,
          "message": "Recruiter registered successfully",
          "data": {
            "user": {
              "userId": "uuid",
              "name": "Budi Utomo",
              "firstName": "Budi",
              "lastName": "Utomo",
              "email": "budi@corporate.com",
              "role": "recruiter"
            },
            "companyId": "uuid",
            "token": "jwt-token"
          }
        }
        ```
    *   **Response Error**:
        *   `404 Not Found`: `"Perusahaan tidak ditemukan"` (jika memilih `existingCompanyId` yang tidak valid).
        *   `400 Bad Request`: `"Perusahaan yang dipilih sudah memiliki jumlah perekrut maksimal"` (maksimal 3 perekrut per perusahaan).
        *   `409 Conflict`: `"Email sudah terdaftar"` atau `"Nama perusahaan sudah terdaftar"`.

*   **POST `/login`**
    *   **Request Body**:
        ```json
        {
          "email": "nadia@example.com",
          "password": "Password123"
        }
        ```
    *   **Response (200 OK)**:
        ```json
        {
          "success": true,
          "message": "Login successful",
          "data": {
            "token": "jwt-token",
            "user": {
              "userId": "uuid",
              "name": "Nadia Jasmine",
              "email": "nadia@example.com",
              "role": "job_seeker"
            }
          }
        }
        ```
    *   **Response Error**:
        *   `401 Unauthorized`: `"Email atau kata sandi salah"`.

*   **POST `/forgot-password`**
    *   **Request Body**: `{"email": "nadia@example.com"}`
    *   **Response (200 OK)**:
        ```json
        {
          "success": true,
          "message": "Tautan atur ulang kata sandi telah dikirim ke email Anda",
          "data": {
            "resetToken": "raw-token-string", // hanya dikembalikan di non-production
            "expiresAt": "timestamp"
          }
        }
        ```

*   **POST `/reset-password`**
    *   **Request Body**:
        ```json
        {
          "token": "raw-token-string",
          "newPassword": "NewPassword123"
        }
        ```
    *   **Response (200 OK)**: `{"success": true, "message": "Kata sandi telah berhasil diatur ulang"}`
    *   **Response Error**:
        *   `400 Bad Request`: `"Token reset tidak valid atau kedaluwarsa"`.

*   **GET `/auth/me`**
    *   **Response (200 OK)**: data sesi login pengguna aktif.

---

### 2. User & Profile Management
Prefix: `/users`

| Method | Path | Role Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `GET` | `/profile` | All Authenticated | Mendapatkan data profil lengkap |
| `PUT` | `/profile` | All Authenticated | Memperbarui informasi profil |
| `POST` | `/change-password` | All Authenticated | Mengubah kata sandi |
| `POST` | `/profile/upload-cv` | Job Seeker | Mengunggah file CV (PDF) |
| `GET` | `/profile/cv` | Job Seeker & Recruiter | Mendapatkan link unduh/lihat CV |

*   **PUT `/profile`**: Menerima parameter opsional `firstName`, `lastName`, `gender`, `age`, `location`, `whatsappNumber` untuk data `users`, serta profil spesifik pencari kerja (`skills`, `portfolioLink`, `workExperience`, `awards`, `organizationExperience`, `interests`). Memperbarui `firstName`/`lastName` akan memperbarui kolom `name` ter-konsolidasi secara otomatis.

---

### 3. Public Jobs & Stats (Akses Tanpa Login)
Prefix: `/public`

| Method | Path | Role Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `GET` | `/public/jobs` | Public | Mencari dan filter daftar pekerjaan publik |
| `GET` | `/public/jobs/:id` | Public | Detail lowongan pekerjaan publik |
| `GET` | `/public/jobs/recommended` | Job Seeker | Lowongan kerja rekomendasi berdasarkan minat/keahlian |
| `GET` | `/public/stats` | Public | Mengambil data statistik landing page |

*   **GET `/public/stats`**
    *   **Response (200 OK)**:
        ```json
        {
          "success": true,
          "message": "Statistics fetched successfully",
          "data": {
            "successRate": "99.7%",
            "responseRate": "53%",
            "platformCount": "1 Platform",
            "totalJobSeekers": 120,
            "totalJobs": 45,
            "totalCompanies": 15
          }
        }
        ```

---

### 4. Job Listings (Manajemen Lowongan - Recruiter)
Prefix: `/jobs`

| Method | Path | Role Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `POST` | `/jobs` | Recruiter | Membuat lowongan baru |
| `GET` | `/jobs` | Recruiter | Mendapatkan semua lowongan yang dibuat perusahaannya |
| `GET` | `/jobs/:id` | Recruiter | Mendapatkan detail lowongan milik perusahaannya |
| `PUT` | `/jobs/:id` | Recruiter | Memperbarui detail lowongan |
| `DELETE` | `/jobs/:id` | Recruiter | Menghapus lowongan |

---

### 5. Job Applications (Lamaran Pekerjaan)
Prefix: `/applications`

| Method | Path | Role Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `POST` | `/applications` | Job Seeker | Melamar pekerjaan |
| `GET` | `/applications` | Job Seeker / Recruiter | Daftar lamaran (sesuai filter role) |
| `GET` | `/applications/:id` | Job Seeker / Recruiter | Detail data lamaran |
| `PATCH` | `/applications/:id/status` | Recruiter | Mengubah status lamaran |
| `GET` | `/applications/:id/cv` | Recruiter | Mendapatkan link CV pelamar |
| `GET` | `/applications/summary` | Job Seeker | Summary lamaran per status |

---

### 6. Bookmarks (Penyimpanan Lowongan)
Prefix: `/bookmarks`

| Method | Path | Role Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `POST` | `/bookmarks/:jobId` | Job Seeker | Menyimpan lowongan ke bookmark |
| `DELETE` | `/bookmarks/:jobId` | Job Seeker | Menghapus lowongan dari bookmark |
| `GET` | `/bookmarks` | Job Seeker | Daftar semua lowongan yang disimpan |
| `GET` | `/bookmarks/:jobId/status` | Job Seeker | Mengecek apakah lowongan telah disimpan |

---

### 7. Companies & Follows (Perusahaan & Mengikuti)
Prefix: `/companies`

| Method | Path | Role Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `GET` | `/companies` | All Authenticated | Mencari dan list perusahaan |
| `GET` | `/companies/:id` | All Authenticated | Detail profil perusahaan |
| `POST` | `/companies/:id/follow` | Job Seeker | Mengikuti (follow) perusahaan |
| `DELETE` | `/companies/:id/follow` | Job Seeker | Berhenti mengikuti (unfollow) perusahaan |

---

### 8. Workplace Ratings & Reviews (Ulasan Perusahaan)
Prefix: `/ratings`

| Method | Path | Role Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `POST` | `/ratings` | Job Seeker | Mengirimkan ulasan dan nilai bintang perusahaan |
| `GET` | `/ratings/company/:companyId` | All Authenticated | Daftar ulasan dan rating perusahaan |

---

### 9. Notifications (Notifikasi In-App)
Prefix: `/notifications`

| Method | Path | Role Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `GET` | `/notifications` | All Authenticated | Mendapatkan semua notifikasi pengguna |
| `PATCH` | `/notifications/:id/read` | All Authenticated | Menandai notifikasi sebagai sudah dibaca |

---

### 10. Messages & Conversations (Pesan & Obrolan)
Prefix: `/conversations`

| Method | Path | Role Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `POST` | `/conversations` | All Authenticated | Membuat sesi percakapan baru |
| `GET` | `/conversations` | All Authenticated | Mendapatkan daftar percakapan aktif |
| `POST` | `/conversations/:id/messages` | All Authenticated | Mengirimkan pesan baru |
| `GET` | `/conversations/:id/messages` | All Authenticated | Mendapatkan riwayat pesan dalam obrolan |
