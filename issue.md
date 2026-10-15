# [Feature] Registrasi User Baru (API & Database Migration)

## 1. Ringkasan & Tujuan
Fitur ini bertujuan untuk menyediakan endpoint registrasi akun pengguna baru pada aplikasi backend berbasis **Bun**, **ElysiaJS**, dan **Drizzle ORM (MySQL)**.

Dokumen perencanaan ini dirancang secara detail dan terstruktur sebagai panduan teknis yang mudah diikuti oleh junior programmer atau model AI agar implementasi berjalan tepat, teruji, dan sesuai arsitektur proyek.

---

## 2. Struktur Arsitektur & Folder

Aplikasi menggunakan pemisahan tanggung jawab (*separation of concerns*) antara layer routing dan layer bisnis/service:

```text
src/
├── db/
│   ├── index.ts              # Konfigurasi instance Drizzle ORM
│   └── schema.ts             # Definisi skema tabel database
├── routes/
│   └── users.routes.ts       # Handler routing ElysiaJS & validasi request
├── services/
│   └── users.services.ts     # Logika bisnis (cek duplikasi, hashing, query DB)
└── index.ts                  # Entry point utama server ElysiaJS
```

### Aturan Penamaan File & Tanggung Jawab:
- **`src/routes/*.routes.ts`**: Menangani HTTP request, schema validation (Elysia `t`), pemetaan HTTP status code, dan memanggil fungsi service yang bersangkutan.
- **`src/services/*.services.ts`**: Menangani logika bisnis inti, hashing password, interaksi dengan Drizzle DB, dan melemparkan custom error jika aturan bisnis dilanggar.

---

## 3. Spesifikasi Skema Database

Tabel yang dibuat/diperbarui adalah tabel **`users`** di file `src/db/schema.ts`.

### Definisi Kolom:
| Nama Kolom | Tipe Data MySQL | Keterangan |
| :--- | :--- | :--- |
| `id` | `INT` / `BIGINT` | Primary Key, Auto Increment |
| `name` | `VARCHAR(255)` | Not Null |
| `email` | `VARCHAR(255)` | Not Null, Unique Index |
| `password` | `VARCHAR(255)` | Not Null, Hash bcrypt |
| `create_at` | `TIMESTAMP` | Default `CURRENT_TIMESTAMP`, Not Null |

