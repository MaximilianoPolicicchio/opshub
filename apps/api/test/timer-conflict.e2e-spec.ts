import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, uniqueEmail } from "./utils/test-app";

describe("Timer conflict (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let projectId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const email = uniqueEmail("timer");
    const registerRes = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: "SuperSecret123!", name: "Timer User", workspaceName: `Timer Workspace ${Date.now()}` })
      .expect(201);
    accessToken = registerRes.body.data.accessToken;

    const projectRes = await request(app.getHttpServer())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: `Timer Project ${Date.now()}`, type: "PRODUCT", templateKey: "empty" })
      .expect(201);
    projectId = projectRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 409 when starting a second timer while one is already running", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/time-entries/start")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ projectId })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/v1/time-entries/start")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ projectId })
      .expect(409);

    // Cleanup: stop the running timer so later tests in this file are unaffected.
    await request(app.getHttpServer())
      .post("/api/v1/time-entries/stop")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({})
      .expect(201);
  });

  it("stopPrevious stops the running timer and starts a new one", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/time-entries/start")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ projectId })
      .expect(201);

    const secondRes = await request(app.getHttpServer())
      .post("/api/v1/time-entries/start")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ projectId, onConflict: "stopPrevious" })
      .expect(201);

    expect(secondRes.body.data.endTime).toBeNull();

    await request(app.getHttpServer())
      .post("/api/v1/time-entries/stop")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({})
      .expect(201);
  });
});
