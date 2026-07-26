// Global setup for e2e tests. Each spec boots its own Nest application
// against the DATABASE_URL configured in the environment (a throwaway
// Postgres instance in CI, via `prisma migrate deploy` + seed beforehand).
process.env.SCHEDULER_ENABLED = "false";
