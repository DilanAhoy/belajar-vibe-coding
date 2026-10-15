import { Elysia } from "elysia";
import { usersRoutes } from "./routes/users.routes";

const port = Number(process.env.PORT) || 3000;

export const app = new Elysia()
  .get("/", () => ({
    message: "Welcome to ElysiaJS + Bun + Drizzle + MySQL!",
    status: "ok",
  }))
  .get("/health", () => ({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }))
  .use(usersRoutes)
  .listen(port);

console.log(
  `🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`
);
