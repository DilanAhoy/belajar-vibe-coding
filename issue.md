# [Bug] Kurangnya Pembatasan Panjang Maksimal (maxLength) pada Input Registrasi User

## 1. Ringkasan & Deskripsi Masalah
Pada endpoint registrasi user (`POST /api/users`), sistem belum membatasi panjang karakter maksimal (`maxLength`) pada field request body, khususnya pada atribut `name`. 

Ketika client mengirimkan payload registrasi dengan nilai `name` sepanjang 300 karakter (melebihi kapasitas kolom database `VARCHAR(255)`):
1. **Pada database non-strict mode (default XAMPP/MariaDB)**: Request lolos dengan status `200 OK`, namun nilai `name` dipotong secara diam-diam (*silent data loss / truncation*) menjadi 255 karakter saat disimpan ke database.
2. **Pada database strict mode (`STRICT_TRANS_TABLES` / Production MySQL)**: Operasi `INSERT` akan melempar fatal error `ER_DATA_TOO_LONG: Data too long for column 'name' at row 1`, yang menyebabkan server merespons dengan status `500 Terjadi kesalahan pada server` alih-alih ditolak rapi pada layer validasi request.

Dokumen ini disusun sebagai panduan perbaikan yang presisi dan bertahap agar dapat diimplementasikan oleh junior programmer atau model AI.

---

## 2. Analisis Akar Masalah (Root Cause)

1. **Layer Route & Validator (`src/routes/users.routes.ts`)**:
   Skema validasi TypeBox saat ini hanya memvalidasi `minLength: 1` tanpa menentukan `maxLength`:
   ```typescript
   body: t.Object({
     name: t.String({ minLength: 1 }),
     email: t.String({ minLength: 1 }),
     password: t.String({ minLength: 1 }),
   })
   ```
2. **Layer Database Skema (`src/db/schema.ts`)**:
   Kolom `name` dan `email` didefinisikan dengan tipe `varchar(255)`:
   ```typescript
   name: varchar("name", { length: 255 }).notNull(),
   email: varchar("email", { length: 255 }).notNull().unique(),
   ```
   Karena batas maksimal tidak diverifikasi di route validator, request payload dengan ukuran sembarang (> 255 karakter) diteruskan langsung ke query database.

---

## 3. Langkah Reproduksi Bug (Steps to Reproduce)

1. Jalankan aplikasi backend (`bun src/index.ts` atau `bun run dev`).
2. Kirim request HTTP POST ke endpoint registrasi dengan payload `name` berisi string 300 karakter:
   ```bash
   curl -X POST http://localhost:3000/api/users \
     -H "Content-Type: application/json" \
     -d '{
       "name": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
       "email": "test_bug_length@localhost",
       "password": "password123"
     }'
   ```
3. Periksa status respons server dan data di database:
   - Server mengembalikan `200 OK: { "data": "OK" }`.
   - Query record di database: `SELECT LENGTH(name), name FROM users WHERE email = 'test_bug_length@localhost';`.
   - Terlihat data `name` terpotong tepat pada panjang 255 karakter (*silent truncation*).

---

## 4. Perilaku Saat Ini vs Perilaku yang Diharapkan

| Skenario | Perilaku Saat Ini (Bug) | Perilaku yang Diharapkan (Expected) |
| :--- | :--- | :--- |
| `name` > 255 karakter | Lolos validasi, mengembalikan 200 OK (atau 500 jika strict mode), data terpotong di DB | Ditolak oleh validator route, mengembalikan **400 Bad Request** dengan pesan error yang jelas |
| `email` > 255 karakter | Lolos validasi, berpotensi gagal di DB | Ditolak oleh validator route dengan **400 Bad Request** |
| `password` terlalu panjang (> 100 karakter) | Diproses oleh hashing bcrypt (beban komputasi tinggi / DoS risk) | Ditolak dengan **400 Bad Request** jika melebihi batas wajar (misal: 100 karakter) |

---

## 5. Spesifikasi Kontrak API Setelah Perbaikan

### Endpoint:
`POST /api/users`

