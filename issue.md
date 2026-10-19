# [Task] Implementasi Unit & Integration Test Komprehensif untuk Seluruh Endpoint API

## 1. Ringkasan & Tujuan
Tugas ini bertujuan untuk membangun *automated test suite* (unit & integration test) yang komprehensif untuk seluruh endpoint API yang tersedia di aplikasi. Pengujian ini bertujuan memastikan kestabilan fitur autentikasi dan manajemen user, mencegah terjadinya regresi di masa depan, serta memverifikasi kepatuhan terhadap kontrak API dan aturan validasi.

Perencanaan ini dirancang terstruktur dan jelas mengenai **apa saja skenario yang harus diuji**, sedangkan penulisan detail kode implementasinya diserahkan kepada programmer / model AI pelaksana.

---

## 2. Standar & Lingkungan Pengujian
- **Test Runner**: Gunakan test runner bawaan Bun (`bun:test`).
- **Lokasi File**: Simpan seluruh file pengujian di dalam folder `tests/` (misalnya `tests/users.test.ts` atau dipisah per modul).
- **Perintah Eksekusi**: Pengujian harus dapat dijalankan dengan perintah:
  ```bash
  bun test
  ```
- **Kepatuhan Tipe**: Seluruh kode test harus lolos pemeriksaan tipe TypeScript (`bun run typecheck`).

---

## 3. Strategi Isolasi & Pembersihan Data (Data Clean-up)
Untuk menjaga konsistensi dan mencegah efek samping antar-test:
- **Pembersihan Data Otomatis**: Setiap skenario (atau sebelum/sesudah setiap unit pengujian dijalankan via hook `beforeEach` / `afterEach`), data pada tabel `session` dan `users` yang berkaitan dengan pengujian harus dibersihkan terlebih dahulu.
- **Konsistensi State**: Pastikan tidak ada data sisa dari test sebelumnya yang menyebabkan test berikutnya gagal (*flaky test*).
- **Penutupan Koneksi**: Di akhir pengujian suite, pastikan koneksi pool database ditutup dengan aman (`afterAll`).

---

## 4. Matriks Skenario Pengujian per Endpoint

Pelaksana diharapkan mengimplementasikan skenario-skenario berikut:

### A. Endpoint: `POST /api/users` (Registrasi Pengguna)

#### 1. Skenario Positif (Sukses):
- **Registrasi Berhasil**: Mengirimkan data `name`, `email`, dan `password` yang valid.
  - Ekspektasi: HTTP `200 OK`, response body `{ "data": "OK" }`.
  - Verifikasi DB: Password tersimpan dalam bentuk hash bcrypt (bukan plain text), email tersimpan dengan benar.
- **Batas Panjang Minimum (Edge Case)**: `name`, `email`, dan `password` dengan panjang batas minimal yang valid (1 karakter untuk name & password).
- **Batas Panjang Maksimum (Edge Case)**: `name` sepanjang 255 karakter dan `email` sepanjang 255 karakter dapat tersimpan dengan benar tanpa terpotong.

#### 2. Skenario Negatif & Validasi:
- **Email Duplikat**: Mencoba mendaftarkan user dengan email yang sudah ada di database.
  - Ekspektasi: HTTP `400 Bad Request`, body `{ "error": "Email sudah terdaftar" }`.
- **Format Email Tidak Valid**: Mengirimkan email yang tidak sesuai format email standar (misal `"bukan-email"`).
  - Ekspektasi: HTTP `400 Bad Request`.
- **Nama Terlalu Panjang**: Mengirimkan `name` lebih dari 255 karakter (misal 256 atau 300 karakter).
  - Ekspektasi: HTTP `400 Bad Request`.
- **Email Terlalu Panjang**: Mengirimkan `email` lebih dari 255 karakter.
  - Ekspektasi: HTTP `400 Bad Request`.
- **Password Terlalu Panjang**: Mengirimkan `password` lebih dari 100 karakter.
  - Ekspektasi: HTTP `400 Bad Request`.
- **Field Wajib Kosong / Hilang**: Request body kosong `{}`, atau salah satu field (`name`/`email`/`password`) tidak disertakan.
  - Ekspektasi: HTTP `400 Bad Request`.
- **Tipe Data Tidak Sesuai**: Mengirimkan tipe data selain string (misal `name` berupa angka atau boolean).
  - Ekspektasi: HTTP `400 Bad Request`.

---

### B. Endpoint: `POST /api/users/login` (Login Pengguna)

#### 1. Skenario Positif (Sukses):
- **Login Berhasil**: Mengirimkan `email` dan `password` yang benar dari user yang sudah terdaftar.
  - Ekspektasi: HTTP `200 OK`, response body mengembalikan format `{ "data": "<token_string>" }`.
  - Verifikasi DB: Record sesi baru dengan token tersebut dan `user_id` yang sesuai tersimpan di tabel `session`.

