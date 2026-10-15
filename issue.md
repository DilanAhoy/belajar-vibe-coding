# [Feature] Get Current User API (Autentikasi Sesi & Profil Pengguna)

## 1. Ringkasan & Tujuan
Fitur ini bertujuan untuk menyediakan endpoint yang mengembalikan data profil pengguna yang sedang login berdasarkan token sesi yang dikirimkan pada HTTP header `Authorization`.

Dokumen perencanaan ini dibuat secara terperinci, terstruktur, dan presisi agar mudah diimplementasikan oleh junior programmer atau model AI.

---

## 2. Struktur Arsitektur & Folder

Aplikasi mengikuti pola arsitektur *Separation of Concerns*:

```text
src/
├── db/
│   ├── index.ts              # Instance Drizzle ORM
│   └── schema.ts             # Definisi skema tabel (users, session)
├── routes/
│   └── users.routes.ts       # Endpoint ElysiaJS & validasi header/request
├── services/
│   └── users.services.ts     # Logika bisnis verifikasi token sesi & query user
└── index.ts                  # Entry point utama aplikasi
```

### Konvensi File & Tanggung Jawab:
- **Routes (`src/routes/users.routes.ts`)**: Menerima request `GET /api/users/current`, membaca header `Authorization`, memanggil service, dan memetakan response HTTP (200 OK untuk sukses, 401 Unauthorized untuk token invalid).
- **Services (`src/services/users.services.ts`)**: Mengekstrak token, mencari sesi aktif di tabel `session`, mengambil data user terkait dari tabel `users` (tanpa menyertakan password), dan melempar error `Unauthorized` jika token tidak valid atau tidak ditemukan.

---

## 3. Spesifikasi Kontrak API

### Endpoint:
`GET /api/users/current`

### Request Headers:
| Header | Tipe | Contoh Nilai | Keterangan |
| :--- | :--- | :--- | :--- |
| `Authorization` | `string` | `Bearer d6164ae3-6666-4b13-ab07-e7fac7837f29` | Format `Bearer <token>` yang didapat saat login |

### Response Sukses (HTTP 200 OK):
Mengembalikan data profil pengguna (password **TIDAK BOLEH** disertakan):
```json
{
  "data": {
    "id": 1,
    "name": "Dilan",
    "email": "dilan@localhost",
    "created_at": "2026-10-15T21:49:04.000Z"
  }
}
```

### Response Error - Tidak Terautentikasi (HTTP 401 Unauthorized):
Dikembalikan apabila:
- Header `Authorization` tidak dikirimkan atau formatnya salah (tidak diawali `Bearer `).
- Token tidak ditemukan di tabel `session`.
- Akun pengguna yang berelasi dengan sesi tidak ditemukan di tabel `users`.

```json
{
  "error": "Unauthorized"
}
```

---

## 4. Alur Logika Bisnis & Database

1. Token dikirim client melalui header: `Authorization: Bearer <token>`.
2. Sistem mengekstrak string `<token>` dari header tersebut.
3. Lakukan query pencarian data sesi pada database berdasarkan token:
   - Query tabel `session` mencocokkan kolom `token`.
   - Atau lakukan `INNER JOIN` antara tabel `session` dan `users` berdasarkan relasi `session.user_id = users.id`.
4. Jika data sesi tidak ditemukan, lempar error `UnauthorizedError`.
5. Jika ditemukan, kembalikan objek data user:
   - `id`: integer
   - `name`: string
   - `email`: string
   - `created_at`: string timestamp / ISO string
6. Password hash harus dikecualikan (*excluded*) dari response demi keamanan.

---

## 5. Tahapan Implementasi Langkah-demi-Langkah

Ikuti instruksi pengerjaan berikut ini secara berurutan:

### Langkah 1: Buat Error Class & Service Logic (`src/services/users.services.ts`)
1. Buka file `src/services/users.services.ts`.
2. Definisikan class error khusus untuk autentikasi gagal:
   ```typescript
   export class UnauthorizedError extends Error {
     constructor(message = "Unauthorized") {
       super(message);
       this.name = "UnauthorizedError";
     }
   }
   ```
