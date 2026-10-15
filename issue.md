# [Feature] Logout User API (Penghapusan Sesi Login)

## 1. Ringkasan & Tujuan
Fitur ini bertujuan untuk menyediakan endpoint yang memungkinkan pengguna untuk melakukan logout (keluar dari sesi aktif). Saat logout berhasil dilakukan, data sesi pengguna (record token) pada tabel `session` di database harus dihapus sehingga token tersebut tidak dapat digunakan lagi untuk mengakses endpoint privat/terautentikasi (seperti `GET /api/users/current`).

Dokumen perencanaan ini dirancang secara detail, terstruktur, dan presisi agar dapat diimplementasikan dengan mudah oleh junior programmer atau model AI murah.

---

## 2. Struktur Arsitektur & Folder

Aplikasi menggunakan arsitektur modular dengan pemisahan tanggung jawab (*Separation of Concerns*):

```text
src/
├── db/
│   ├── index.ts              # Konfigurasi instance Drizzle ORM
│   └── schema.ts             # Definisi skema tabel database (users, session)
├── routes/
│   └── users.routes.ts       # Endpoint ElysiaJS & penanganan HTTP request
├── services/
│   └── users.services.ts     # Logika bisnis validasi token & penghapusan sesi di DB
└── index.ts                  # Entry point utama server ElysiaJS
```

### Konvensi File & Tanggung Jawab:
- **Routes (`src/routes/users.routes.ts`)**: Menerima request `DELETE /api/users/logout`, membaca header `Authorization`, memanggil service logout, dan memetakan status response HTTP (200 OK jika sukses, 401 Unauthorized jika token tidak valid).
- **Services (`src/services/users.services.ts`)**: Mengekstrak token dari header, memeriksa keberadaan sesi di tabel `session`, menghapus record sesi dari database, dan melempar error `Unauthorized` jika token tidak ditemukan/tidak valid.

---

## 3. Spesifikasi Kontrak API

### Endpoint:
`DELETE /api/users/logout`

### Request Headers:
| Header | Tipe | Contoh Nilai | Keterangan |
| :--- | :--- | :--- | :--- |
| `Authorization` | `string` | `Bearer d6164ae3-6666-4b13-ab07-e7fac7837f29` | Format `Bearer <token>` yang didapatkan saat login |

### Response Sukses (HTTP 200 OK):
```json
{
  "data": "OK"
}
```

### Response Error - Tidak Terautentikasi (HTTP 401 Unauthorized):
Dikembalikan apabila:
- Header `Authorization` tidak dikirimkan.
- Format header tidak diawali dengan `Bearer `.
- Token tidak ditemukan di tabel `session` (misalnya token palsu atau sudah pernah logout sebelumnya).

```json
{
  "error": "Unauthorized"
}
```

---

## 4. Alur Logika Bisnis & Database

1. Client mengirimkan HTTP request `DELETE /api/users/logout` dengan header `Authorization: Bearer <token>`.
2. Validasi format header:
   - Jika header kosong atau tidak diawali `"Bearer "`, tolak dengan status `401 Unauthorized`.
3. Ekstrak string `<token>` dari header.
4. Lakukan pencarian record sesi di tabel `session`:
   ```typescript
   const [sessionRecord] = await db
     .select()
     .from(sessions)
     .where(eq(sessions.token, token))
     .limit(1);
   ```
5. Jika record sesi tidak ditemukan, lempar error `UnauthorizedError`.
6. Jika record sesi ditemukan, hapus record tersebut dari tabel `session`:
   ```typescript
   await db.delete(sessions).where(eq(sessions.token, token));
   ```
7. Kembalikan response sukses: `{ data: "OK" }` dengan status code `200`.

---

## 5. Tahapan Implementasi Langkah-demi-Langkah

Ikuti urutan langkah pengerjaan berikut ini secara berurutan:

### Langkah 1: Buat Fungsi Logout pada Service Layer (`src/services/users.services.ts`)
1. Buka file `src/services/users.services.ts`.
2. Pastikan class `UnauthorizedError` sudah ada (jika belum ada, buat class error tersebut).
3. Implementasikan fungsi `logoutUserService(authHeader?: string)`:
   - **Validasi Header**:
     ```typescript
     if (!authHeader || !authHeader.startsWith("Bearer ")) {
       throw new UnauthorizedError("Unauthorized");
     }
     ```
   - **Ekstrak Token**:
     ```typescript
     const token = authHeader.replace(/^Bearer\s+/i, "").trim();
     if (!token) {
       throw new UnauthorizedError("Unauthorized");
     }
     ```
   - **Cek Keberadaan Sesi di Database**:
     ```typescript
     const [sessionRecord] = await db
       .select({ id: sessions.id })
       .from(sessions)
       .where(eq(sessions.token, token))
       .limit(1);

     if (!sessionRecord) {
       throw new UnauthorizedError("Unauthorized");
     }
     ```
   - **Hapus Record Sesi**:
     ```typescript
     await db.delete(sessions).where(eq(sessions.token, token));
     ```
   - **Kembalikan Hasil**:
     ```typescript
     return { data: "OK" };
     ```

