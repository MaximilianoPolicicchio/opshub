// Global setup for e2e tests. Each spec boots its own Nest application
// against the DATABASE_URL configured in the environment (a throwaway
// Postgres instance in CI, via `prisma migrate deploy` + seed beforehand).
process.env.SCHEDULER_ENABLED = "false";

// Rate limits are a production control and would otherwise turn these specs
// into 429 assertions: the isolation suite alone registers two users per test,
// well past the register limit. `throttling.e2e-spec.ts` re-enables them to
// verify the limits themselves.
process.env.THROTTLE_ENABLED = "false";
