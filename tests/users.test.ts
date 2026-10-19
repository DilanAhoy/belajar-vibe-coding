import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { usersRoutes } from "../src/routes/users.routes";
import {
  extractBearerToken,
  DuplicateEmailError,
  AuthenticationError,
  UnauthorizedError,
} from "../src/services/users.services";
import { db, connectionPool } from "../src/db";
import { users, sessions } from "../src/db/schema";

const app = new Elysia().use(usersRoutes);

describe("Users Unit & Integration Tests", () => {
  // Bersihkan data sebelum setiap pengujian agar state konsisten dan terisolasi
  beforeEach(async () => {
    await db.delete(sessions);
    await db.delete(users);
  });

  // Tutup koneksi database setelah seluruh pengujian selesai
  afterAll(async () => {
    await db.delete(sessions);
    await db.delete(users);
    await connectionPool.end();
  });

  describe("A. Helper & Custom Error Classes", () => {
    describe("extractBearerToken", () => {
      it("should extract token correctly when Bearer header is valid", () => {
        const token = "my-secret-session-token-123";
        expect(extractBearerToken(`Bearer ${token}`)).toBe(token);
      });

      it("should extract token with case-insensitive bearer prefix", () => {
        const token = "my-secret-session-token-123";
        expect(extractBearerToken(`bearer ${token}`)).toBe(token);
      });

      it("should throw UnauthorizedError when authHeader is undefined", () => {
        expect(() => extractBearerToken(undefined)).toThrow(UnauthorizedError);
      });

      it("should throw UnauthorizedError when authHeader does not start with Bearer", () => {
        expect(() => extractBearerToken("Basic 123456")).toThrow(UnauthorizedError);
      });

      it("should throw UnauthorizedError when token is empty", () => {
        expect(() => extractBearerToken("Bearer ")).toThrow(UnauthorizedError);
      });
    });

    describe("Custom Error Classes", () => {
      it("should initialize DuplicateEmailError correctly", () => {
        const err = new DuplicateEmailError();
        expect(err.name).toBe("DuplicateEmailError");
        expect(err.message).toBe("Email sudah terdaftar");
      });

      it("should initialize AuthenticationError correctly", () => {
        const err = new AuthenticationError();
        expect(err.name).toBe("AuthenticationError");
        expect(err.message).toBe("Email atau password salah");
      });

      it("should initialize UnauthorizedError correctly", () => {
        const err = new UnauthorizedError();
        expect(err.name).toBe("UnauthorizedError");
        expect(err.message).toBe("Unauthorized");
      });
    });
  });

  describe("B. POST /api/users (Registrasi Pengguna)", () => {
    describe("Skenario Positif (Sukses)", () => {
      it("should successfully register a new user and hash the password with bcrypt", async () => {
        const payload = {
          name: "Dilan",
          email: "dilan@example.com",
          password: "password123",
        };

        const res = await app.handle(
          new Request("http://localhost/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ data: "OK" });

        // Verifikasi langsung ke database
        const [savedUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, payload.email))
          .limit(1);

        expect(savedUser).toBeDefined();
        expect(savedUser!.name).toBe(payload.name);
        expect(savedUser!.email).toBe(payload.email);
        expect(savedUser!.password).not.toBe(payload.password);

        // Verifikasi bahwa password di-hash menggunakan bcrypt
        const isPasswordValid = await Bun.password.verify(
          payload.password,
          savedUser!.password
        );
        expect(isPasswordValid).toBe(true);
      });

      it("should accept minimum valid length inputs (edge case: 1 char name and password)", async () => {
        const payload = {
          name: "A",
          email: "a@b.com",
          password: "1",
        };

        const res = await app.handle(
          new Request("http://localhost/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        );

        expect(res.status).toBe(200);
        const [savedUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, payload.email))
          .limit(1);
        expect(savedUser).toBeDefined();
        expect(savedUser!.name).toBe("A");
      });

      it("should accept maximum length inputs (edge case: 255 chars name and email)", async () => {
        const maxName = "N".repeat(255);
        // Buat email valid tepat 255 karakter
        const localPart = "a".repeat(240);
        const maxEmail = `${localPart}@example.com`; // 240 + 12 = 252 karakter (<= 255)

        const payload = {
          name: maxName,
          email: maxEmail,
          password: "p".repeat(100),
        };

        const res = await app.handle(
          new Request("http://localhost/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        );

        expect(res.status).toBe(200);
        const [savedUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, payload.email))
          .limit(1);

        expect(savedUser).toBeDefined();
        expect(savedUser!.name.length).toBe(255);
        expect(savedUser!.name).toBe(maxName);
      });
    });

    describe("Skenario Negatif & Validasi", () => {
      it("should return 400 when email is already registered (duplicate email)", async () => {
        const payload = {
          name: "User Pertama",
          email: "duplicate@example.com",
          password: "password123",
        };

        // Registrasi pertama
        const firstRes = await app.handle(
          new Request("http://localhost/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        );
        expect(firstRes.status).toBe(200);

        // Registrasi kedua dengan email sama
        const secondRes = await app.handle(
          new Request("http://localhost/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        );

        expect(secondRes.status).toBe(400);
        const body = await secondRes.json();
        expect(body).toEqual({ error: "Email sudah terdaftar" });
      });

      it("should return 400 when email format is invalid", async () => {
        const res = await app.handle(
          new Request("http://localhost/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "User Test",
              email: "bukan-format-email",
              password: "password123",
            }),
          })
        );

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body).toHaveProperty("error");
      });

      it("should return 400 when name exceeds 255 characters", async () => {
        const res = await app.handle(
          new Request("http://localhost/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "A".repeat(256),
              email: "valid@example.com",
              password: "password123",
            }),
          })
        );

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body).toHaveProperty("error");
      });

      it("should return 400 when email exceeds 255 characters", async () => {
        const res = await app.handle(
          new Request("http://localhost/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "User Test",
              email: "a".repeat(250) + "@longdomain.com",
              password: "password123",
            }),
          })
        );

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body).toHaveProperty("error");
      });

      it("should return 400 when password exceeds 100 characters", async () => {
        const res = await app.handle(
          new Request("http://localhost/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "User Test",
              email: "valid@example.com",
              password: "p".repeat(101),
            }),
          })
        );

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body).toHaveProperty("error");
      });

      it("should return 400 when body is empty or required fields are missing", async () => {
        const resEmpty = await app.handle(
          new Request("http://localhost/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          })
        );
        expect(resEmpty.status).toBe(400);

        const resNoPassword = await app.handle(
          new Request("http://localhost/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "User Test",
              email: "nopass@example.com",
            }),
          })
        );
        expect(resNoPassword.status).toBe(400);
      });

      it("should return 400 when field types are invalid", async () => {
        const res = await app.handle(
          new Request("http://localhost/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: 12345,
              email: "valid@example.com",
              password: "password123",
            }),
          })
        );

        expect(res.status).toBe(400);
      });
    });
  });

  describe("C. POST /api/users/login (Login Pengguna)", () => {
    const defaultUser = {
      name: "Login User",
      email: "login@example.com",
      password: "password123",
    };

    beforeEach(async () => {
      // Registrasi user default untuk pengujian login
      await app.handle(
        new Request("http://localhost/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(defaultUser),
        })
      );
    });

    describe("Skenario Positif (Sukses)", () => {
      it("should login successfully with correct credentials and create a session in database", async () => {
        const res = await app.handle(
          new Request("http://localhost/api/users/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: defaultUser.email,
              password: defaultUser.password,
            }),
          })
        );

        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: string };
        expect(body).toHaveProperty("data");
        expect(typeof body.data).toBe("string");
        expect(body.data.length).toBeGreaterThan(0);

        // Verifikasi token sesi tersimpan di tabel session
        const [sessionRecord] = await db
          .select()
          .from(sessions)
          .where(eq(sessions.token, body.data))
          .limit(1);

        expect(sessionRecord).toBeDefined();
        expect(sessionRecord!.token).toBe(body.data);
      });
    });

    describe("Skenario Negatif & Validasi", () => {
      it("should return 400 when email is not registered", async () => {
        const res = await app.handle(
          new Request("http://localhost/api/users/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: "unregistered@example.com",
              password: "password123",
            }),
          })
        );

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body).toEqual({ error: "Email atau password salah" });
      });

      it("should return 400 when password is incorrect", async () => {
        const res = await app.handle(
          new Request("http://localhost/api/users/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: defaultUser.email,
              password: "wrongpassword",
            }),
          })
        );

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body).toEqual({ error: "Email atau password salah" });
      });

      it("should return 400 when login email format is invalid", async () => {
        const res = await app.handle(
          new Request("http://localhost/api/users/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: "invalid-email-format",
              password: "password123",
            }),
          })
        );

        expect(res.status).toBe(400);
      });

      it("should return 400 when required fields are missing", async () => {
        const res = await app.handle(
          new Request("http://localhost/api/users/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: defaultUser.email }),
          })
        );

        expect(res.status).toBe(400);
      });

      it("should return 400 when login input length exceeds maximum allowed", async () => {
        const res = await app.handle(
          new Request("http://localhost/api/users/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: defaultUser.email,
              password: "p".repeat(101),
            }),
          })
        );

        expect(res.status).toBe(400);
      });
    });
  });

  describe("D. GET /api/users/current (Profil Pengguna Aktif)", () => {
    let validToken: string;
    let registeredUser = {
      name: "Profile User",
      email: "profile@example.com",
      password: "password123",
    };

    beforeEach(async () => {
      // Register & Login untuk mendapatkan token aktif
      await app.handle(
        new Request("http://localhost/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(registeredUser),
        })
      );

      const loginRes = await app.handle(
        new Request("http://localhost/api/users/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: registeredUser.email,
            password: registeredUser.password,
          }),
        })
      );
      const loginBody = (await loginRes.json()) as { data: string };
      validToken = loginBody.data;
    });

    describe("Skenario Positif (Sukses)", () => {
      it("should return user profile with valid token and exclude password field", async () => {
        const res = await app.handle(
          new Request("http://localhost/api/users/current", {
            method: "GET",
            headers: { Authorization: `Bearer ${validToken}` },
          })
        );

        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: Record<string, any> };
        expect(body).toHaveProperty("data");
        expect(body.data.name).toBe(registeredUser.name);
        expect(body.data.email).toBe(registeredUser.email);
        expect(body.data).toHaveProperty("id");
        expect(body.data).toHaveProperty("created_at");

        // Memastikan field password TIDAK bocor ke client
        expect(body.data.password).toBeUndefined();
      });
    });

    describe("Skenario Negatif & Autentikasi", () => {
      it("should return 401 when Authorization header is missing", async () => {
        const res = await app.handle(
          new Request("http://localhost/api/users/current", {
            method: "GET",
          })
        );

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body).toEqual({ error: "Unauthorized" });
      });

      it("should return 401 when Authorization format is not Bearer", async () => {
        const res = await app.handle(
          new Request("http://localhost/api/users/current", {
            method: "GET",
            headers: { Authorization: "Basic 123456" },
          })
        );

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body).toEqual({ error: "Unauthorized" });
      });

      it("should return 401 when token string is empty after Bearer prefix", async () => {
        const res = await app.handle(
          new Request("http://localhost/api/users/current", {
            method: "GET",
            headers: { Authorization: "Bearer " },
          })
        );

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body).toEqual({ error: "Unauthorized" });
      });

      it("should return 401 when token is fake or does not exist in sessions table", async () => {
        const res = await app.handle(
          new Request("http://localhost/api/users/current", {
            method: "GET",
            headers: { Authorization: "Bearer fake-nonexistent-token" },
          })
        );

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body).toEqual({ error: "Unauthorized" });
      });

      it("should return 401 when session exists but user record is deleted", async () => {
        // Hapus user terkait dari tabel users secara langsung
        await db.delete(users).where(eq(users.email, registeredUser.email));

        const res = await app.handle(
          new Request("http://localhost/api/users/current", {
            method: "GET",
            headers: { Authorization: `Bearer ${validToken}` },
          })
        );

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body).toEqual({ error: "Unauthorized" });
      });
    });
  });

  describe("E. DELETE /api/users/logout (Logout Pengguna)", () => {
    let validToken: string;
    let registeredUser = {
      name: "Logout User",
      email: "logout@example.com",
      password: "password123",
    };

    beforeEach(async () => {
      // Register & Login untuk mendapatkan token aktif
      await app.handle(
        new Request("http://localhost/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(registeredUser),
        })
      );

      const loginRes = await app.handle(
        new Request("http://localhost/api/users/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: registeredUser.email,
            password: registeredUser.password,
          }),
        })
      );
      const loginBody = (await loginRes.json()) as { data: string };
      validToken = loginBody.data;
    });

    describe("Skenario Positif (Sukses)", () => {
      it("should logout successfully, delete session from database, and invalidate subsequent requests", async () => {
        // 1. Panggil endpoint logout
        const logoutRes = await app.handle(
          new Request("http://localhost/api/users/logout", {
            method: "DELETE",
            headers: { Authorization: `Bearer ${validToken}` },
          })
        );

        expect(logoutRes.status).toBe(200);
        const logoutBody = await logoutRes.json();
        expect(logoutBody).toEqual({ data: "OK" });

        // 2. Verifikasi record sesi terhapus dari tabel database
        const [deletedSession] = await db
          .select()
          .from(sessions)
          .where(eq(sessions.token, validToken))
          .limit(1);

        expect(deletedSession).toBeUndefined();

        // 3. Verifikasi token yang sama tidak dapat lagi dipakai untuk GET /api/users/current
        const currentRes = await app.handle(
          new Request("http://localhost/api/users/current", {
            method: "GET",
            headers: { Authorization: `Bearer ${validToken}` },
          })
        );

        expect(currentRes.status).toBe(401);
        const currentBody = await currentRes.json();
        expect(currentBody).toEqual({ error: "Unauthorized" });
      });
    });

    describe("Skenario Negatif & Autentikasi", () => {
      it("should return 401 when Authorization header is missing on logout", async () => {
        const res = await app.handle(
          new Request("http://localhost/api/users/logout", {
            method: "DELETE",
          })
        );

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body).toEqual({ error: "Unauthorized" });
      });

      it("should return 401 when Authorization header is not Bearer on logout", async () => {
        const res = await app.handle(
          new Request("http://localhost/api/users/logout", {
            method: "DELETE",
            headers: { Authorization: "Basic 123456" },
          })
        );

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body).toEqual({ error: "Unauthorized" });
      });

      it("should return 401 when token does not exist in sessions table", async () => {
        const res = await app.handle(
          new Request("http://localhost/api/users/logout", {
            method: "DELETE",
            headers: { Authorization: "Bearer token-tidak-terdaftar" },
          })
        );

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body).toEqual({ error: "Unauthorized" });
      });

      it("should return 401 on double logout attempt with the same token", async () => {
        // Logout pertama (berhasil)
        const firstLogout = await app.handle(
          new Request("http://localhost/api/users/logout", {
            method: "DELETE",
            headers: { Authorization: `Bearer ${validToken}` },
          })
        );
        expect(firstLogout.status).toBe(200);

        // Logout kedua dengan token yang sama (harus 401 Unauthorized)
        const secondLogout = await app.handle(
          new Request("http://localhost/api/users/logout", {
            method: "DELETE",
            headers: { Authorization: `Bearer ${validToken}` },
          })
        );

        expect(secondLogout.status).toBe(401);
        const body = await secondLogout.json();
        expect(body).toEqual({ error: "Unauthorized" });
      });
    });
  });
});
