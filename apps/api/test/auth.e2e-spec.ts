import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, uniqueEmail } from "./utils/test-app";

describe("Auth flow (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("registers a user, creates a workspace, and returns tokens", async () => {
    const email = uniqueEmail("register");
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: "SuperSecret123!", name: "Test User", workspaceName: "Test Workspace" })
      .expect(201);

    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.email).toBe(email);
  });

  it("logs in with correct credentials and rejects wrong ones", async () => {
    const email = uniqueEmail("login");
    const password = "SuperSecret123!";
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password, name: "Login User", workspaceName: "Login Workspace" })
      .expect(201);

    const good = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email, password }).expect(201);
    expect(good.body.data.accessToken).toBeDefined();

    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: "wrong-password" })
      .expect(401);
  });

  it("rejects /auth/me without a token, accepts with one", async () => {
    await request(app.getHttpServer()).get("/api/v1/auth/me").expect(401);

    const email = uniqueEmail("me");
    const password = "SuperSecret123!";
    const registerRes = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password, name: "Me User", workspaceName: "Me Workspace" })
      .expect(201);

    const accessToken = registerRes.body.data.accessToken;
    const meRes = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(meRes.body.data.user.email).toBe(email);
  });

  it("rotates refresh tokens and rejects reuse of an old one", async () => {
    const email = uniqueEmail("refresh");
    const password = "SuperSecret123!";
    const registerRes = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password, name: "Refresh User", workspaceName: "Refresh Workspace" })
      .expect(201);

    const oldRefreshToken = registerRes.body.data.refreshToken;
    const refreshRes = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: oldRefreshToken })
      .expect(201);
    expect(refreshRes.body.data.accessToken).toBeDefined();

    // Reusing the old (now-revoked) token should fail.
    await request(app.getHttpServer()).post("/api/v1/auth/refresh").send({ refreshToken: oldRefreshToken }).expect(401);
  });
});
