import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, uniqueEmail } from "./utils/test-app";

/**
 * Refresh-token rotation treats a replayed token as theft and revokes the whole
 * family. That is correct for an attacker and wrong for a browser: reloading a
 * page while the boot refresh is still in flight means the rotated cookie never
 * lands, so the next load presents the previous token. Users were logged out
 * permanently for double-tapping reload.
 *
 * A short grace window separates the two cases. These tests pin both sides of
 * it — the retry must succeed, and genuine reuse must still be caught.
 */
describe("Refresh token reuse grace window (e2e)", () => {
  let app: INestApplication;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerUser() {
    const res = await request(server())
      .post("/api/v1/auth/register")
      .send({
        email: uniqueEmail("grace"),
        password: "GraceSecret123!",
        name: "Grace User",
        workspaceName: `Grace WS ${Date.now()}`,
      })
      .expect(201);
    return res.body.data.refreshToken as string;
  }

  const refresh = (token: string) =>
    request(server()).post("/api/v1/auth/refresh").send({ refreshToken: token });

  it("accepts a spent token replayed inside the grace window", async () => {
    const r1 = await registerUser();

    const first = await refresh(r1).expect(201);
    const r2 = first.body.data.refreshToken as string;

    // The reload-races-refresh case: r1 is presented again immediately.
    const retry = await refresh(r1).expect(201);
    expect(retry.body.data.accessToken).toBeTruthy();

    // Crucially, the family survives — r2 must still work afterwards.
    await refresh(r2).expect(201);
  });

  it("still catches reuse once the window has passed", async () => {
    const r1 = await registerUser();
    await refresh(r1).expect(201);

    // Re-create the app with the window effectively closed rather than making
    // the suite wait ten seconds.
    process.env.REFRESH_REUSE_GRACE_MS = "0";
    const strictApp = await createTestApp();
    try {
      const res = await request(strictApp.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: r1 })
        .expect(401);
      expect(res.body.error.code).toBe("REFRESH_TOKEN_REUSED");
    } finally {
      await strictApp.close();
      delete process.env.REFRESH_REUSE_GRACE_MS;
    }
  });

  it("rejects a token that never existed", async () => {
    const res = await refresh("a".repeat(128)).expect(401);
    expect(res.body.error.code).toBe("INVALID_REFRESH_TOKEN");
  });
});