### Contoh Implementasi Skema (`src/db/schema.ts`):
```typescript
import { mysqlTable, int, varchar, timestamp } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  createAt: timestamp("create_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

---

## 4. Spesifikasi Kontrak API

### Endpoint:
`POST /api/users`

### Request Header:
- `Content-Type: application/json`

### Request Body:
```json
{
  "name": "Dilan",
  "email": "dilan@localhost",
  "password": "rahasia"
}
```

### Validasi Input:
- `name`: Tipe `string`, wajib diisi (minimal 1 karakter).
- `email`: Tipe `string`, format email valid, wajib diisi.
- `password`: Tipe `string`, wajib diisi (disarankan minimal 6-8 karakter).

### Response Sukses (HTTP 201 Created atau 200 OK):
```json
{
  "data": "OK"
}
```

### Response Error - Email Duplikat (HTTP 400 Bad Request):
```json
{
  "error": "Email sudah terdaftar"
}
```

### Response Error - Validasi Input Gagal (HTTP 422 / 400):
Dihandle otomatis oleh Elysia TypeBox validator jika format data tidak sesuai.

---

## 5. Tahapan Implementasi Langkah-demi-Langkah

Ikuti urutan langkah kerja berikut ini secara berurutan:

### Langkah 1: Perbarui Skema Database & Lakukan Sinkronisasi
1. Buka file `src/db/schema.ts`.
2. Tambahkan kolom `password` dan pastikan nama kolom timestamp adalah `create_at` dengan default `CURRENT_TIMESTAMP` sesuai spesifikasi di atas.
3. Jalankan perintah migrasi atau sinkronisasi skema ke database:
   ```bash
   bun run db:push
   ```
4. Pastikan tabel `users` berhasil terupdate di database MySQL tanpa error.

---

### Langkah 2: Buat Service Layer (`src/services/users.services.ts`)
1. Buat direktori `src/services/` jika belum ada.
2. Buat file baru bernama `src/services/users.services.ts`.
3. Implementasikan fungsi `registerUser(payload: RegisterUserInput)` dengan alur:
   - **Cek keberadaan email**: Lakukan query ke database untuk memeriksa apakah `email` sudah digunakan:
     ```typescript
     const existingUser = await db
       .select()
       .from(users)
       .where(eq(users.email, payload.email))
       .limit(1);
     ```
   - **Validasi duplikasi**: Jika `existingUser.length > 0`, lempar error spesifik (misal: `new Error("Email sudah terdaftar")`).
   - **Hashing Password**: Gunakan fungsi hashing native Bun dengan algoritma **bcrypt**:
     ```typescript
     const hashedPassword = await Bun.password.hash(payload.password, {
       algorithm: "bcrypt",
       cost: 10,
     });
     ```
     *(Catatan: Runtime Bun telah memiliki modul hashing bcrypt bawaan melalui `Bun.password`, sehingga tidak memerlukan library tambahan).*
   - **Simpan ke Database**:
     ```typescript
     await db.insert(users).values({
       name: payload.name,
       email: payload.email,
       password: hashedPassword,
     });
     ```
   - **Kembalikan status**: Return hasil atau flag sukses.

---

### Langkah 3: Buat Route Layer (`src/routes/users.routes.ts`)
1. Buat direktori `src/routes/` jika belum ada.
2. Buat file baru bernama `src/routes/users.routes.ts`.
3. Gunakan instance `Elysia` dan definisikan route `POST /users` (dengan prefix group `/api` atau path `/api/users`).
4. Gunakan schema validator bawaan Elysia (`t` dari `elysia`) untuk memvalidasi request body:
   ```typescript
   {
     body: t.Object({
       name: t.String(),
       email: t.String({ format: "email" }),
       password: t.String(),
     })
   }
   ```
5. Di dalam handler:
   - Panggil service `registerUser(body)`.
   - Jika sukses: kembalikan `{ data: "OK" }` dengan status code `201` atau `200`.
   - Tangani error duplikasi email: Jika service melempar error `"Email sudah terdaftar"`, set `set.status = 400` dan kembalikan `{ error: "Email sudah terdaftar" }`.
   - Tangani error tak terduga lainnya dengan status code `500`.

---

### Langkah 4: Registrasikan Routes ke Server Utama (`src/index.ts`)
1. Buka file `src/index.ts`.
2. Import `userRoutes` dari `./routes/users.routes`.
3. Pasang route ke instance aplikasi Elysia menggunakan `.use(userRoutes)`.
4. Jalankan dev server untuk memverifikasi tidak ada error saat server dijalankan:
   ```bash
   bun run dev
   ```

---

### Langkah 5: Pengujian & Verifikasi Endpoint

Lakukan pengujian manual menggunakan `curl`, Postman, atau REST client lainnya:

#### Skenario 1: Registrasi Berhasil
Kirim request:
```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Dilan", "email": "dilan@localhost", "password": "rahasia"}'
```
**Ekspektasi Output:**
- Status Code: `200` atau `201`
- Body:
  ```json
  {
    "data": "OK"
  }
  ```
- Di Database: Password tersimpan dalam bentuk string hash bcrypt (misal diawali `$2b$` atau `$2a$`), bukan plain text.

#### Skenario 2: Registrasi dengan Email yang Sama (Duplikat)
Kirim kembali request yang sama persis seperti pada Skenario 1.

**Ekspektasi Output:**
- Status Code: `400`
- Body:
  ```json
  {
    "error": "Email sudah terdaftar"
  }
  ```

#### Skenario 3: Request Body Tidak Valid / Kosong
Kirim request dengan format body salah (misal email tidak ada atau bukan string):
```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Dilan"}'
```
**Ekspektasi Output:**
- Status Code: `400` atau `422`
- Menampilkan pesan error validasi skema dari Elysia.

---

## 6. Kriteria Keberhasilan (Acceptance Criteria)

- [x] File `src/db/schema.ts` memiliki tabel `users` dengan kolom: `id`, `name`, `email` (unique), `password` (bcrypt hash), dan `create_at` (timestamp default current timestamp).
- [x] Berhasil melakukan push skema Drizzle ke database (`bun run db:push`).
- [x] File `src/services/users.services.ts` dibuat dan menangani logika hashing password serta query database.
- [x] Password disimpan menggunakan hashing bcrypt (menggunakan `Bun.password.hash`).
- [x] File `src/routes/users.routes.ts` dibuat dengan validasi input Elysia TypeBox.
- [x] Endpoint `POST /api/users` terdaftar di `src/index.ts`.
- [x] Request valid mengembalikan `{ "data": "OK" }`.
- [x] Request dengan email yang sudah ada mengembalikan `{ "error": "Email sudah terdaftar" }` dengan status code `400`.
- [x] Kode bebas dari TypeScript error (`bun run typecheck`).
