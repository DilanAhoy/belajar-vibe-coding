# [Feature] Login User & Session Management (API & Database Migration)

## 1. Ringkasan & Tujuan
Fitur ini bertujuan untuk mengimplementasikan fungsionalitas login pengguna dan pencatatan sesi login (*session*) ke dalam database. Pengguna yang berhasil login akan dibuatkan token sesi unik berbasis **UUID** yang disimpan ke dalam tabel `session` dan dikembalikan ke client.

Dokumen perencanaan ini dirancang secara detail, terstruktur, dan presisi agar dapat diimplementasikan dengan mudah oleh junior programmer atau model AI.

---

## 2. Struktur Arsitektur & Folder

Mengikuti standar arsitektur proyek yang memisahkan tanggung jawab antara *routing* dan *business logic*:

```text
src/
├── db/
│   ├── index.ts              # Konfigurasi instance Drizzle ORM & koneksi MySQL
│   └── schema.ts             # Definisi skema database (users, session)
├── routes/
│   └── users.routes.ts       # Route handler ElysiaJS & validasi request input
├── services/
│   └── users.services.ts     # Logika bisnis autentikasi, verifikasi hash, generate token, DB insert
└── index.ts                  # Entry point aplikasi ElysiaJS
```

### Konvensi File:
- **Routes (`src/routes/users.routes.ts`)**: Menangani endpoint `POST /api/users/login`, memvalidasi request body menggunakan validator bawaan Elysia (`t`), mengatur HTTP status code, dan mengembalikan JSON response.
- **Services (`src/services/users.services.ts`)**: Menangani pengecekan email user di database, verifikasi password hash menggunakan `Bun.password.verify`, pembuatan UUID token menggunakan `crypto.randomUUID()`, dan penyimpanan sesi ke tabel `session`.

---

## 3. Spesifikasi Skema Database

Tambahkan definisi tabel **`session`** pada file `src/db/schema.ts`.

### Definisi Kolom Tabel `session`:
| Nama Kolom | Tipe Data MySQL | Keterangan |
| :--- | :--- | :--- |
| `id` | `INT` | Primary Key, Auto Increment |
| `token` | `VARCHAR(255)` | Not Null, Unique (Menampung string UUID token sesi) |
| `user_id` | `INT` | Foreign Key mengarah ke `users.id`, Not Null |
| `created_at` | `TIMESTAMP` | Default `CURRENT_TIMESTAMP`, Not Null |

### Kode Skema yang Harus Ditambahkan ke `src/db/schema.ts`:
```typescript
import { mysqlTable, int, varchar, timestamp } from "drizzle-orm/mysql-core";

// Tabel users yang sudah ada sebelumnya
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  createAt: timestamp("create_at").defaultNow().notNull(),
});

// Tabel session baru yang harus ditambahkan:
export const sessions = mysqlTable("session", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  userId: int("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
```

---

## 4. Spesifikasi Kontrak API

### Endpoint:
`POST /api/users/login`

### Request Header:
- `Content-Type: application/json`

### Request Body:
```json
{
  "email": "dilan@localhost",
  "password": "rahasia"
}
```

### Validasi Input:
- `email`: Tipe `string`, format email valid, wajib diisi.
- `password`: Tipe `string`, wajib diisi.

### Response Sukses (HTTP 200 OK):
Kembalikan token UUID yang baru dibuat:
```json
{
  "data": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```
*(Catatan: Nilai string `"f47ac10b-..."` adalah nilai dinamis hasil generate UUID).*

### Response Error - Kredensial Salah (HTTP 400 Bad Request):
Gunakan pesan error seragam baik ketika email tidak ditemukan maupun ketika password tidak cocok (untuk keamanan / mencegah user enumeration):
```json
{
  "error": "Email atau password salah"
}
```

### Response Error - Validasi Input Gagal (HTTP 422 / 400):
Dihandle otomatis oleh validator Elysia TypeBox apabila format request body tidak sesuai.

---

## 5. Tahapan Implementasi Langkah-demi-Langkah

Ikuti urutan langkah pengerjaan berikut ini:

### Langkah 1: Perbarui Skema Database & Sinkronisasi
1. Buka file `src/db/schema.ts`.
2. Tambahkan deklarasi tabel `sessions` (dengan nama tabel di DB `"session"`) dan relasi FK ke tabel `users` seperti pada bagian spesifikasi skema di atas.
3. Jalankan perintah push skema Drizzle ke database MySQL:
   ```bash
   bun run db:push
   ```
4. Pastikan tabel `session` berhasil terbuat di MySQL tanpa error.

---

### Langkah 2: Tambahkan Service Login (`src/services/users.services.ts`)
1. Buka file `src/services/users.services.ts`.
2. Buat class error khusus atau gunakan penanganan error untuk kredensial tidak valid:
   ```typescript
   export class AuthenticationError extends Error {
     constructor(message = "Email atau password salah") {
       super(message);
       this.name = "AuthenticationError";
     }
   }
   ```
3. Definisikan tipe input untuk login:
   ```typescript
   export interface LoginUserInput {
     email: string;
     password: string;
   }
   ```