---

### Langkah 2: Tambahkan Route Handler Logout (`src/routes/users.routes.ts`)
1. Buka file `src/routes/users.routes.ts`.
2. Import fungsi `logoutUserService` dari `../services/users.services`.
3. Tambahkan route handler `DELETE /users/logout` pada instance `usersRoutes`:
   ```typescript
   .delete(
     "/users/logout",
     async ({ headers, set }) => {
       try {
         const authHeader = headers["authorization"];
         const result = await logoutUserService(authHeader);
         return result;
       } catch (error) {
         if (error instanceof UnauthorizedError) {
           set.status = 401;
           return {
             error: "Unauthorized",
           };
         }

         set.status = 500;
         return {
           error: "Terjadi kesalahan pada server",
         };
       }
     }
   )
   ```
4. Pastikan route berada di bawah prefix `/api` sehingga endpoint lengkapnya adalah `DELETE /api/users/logout`.

---

### Langkah 3: Verifikasi TypeScript Typecheck
1. Jalankan pengecekan tipe data pada project:
   ```bash
   bun run typecheck
   ```
2. Pastikan tidak ada kesalahan tipe data (`0 errors`).

---

### Langkah 4: Pengujian & Verifikasi Endpoint (Testing Manual)

Lakukan pengujian bertahap menggunakan `curl`:

#### Skenario 1: Logout Berhasil
1. Lakukan login terlebih dahulu untuk mendapatkan token sesi:
   ```bash
   curl -X POST http://localhost:3000/api/users/login \
     -H "Content-Type: application/json" \
     -d '{"email": "dilan@localhost", "password": "rahasia"}'
   ```
2. Gunakan token yang didapatkan untuk melakukan logout:
   ```bash
   curl -X DELETE http://localhost:3000/api/users/logout \
     -H "Authorization: Bearer <TOKEN_LOGIN>"
   ```
   **Ekspektasi Output:**
   - Status Code: `200 OK`
   - Body:
     ```json
     {
       "data": "OK"
     }
     ```
3. Verifikasi bahwa token tersebut sudah terhapus dan tidak bisa lagi digunakan untuk mengakses `GET /api/users/current`:
   ```bash
   curl -X GET http://localhost:3000/api/users/current \
     -H "Authorization: Bearer <TOKEN_LOGIN>"
   ```
   **Ekspektasi Output:**
   - Status Code: `401 Unauthorized`
   - Body: `{ "error": "Unauthorized" }`

#### Skenario 2: Logout dengan Token Palsu / Sudah Dihapus
Kirim kembali request logout menggunakan token yang sama (sudah terhapus) atau token asal:
```bash
curl -X DELETE http://localhost:3000/api/users/logout \
  -H "Authorization: Bearer token-asal-asalan"
```
**Ekspektasi Output:**
- Status Code: `401 Unauthorized`
- Body:
  ```json
  {
    "error": "Unauthorized"
  }
  ```

#### Skenario 3: Header Authorization Tidak Disertakan
```bash
curl -X DELETE http://localhost:3000/api/users/logout
```
**Ekspektasi Output:**
- Status Code: `401 Unauthorized`
- Body:
  ```json
  {
    "error": "Unauthorized"
  }
  ```

#### Skenario 4: Format Authorization Bukan Bearer
```bash
curl -X DELETE http://localhost:3000/api/users/logout \
  -H "Authorization: Basic 123456"
```
**Ekspektasi Output:**
- Status Code: `401 Unauthorized`
- Body:
  ```json
  {
    "error": "Unauthorized"
  }
  ```

---

## 6. Kriteria Keberhasilan (Acceptance Criteria)

- [x] Fungsi `logoutUserService` diimplementasikan di `src/services/users.services.ts`.
- [x] Endpoint `DELETE /api/users/logout` terdaftar dan aktif di `src/routes/users.routes.ts`.
- [x] Header `Authorization` dengan format `Bearer <token>` diparsing dengan benar.
- [x] Record sesi terkait berhasil dihapus dari tabel `session` saat logout berhasil.
- [x] Response sukses (HTTP 200) mengembalikan payload `{ "data": "OK" }`.
- [x] Setelah logout, token yang sama tidak dapat lagi digunakan untuk mengakses endpoint yang membutuhkan autentikasi (seperti `GET /api/users/current`).
- [x] Mengembalikan response HTTP 401 `{ "error": "Unauthorized" }` jika token invalid, token tidak ditemukan, atau header `Authorization` tidak disertakan.
- [x] Project lolos pemeriksaan tipe TypeScript (`bun run typecheck`).
