import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { usersRoutes } from "../src/routes/users.routes";
import {
  extractBearerToken,
  DuplicateEmailError,
  AuthenticationError,
  UnauthorizedError,
} from "../src/services/users.services";

describe("Users Services & Helpers", () => {
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

describe("Users Routes & Error Handling", () => {
  const app = new Elysia().use(usersRoutes);

  describe("Validation Errors", () => {
    it("should return 400 when registration body is invalid or empty", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toHaveProperty("error");
    });

    it("should return 400 when login body is missing password", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/users/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "test@localhost" }),
        })
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toHaveProperty("error");
    });

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

    it("should return 400 when registration email format is invalid", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Valid Name",
            email: "not-an-email",
            password: "password123",
          }),
        })
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toHaveProperty("error");
    });

    it("should return 400 when registration password exceeds 100 characters", async () => {
      const longPassword = "p".repeat(101);
      const res = await app.handle(
        new Request("http://localhost/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Valid Name",
            email: "valid@localhost.com",
            password: longPassword,
          }),
        })
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toHaveProperty("error");
    });
  });

  describe("Protected Endpoints Authorization Handling", () => {
    it("GET /api/users/current should return 401 when Authorization header is missing", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/users/current", {
          method: "GET",
        })
      );

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toEqual({ error: "Unauthorized" });
    });

    it("GET /api/users/current should return 401 when Authorization is not Bearer", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/users/current", {
          method: "GET",
          headers: { Authorization: "Basic 123456" },
        })
      );

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toEqual({ error: "Unauthorized" });
    });

    it("DELETE /api/users/logout should return 401 when Authorization header is missing", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/users/logout", {
          method: "DELETE",
        })
      );

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toEqual({ error: "Unauthorized" });
    });

    it("DELETE /api/users/logout should return 401 when Authorization format is invalid", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/users/logout", {
          method: "DELETE",
          headers: { Authorization: "Token abc-123" },
        })
      );

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toEqual({ error: "Unauthorized" });
    });
  });
});
