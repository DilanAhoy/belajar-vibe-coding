# [Task] Setup Project: Bun + ElysiaJS + Drizzle ORM + MySQL

## 1. Ringkasan & Tujuan
Inisialisasi project backend baru pada direktori ini menggunakan runtime **Bun**, framework web **ElysiaJS**, ORM **Drizzle**, dan database **MySQL**. Dokumen ini ditujukan sebagai panduan high-level bagi developer atau model LLM untuk melakukan setup dan implementasi awal.

---

## 2. Tech Stack & Dependencies
- **Runtime & Package Manager**: Bun
- **Web Framework**: ElysiaJS (`elysia`)
- **ORM**: Drizzle ORM (`drizzle-orm`)
- **Database Driver**: MySQL (`mysql2`)
- **Dev Tools**: Drizzle Kit (`drizzle-kit`) untuk migrasi dan inspeksi skema
- **Environment**: File `.env` untuk konfigurasi koneksi database dan port server

---

## 3. Tahapan Implementasi (High-Level Steps)

### Tahap 1: Inisialisasi Project Bun
- Lakukan inisialisasi project Bun di root folder direktori saat ini.
- Pastikan konfigurasi dasar `package.json` dan `tsconfig.json` telah siap untuk TypeScript.

### Tahap 2: Instalasi Dependencies
- Pasang dependency aplikasi:
  - `elysia`
  - `drizzle-orm`
  - `mysql2`
- Pasang development dependencies:
  - `drizzle-kit`

### Tahap 3: Konfigurasi Environment & Struktur Proyek
- Siapkan file `.env` dan `.env.example` yang mencakup variabel konfigurasi database (Host, Port, User, Password, Database Name) serta konfigurasi port server.
- Susun struktur folder yang rapi dan terorganisir di dalam `src/`:
  - `src/db/`: Berisi konfigurasi instance koneksi Drizzle dan definisi skema tabel MySQL.
  - `src/index.ts`: Entry point utama aplikasi ElysiaJS.
- Buat file konfigurasi `drizzle.config.ts` untuk memetakan file skema dan opsi koneksi database MySQL.

### Tahap 4: Konfigurasi Database & Contoh Skema
- Buat instance client database menggunakan koneksi `mysql2` yang dibungkus dengan Drizzle ORM.
- Definisikan contoh skema tabel sederhana (misalnya tabel `users`) menggunakan modul `drizzle-orm/mysql-core`.
- Tambahkan script bantu di `package.json` untuk manajemen database (seperti generate migrasi atau push skema via Drizzle Kit).

### Tahap 5: Implementasi Server ElysiaJS
- Setup server Elysia pada `src/index.ts`.
- Tambahkan route dasar / health check (misalnya `GET /` atau `GET /health`) yang mengembalikan status aktif aplikasi.
- Konfigurasikan listener port agar server dapat dijalankan secara lokal.

---

## 4. Kriteria Keberhasilan (Acceptance Criteria)
- [x] Project Bun berhasil diinisialisasi di root folder.
- [x] Dependency `elysia`, `drizzle-orm`, `mysql2`, dan `drizzle-kit` tercatat di `package.json`.
- [x] Template environment `.env.example` tersedia dan jelas.
- [x] Setup Drizzle ORM dan koneksi ke MySQL sudah terstruktur dan siap digunakan.
- [x] Server ElysiaJS dapat dijalankan dengan perintah `bun run` atau `bun src/index.ts` serta merespons endpoint health check dengan baik.
