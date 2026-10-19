import { z } from "zod";

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const limit = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_URL: z.url().default("http://localhost:3000"),
  OTP_MODE: z.enum(["mock", "sms"]).default("mock"),
  DEMO_MODE: z.stringbool().default(false),
  OTP_LIMIT_PHONE_15M: limit(3),
  OTP_LIMIT_PHONE_DAY: limit(10),
  OTP_LIMIT_IP_15M: limit(30),
  OTP_LIMIT_IP_DAY: limit(200),
  CRON_SECRET: optionalString,
  RAZORPAY_KEY_ID: optionalString,
  RAZORPAY_KEY_SECRET: optionalString,
  PLATFORM_GSTIN: optionalString,
  // Push and SMS notifications are stubs until a provider is chosen; "log" prints what they would send.
  NOTIFY_STUBS: z.enum(["off", "log"]).default("off"),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${problems}`);
  }
  return result.data;
}

/**
 * Mock OTP accepts any code, so it must never run in production unless the deployment is an
 * explicit demo. Returns the reason the server must not start, or null when it is safe.
 */
export function bootGuardError(env: Pick<Env, "NODE_ENV" | "OTP_MODE" | "DEMO_MODE">): string | null {
  if (env.NODE_ENV === "production" && env.OTP_MODE === "mock" && !env.DEMO_MODE) {
    return "Refusing to start: OTP_MODE=mock accepts any code. Set DEMO_MODE=true for a demo deployment, or configure a real OTP provider.";
  }
  return null;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Throws if the current environment is unsafe to serve requests. Skipped during `next build`. */
export function assertSafeBoot(): void {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const error = bootGuardError(getEnv());
  if (error) throw new Error(error);
}

export function razorpayConfigured(env: Env = getEnv()): boolean {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}
