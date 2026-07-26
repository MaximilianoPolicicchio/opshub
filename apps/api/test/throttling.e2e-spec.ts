import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, uniqueEmail } from "./utils/test-app";

/**
 * The rest of the e2e suite runs with THROTTLE_ENABLED=false so that fixture
 * setup does not trip the limits. That makes it easy for the limits to quietly
 * stop working, so this spec turns them back on and proves they fire.
 *
 * ConditionalThrottlerGuard reads the flag per request, so flipping it here is
 * enough — no separate application instance is needed.
 */
describe("Rate limiting (e2e)", () => {
  let app: INestApplication;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    process.env.THROTTLE_ENABLED = "true";
  });

  afterEach(() => {
    process.env.THROTTLE_ENABLED = "false";
  });

  it("locks out repeated failed logins for the same client", async () => {
    const email = uniqueEmail("throttle-login");
    const attempt = () =>
      request(server()).post("/api/v1/auth/login").send({ email, password: "WrongPassword123!" });

    // The login limit is 5 per 15 minutes.
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await attempt();
      statuses.push(res.status);
    }

    expect(statuses).toContain(429);
    // Credential checks must fail as 401 until the limiter engages, otherwise
    // the limit is masking a different error.
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
  });

  it("bounds account creation", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await request(server())
        .post("/api/v1/auth/register")
        .send({
          email: uniqueEmail("throttle-reg"),
          password: "SuperSecret123!",
          name: "Throttle User",
          workspaceName: `Throttle Workspace ${i}`,
        });
      statuses.push(res.status);
    }

    expect(statuses).toContain(429);
  });

  it("is genuinely disabled when the flag is off", async () => {
    process.env.THROTTLE_ENABLED = "false";
    const email = uniqueEmail("throttle-off");

    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await request(server())
        .post("/api/v1/auth/login")
        .send({ email, password: "WrongPassword123!" });
      statuses.push(res.status);
    }

    // Every attempt reaches the credential check; nothing is rate limited.
    expect(statuses.every((s) => s === 401)).toBe(true);
  });
});