3. Definisikan tipe data keluaran profil user:
   ```typescript
   export interface CurrentUserResponse {
     id: number;
     name: string;
     email: string;
     created_at: string | Date;
   }
   ```
4. Buat fungsi `getCurrentUserService(authHeader?: string): Promise<CurrentUserResponse>`:
   - **Validasi Header**: Periksa apakah `authHeader` ada dan diawali dengan `"Bearer "`. Jika tidak, lempar `new UnauthorizedError()`.
   - **Ekstrak Token**:
     ```typescript
     const token = authHeader.replace(/^Bearer\s+/i, "").trim();
     if (!token) {
       throw new UnauthorizedError();
     }
     ```
   - **Query Database**: Cari sesi dan data user terkait:
     ```typescript
     const [sessionRecord] = await db
       .select({
         id: users.id,
         name: users.name,
         email: users.email,
         createdAt: users.createAt,
       })
       .from(sessions)
       .innerJoin(users, eq(sessions.userId, users.id))
       .where(eq(sessions.token, token))
       .limit(1);

     if (!sessionRecord) {
       throw new UnauthorizedError();
     }
     ```
   - **Return Profil Pengguna**:
     ```typescript
     return {
       id: sessionRecord.id,
       name: sessionRecord.name,
       email: sessionRecord.email,
       created_at: sessionRecord.createdAt.toISOString(),
     };
     ```

---

### Langkah 2: Tambahkan Route Handler (`src/routes/users.routes.ts`)
1. Buka file `src/routes/users.routes.ts`.
2. Import `getCurrentUserService` dan `UnauthorizedError` dari `../services/users.services`.
3. Tambahkan route handler `GET /users/current` pada instance `usersRoutes`:
   ```typescript
   .get(
     "/users/current",
     async ({ headers, set }) => {
       try {
         const authHeader = headers["authorization"];
         const user = await getCurrentUserService(authHeader);
         return {
           data: user,
         };
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
4. Pastikan route berada di bawah prefix `/api` sehingga endpoint dapat diakses melalui `GET /api/users/current`.

---

### Langkah 3: Validasi Tipe Data & Build
1. Jalankan pemeriksaan tipe data TypeScript:
   ```bash
   bun run typecheck
   ```
2. Pastikan tidak ada kesalahan tipe data.

---

### Langkah 4: Pengujian & Verifikasi Endpoint (Testing Manual)

Lakukan pengujian manual menggunakan `curl`:

#### Skenario 1: Get Current User Berhasil (Token Valid)
Gunakan token yang didapatkan dari response login:
```bash
curl -X GET http://localhost:3000/api/users/current \
  -H "Authorization: Bearer <TOKEN_VALID>"
```
**Ekspektasi Output:**
- Status Code: `200 OK`
- Body:
  ```json
  {
    "data": {
      "id": 1,
      "name": "Dilan",
      "email": "dilan@localhost",
      "created_at": "2026-10-15T21:49:04.000Z"
    }
  }
  ```

#### Skenario 2: Token Salah / Tidak Ditemukan
```bash
curl -X GET http://localhost:3000/api/users/current \
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

#### Skenario 3: Header Authorization Tidak Dikirim
```bash
curl -X GET http://localhost:3000/api/users/current
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
curl -X GET http://localhost:3000/api/users/current \
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

- [x] Fungsi `getCurrentUserService` diimplementasikan di `src/services/users.services.ts`.
- [x] Endpoint `GET /api/users/current` terdaftar dan aktif di `src/routes/users.routes.ts`.
- [x] Header `Authorization` dengan format `Bearer <token>` diparsing dengan benar.
- [x] Pencocokan token ke tabel `session` dan data pengguna di tabel `users` berjalan akurat.
- [x] Response sukses (HTTP 200) mengembalikan field `id`, `name`, `email`, dan `created_at` di dalam properti `data`.
- [x] Kolom sensitif seperti `password` tidak pernah dikembalikan ke client.
- [x] Mengembalikan HTTP 401 `{ "error": "Unauthorized" }` jika token invalid, kedaluwarsa/tidak ditemukan, atau header tidak disertakan.
- [x] Project lolos typecheck TypeScript (`bun run typecheck`).
