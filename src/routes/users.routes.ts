import { Elysia, t } from "elysia";
import {
  registerUserService,
  loginUserService,
  getCurrentUserService,
  logoutUserService,
  DuplicateEmailError,
  AuthenticationError,
  UnauthorizedError,
} from "../services/users.services";

export const usersRoutes = new Elysia({ prefix: "/api" })
  .onError(({ error, code, set }) => {
    if (
      error instanceof DuplicateEmailError ||
      error instanceof AuthenticationError
    ) {
      set.status = 400;
      return {
        error: error.message,
      };
    }

    if (error instanceof UnauthorizedError) {
      set.status = 401;
      return {
        error: error.message,
      };
    }

    if (code === "VALIDATION") {
      set.status = 400;
      return {
        error: error.message,
      };
    }

    set.status = 500;
    return {
      error: "Terjadi kesalahan pada server",
    };
  })
  .post(
    "/users",
    async ({ body }) => {
      return await registerUserService(body);
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        email: t.String({ minLength: 1 }),
        password: t.String({ minLength: 1 }),
      }),
    }
  )
  .post(
    "/users/login",
    async ({ body }) => {
      return await loginUserService(body);
    },
    {
      body: t.Object({
        email: t.String({ minLength: 1 }),
        password: t.String({ minLength: 1 }),
      }),
    }
  )
  .get("/users/current", async ({ headers }) => {
    const authHeader = headers["authorization"];
    const user = await getCurrentUserService(authHeader);
    return {
      data: user,
    };
  })
  .delete("/users/logout", async ({ headers }) => {
    const authHeader = headers["authorization"];
    return await logoutUserService(authHeader);
  });