4. Implementasikan fungsi `loginUserService(input: LoginUserInput)` dengan alur:
   - **Cari user berdasarkan email**:
     ```typescript
     const [user] = await db
       .select()
       .from(users)
       .where(eq(users.email, input.email))
       .limit(1);
     ```
   - **Validasi keberadaan user**: Jika `!user`, lempar `new AuthenticationError("Email atau password salah")`.
   - **Verifikasi password**: Gunakan fungsi verifikasi hash native dari Bun:
     ```typescript
     const isPasswordValid = await Bun.password.verify(input.password, user.password);
     if (!isPasswordValid) {
       throw new AuthenticationError("Email atau password salah");
     }
     ```
   - **Generate Token Sesi UUID**: Gunakan fungsi bawaan native JavaScript/Bun:
     ```typescript
     const token = crypto.randomUUID();
     ```
   - **Simpan Sesi ke Database**:
     ```typescript
     await db.insert(sessions).values({
       token: token,
       userId: user.id,
     });
     ```
   - **Kembalikan Response**:
     ```typescript
     return { data: token };
     ```

---

### Langkah 3: Tambahkan Route Login (`src/routes/users.routes.ts`)
1. Buka file `src/routes/users.routes.ts`.
2. Import `loginUserService` dan `AuthenticationError` dari `../services/users.services`.
3. Tambahkan route handler `POST /users/login` pada instance `usersRoutes`:
   ```typescript
   .post(
     "/users/login",
     async ({ body, set }) => {
       try {
         const result = await loginUserService(body);
         return result;
       } catch (error) {
         if (error instanceof AuthenticationError) {
           set.status = 400;
           return {
             error: error.message,
           };
         }

         set.status = 500;
         return {
           error: "Terjadi kesalahan pada server",
         };
       }
     },
     {
       body: t.Object({
         email: t.String({ format: "email" }),
         password: t.String({ minLength: 1 }),
       }),
     }
   )
   ```
4. Pastikan route `POST /users/login` berada di bawah prefix `/api` sehingga endpoint lengkapnya adalah `POST /api/users/login`.

---

### Langkah 4: Verifikasi Server & TypeScript Check
1. Pastikan `src/index.ts` sudah memuat `usersRoutes` (sudah terdaftar dari fitur sebelumnya).
2. Jalankan typecheck untuk memastikan tidak ada kesalahan tipe data:
   ```bash
   bun run typecheck
   ```
3. Jalankan server lokal:
   ```bash
   bun run dev
   ```

---

### Langkah 5: Pengujian & Verifikasi Endpoint (Testing Manual)

Lakukan pengujian menggunakan `curl` atau REST client:

#### Skenario 1: Login Berhasil (Email dan Password Benar)
```bash
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email": "dilan@localhost", "password": "rahasia"}'
```
**Ekspektasi Output:**
- Status Code: `200 OK`
- Body:
  ```json
  {
    "data": "<uuid-token-string>"
  }
  ```
- Di Database: Terdapat record baru di tabel `session` dengan `token` yang sesuai dan `user_id` milik user `dilan@localhost`.

#### Skenario 2: Login Gagal (Password Salah)
```bash
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email": "dilan@localhost", "password": "passwordsalah"}'
```
**Ekspektasi Output:**
- Status Code: `400 Bad Request`
- Body:
  ```json
  {
    "error": "Email atau password salah"
  }
  ```

#### Skenario 3: Login Gagal (Email Tidak Terdaftar)
```bash
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email": "tidakada@localhost", "password": "rahasia"}'
```
**Ekspektasi Output:**
- Status Code: `400 Bad Request`
- Body:
  ```json
  {
    "error": "Email atau password salah"
  }
  ```

#### Skenario 4: Request Body Tidak Valid / Kosong
```bash
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email": "bukan-email-valid"}'
```
**Ekspektasi Output:**
- Status Code: `400` atau `422`
- Menampilkan pesan error validasi input dari Elysia TypeBox.

---

## 6. Kriteria Keberhasilan (Acceptance Criteria)

- [x] Tabel `session` didefinisikan di `src/db/schema.ts` dengan kolom `id`, `token` (varchar 255 unique), `user_id` (integer FK ke users), dan `created_at` (timestamp default current timestamp).
- [x] Berhasil menerapkan perubahan skema ke MySQL menggunakan `bun run db:push`.
- [x] Token login di-generate menggunakan format UUID valid (`crypto.randomUUID()`).
- [x] Password diverifikasi menggunakan `Bun.password.verify`.
- [x] Endpoint `POST /api/users/login` berhasil mengembalikan `{ "data": "<token>" }` dengan status HTTP 200 saat kredensial valid.
- [x] Record sesi baru tersimpan dengan benar di tabel `session`.
- [x] Endpoint mengembalikan `{ "error": "Email atau password salah" }` dengan status HTTP 400 saat email tidak ditemukan atau password salah.
- [x] Request body tidak valid ditolak oleh validator skema Elysia.
- [x] Project bebas error kompilasi TypeScript (`bun run typecheck`).
