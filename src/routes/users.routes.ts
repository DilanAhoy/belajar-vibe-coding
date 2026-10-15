import { Elysia, t } from "elysia";
import {
  registerUserService,
  DuplicateEmailError,
} from "../services/users.services";

export const usersRoutes = new Elysia({ prefix: "/api" }).post(
  "/users",
  async ({ body, set }) => {
    try {
      const result = await registerUserService(body);
      return result;
    } catch (error) {
      if (error instanceof DuplicateEmailError) {
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
      name: t.String({ minLength: 1 }),
      email: t.String({ minLength: 1 }),
      password: t.String({ minLength: 1 }),
    }),
  }
);