### Aturan Validasi Request Body:
- `name`: Tipe `string`, minimal 1 karakter (`minLength: 1`), maksimal 255 karakter (`maxLength: 255`).
- `email`: Tipe `string`, format email valid (`format: "email"`), minimal 1 karakter, maksimal 255 karakter (`maxLength: 255`).
- `password`: Tipe `string`, minimal 1 karakter (`minLength: 1`), maksimal 100 karakter (`maxLength: 100`).

### Ekspektasi Response Body:
- **Valid (Panjang Sesuai Batas)**:
  - Status: `200 OK` atau `201 Created`
  - Body: `{ "data": "OK" }`
- **Invalid (`name` > 255 karakter)**:
  - Status: `400 Bad Request`
  - Body:
    ```json
    {
      "error": "Expected string length less than or equal to 255"
    }
    ```
    *(atau pesan error validasi TypeBox Elysia terkait property name)*

---

## 6. Tahapan Perbaikan Langkah-demi-Langkah

Ikuti urutan langkah kerja berikut ini secara berurutan:

### Langkah 1: Perbarui Skema Validasi Body di Route (`src/routes/users.routes.ts`)
1. Buka file `src/routes/users.routes.ts`.
2. Pada definisi route `POST /users`, perbarui schema validator TypeBox pada opsi `body`:
   ```typescript
   {
     body: t.Object({
       name: t.String({
         minLength: 1,
         maxLength: 255,
       }),
       email: t.String({
         minLength: 1,
         maxLength: 255,
         format: "email",
       }),
       password: t.String({
         minLength: 1,
         maxLength: 100,
       }),
     }),
   }
   ```
3. Simpan perubahan file.

---

### Langkah 2: Tambahkan Automated Test Case (`tests/users.test.ts`)
1. Buka file `tests/users.test.ts`.
2. Pada suite `describe("Validation Errors", ...)`, tambahkan unit test untuk memvalidasi batas maksimal panjang input:
   ```typescript
   it("should return 400 when registration name exceeds 255 characters", async () => {
     const longName = "A".repeat(256);
     const res = await app.handle(
       new Request("http://localhost/api/users", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           name: longName,
           email: "valid_email@localhost",
           password: "password123",
         }),
       })
     );

     expect(res.status).toBe(400);
     const data = await res.json();
     expect(data).toHaveProperty("error");
   });

   it("should return 400 when registration email exceeds 255 characters", async () => {
     const longEmail = "a".repeat(250) + "@localhost.com";
     const res = await app.handle(
       new Request("http://localhost/api/users", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           name: "Valid Name",
           email: longEmail,
           password: "password123",
         }),
       })
     );

     expect(res.status).toBe(400);
     const data = await res.json();
     expect(data).toHaveProperty("error");
   });
   ```

---

### Langkah 3: Verifikasi Test & TypeScript Typecheck
1. Jalankan test otomatis:
   ```bash
   bun test
   ```
   Pastikan seluruh skenario test (termasuk skenario baru untuk `maxLength`) berstatus **PASS**.
2. Jalankan pemeriksaan tipe data:
   ```bash
   bun run typecheck
   ```
   Pastikan tidak ada error TypeScript (`0 errors`).

---

## 7. Kriteria Keberhasilan (Acceptance Criteria)

- [x] Skema validasi `body` pada endpoint `POST /api/users` di `src/routes/users.routes.ts` memiliki batasan `maxLength: 255` untuk `name` dan `email`, serta `maxLength: 100` untuk `password`.
- [x] Format email diverifikasi dengan `format: "email"` pada skema TypeBox.
- [x] Request registrasi dengan `name` sepanjang > 255 karakter (seperti 300 karakter) otomatis ditolak dengan HTTP `400 Bad Request` sebelum masuk ke service/database.
- [x] Tidak ada lagi pemotongan data (*silent truncation*) pada database.
- [x] Penambahan unit test baru di `tests/users.test.ts` untuk kasus batas panjang input lolos pengujian (`bun test`).
- [x] Proyek lolos pemeriksaan tipe TypeScript (`bun run typecheck`).
