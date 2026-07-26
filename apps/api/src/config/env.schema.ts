import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be >= 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be >= 32 characters"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("30d"),
  N8N_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
  N8N_WEBHOOK_SECRET: z.string().optional().or(z.literal("")),
  N8N_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  SCHEDULER_ENABLED: z
    .union([z.literal("true"), z.literal("false")])
    .default("true")
    .transform((v) => v === "true"),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  SEED_PASSWORD: z.string().default("DemoPassword123!"),
  ALLOW_PROD_SEED: z
    .union([z.literal("true"), z.literal("false")])
    .default("false")
    .transform((v) => v === "true"),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment configuration:", result.error.flatten().fieldErrors);
    throw new Error("The API refuses to boot with a missing or weak environment configuration.");
  }

  if (result.data.JWT_ACCESS_SECRET === result.data.JWT_REFRESH_SECRET) {
    throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different.");
  }

  return result.data;
}