#### 2. Skenario Negatif & Validasi:
- **Email Tidak Terdaftar**: Mencoba login dengan email yang belum pernah didaftarkan.
  - Ekspektasi: HTTP `400 Bad Request`, body `{ "error": "Email atau password salah" }`.
- **Password Salah**: Menggunakan email yang valid tetapi password salah.
  - Ekspektasi: HTTP `400 Bad Request`, body `{ "error": "Email atau password salah" }`.
- **Format Email Salah**: Mengirimkan field email yang tidak valid formatnya.
  - Ekspektasi: HTTP `400 Bad Request`.
- **Field Kosong / Hilang**: Request body tidak menyertakan email atau password.
  - Ekspektasi: HTTP `400 Bad Request`.
- **Panjang Karakter Melebihi Batas**: Mengirimkan email > 255 karakter atau password > 100 karakter.
  - Ekspektasi: HTTP `400 Bad Request`.

---

### C. Endpoint: `GET /api/users/current` (Profil Pengguna Aktif)

#### 1. Skenario Positif (Sukses):
- **Get Profile Berhasil**: Mengirimkan header `Authorization: Bearer <valid_token>`.
  - Ekspektasi: HTTP `200 OK`.
  - Struktur Response: Mengembalikan properti `data` yang memuat `id`, `name`, `email`, dan `created_at`.
  - Keamanan: Memastikan kolom sensitif `password` **tidak ada** pada response body.

#### 2. Skenario Negatif & Autentikasi:
- **Tanpa Header Authorization**: Memanggil endpoint tanpa mengirimkan header `Authorization`.
  - Ekspektasi: HTTP `401 Unauthorized`, body `{ "error": "Unauthorized" }`.
- **Format Authorization Bukan Bearer**: Mengirimkan format skema lain (misalnya `Authorization: Basic 12345` atau `Token xxx`).
  - Ekspektasi: HTTP `401 Unauthorized`.
- **Token Kosong**: Mengirimkan header `Authorization: Bearer ` tanpa token string.
  - Ekspektasi: HTTP `401 Unauthorized`.
- **Token Palsu / Tidak Dikenal**: Mengirimkan token acak yang tidak tercatat pada tabel `session`.
  - Ekspektasi: HTTP `401 Unauthorized`.
- **User Terhapus**: Token ada di tabel `session`, tetapi record user pemilik sesi sudah dihapus dari tabel `users`.
  - Ekspektasi: HTTP `401 Unauthorized`.

---

### D. Endpoint: `DELETE /api/users/logout` (Logout Pengguna)

#### 1. Skenario Positif (Sukses):
- **Logout Berhasil**: Mengirimkan header `Authorization: Bearer <valid_token>`.
  - Ekspektasi: HTTP `200 OK`, response body `{ "data": "OK" }`.
  - Verifikasi DB: Record sesi dengan token tersebut harus **terhapus** dari tabel `session`.
  - Verifikasi Akses Lanjutan: Token yang baru saja logout diverifikasi tidak bisa lagi dipakai untuk mengakses `GET /api/users/current` (harus menghasilkan HTTP `401 Unauthorized`).

#### 2. Skenario Negatif & Autentikasi:
- **Tanpa Header Authorization**: Request logout tanpa header.
  - Ekspektasi: HTTP `401 Unauthorized`.
- **Format Header Tidak Valid**: Header bukan berformat `Bearer <token>`.
  - Ekspektasi: HTTP `401 Unauthorized`.
- **Token Tidak Ditemukan**: Mengirimkan token yang memang tidak ada di database.
  - Ekspektasi: HTTP `401 Unauthorized`.
- **Double Logout (Idempotency Check)**: Mencoba logout kedua kali menggunakan token yang sama setelah sukses logout pertama kali.
  - Ekspektasi: HTTP `401 Unauthorized`.

---

## 5. Kriteria Keberhasilan (Acceptance Criteria)

- [x] File pengujian berada di dalam direktori `tests/` menggunakan framework `bun:test`.
- [x] Mekanisme pembersihan data (`cleanup`) diterapkan sebelum/sesudah pengujian skenario agar terisolasi dan konsisten.
- [x] Semua skenario pengujian pada Bagian 4 (Endpoint Registrasi, Login, Current User, dan Logout) diimplementasikan.
- [x] Menangani pengujian status code (200, 400, 401) dan response body sesuai spesifikasi masing-masing endpoint.
- [x] Seluruh skenario pengujian berstatus lulus saat dijalankan dengan perintah `bun test` (100% pass, 0 fail).
- [x] Proyek lolos pemeriksaan tipe TypeScript (`bun run typecheck`).
