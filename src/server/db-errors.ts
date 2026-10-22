import "server-only";

/** A unique constraint on `field` was violated (Prisma P2002): someone else got there first. */
export const isUniqueViolation = (error: unknown, field: string) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002" && JSON.stringify((error as { meta?: unknown }).meta ?? "").includes(field);
