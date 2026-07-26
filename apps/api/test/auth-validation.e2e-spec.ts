import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, uniqueEmail } from "./utils/test-app";

/**
 * These endpoints previously typed their bodies with inline TypeScript
 * interfaces, which vanish at compile time — the API accepted any JSON.
 * Each case here fails against that old behaviour.
 */
describe("Auth validation (e2e)", () => {
  let app: INestApplication;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const validRegistration = () => ({
    email: uniqueEmail("val"),
    password: "SuperSecret123!",
    name: "Valid User",
    workspaceName: "Valid Workspace",
  });

  describe("register", () => {
    it("rejects a malformed email", async () => {
      const res = await request(server())
        .post("/api/v1/auth/register")
        .send({ ...validRegistration(), email: "not-an-email" })
        .expect(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects a short password", async () => {
      await request(server())
        .post("/api/v1/auth/register")
        .send({ ...validRegistration(), password: "short" })
        .expect(400);
    });

    it("rejects a common password even when long enough", async () => {
      await request(server())
        .post("/api/v1/auth/register")
        .send({ ...validRegistration(), password: "password123" })
        .expect(400);
    });

    it("rejects a whitespace-only name", async () => {
      await request(server())
        .post("/api/v1/auth/register")
        .send({ ...validRegistration(), name: "   " })
        .expect(400);
    });

    it("rejects missing fields entirely", async () => {
      await request(server()).post("/api/v1/auth/register").send({}).expect(400);
    });

    it("rejects a non-string password (type confusion)", async () => {
      await request(server())
        .post("/api/v1/auth/register")
        .send({ ...validRegistration(), password: { $ne: null } })
        .expect(400);
    });

    it("normalises the email to lowercase so it cannot be registered twice", async () => {
      const email = uniqueEmail("case");
      const upper = email.toUpperCase();

      await request(server())
        .post("/api/v1/auth/register")
        .send({ ...validRegistration(), email: upper })
        .expect(201);

      // Same identity in a different case must collide, not create a second
      // account the user could never log into.
      const second = await request(server())
        .post("/api/v1/auth/register")
        .send({ ...validRegistration(), email })
        .expect(409);
      expect(second.body.error).toBeDefined();

      // And the lowercase form logs in against the account created in uppercase.
      // 201 rather than 200: Nest's default status for POST.
      await request(server())
        .post("/api/v1/auth/login")
        .send({ email, password: "SuperSecret123!" })
        .expect(201);
    });
  });

  describe("login", () => {
    it("rejects a missing password", async () => {
      await request(server())
        .post("/api/v1/auth/login")
        .send({ email: "someone@example.com" })
        .expect(400);
    });

    it("does not apply the password policy on login", async () => {
      // A short password must fail authentication (401), not validation (400):
      // a 400 would tell an attacker the password shape was wrong before any
      // credential check happened.
      await request(server())
        .post("/api/v1/auth/login")
        .send({ email: "nobody@example.com", password: "x" })
        .expect(401);
    });
  });

  describe("refresh and logout", () => {
    it("rejects an empty refresh token", async () => {
      await request(server()).post("/api/v1/auth/refresh").send({ refreshToken: "" }).expect(400);
    });

    it("rejects a missing refresh token body", async () => {
      await request(server()).post("/api/v1/auth/refresh").send({}).expect(400);
    });
  });

  describe("profile and password", () => {
    async function registeredUser() {
      const body = validRegistration();
      const res = await request(server()).post("/api/v1/auth/register").send(body).expect(201);
      return { token: res.body.data.accessToken as string, password: body.password };
    }

    it("rejects an invalid IANA timezone", async () => {
      const { token } = await registeredUser();
      await request(server())
        .patch("/api/v1/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ timezone: "Mars/Olympus_Mons" })
        .expect(400);
    });

    it("accepts a valid IANA timezone", async () => {
      const { token } = await registeredUser();
      await request(server())
        .patch("/api/v1/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ timezone: "America/Argentina/Buenos_Aires" })
        .expect(200);
    });

    it("rejects an empty profile update", async () => {
      const { token } = await registeredUser();
      await request(server())
        .patch("/api/v1/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(400);
    });

    it("rejects reusing the current password as the new one", async () => {
      const { token, password } = await registeredUser();
      await request(server())
        .post("/api/v1/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: password, newPassword: password })
        .expect(400);
    });

    it("rejects a weak new password", async () => {
      const { token, password } = await registeredUser();
      await request(server())
        .post("/api/v1/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: password, newPassword: "abc" })
        .expect(400);
    });
  });
});
