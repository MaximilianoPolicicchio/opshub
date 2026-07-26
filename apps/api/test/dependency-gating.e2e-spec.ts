import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, uniqueEmail } from "./utils/test-app";

describe("Task dependency gating (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let projectId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const email = uniqueEmail("dep");
    const registerRes = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: "SuperSecret123!", name: "Dep User", workspaceName: `Dep Workspace ${Date.now()}` })
      .expect(201);
    accessToken = registerRes.body.data.accessToken;

    const projectRes = await request(app.getHttpServer())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: `Dep Project ${Date.now()}`, type: "PRODUCT", templateKey: "empty" })
      .expect(201);
    projectId = projectRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function createTask(title: string) {
    const res = await request(app.getHttpServer())
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ projectId, title })
      .expect(201);
    return res.body.data.id as string;
  }

  it("returns 409 TASK_BLOCKED_BY_DEPENDENCY when completing a task with an open prerequisite", async () => {
    const prerequisiteId = await createTask("Prerequisite task");
    const blockedId = await createTask("Blocked task");

    await request(app.getHttpServer())
      .post(`/api/v1/tasks/${blockedId}/dependencies`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ dependsOnTaskId: prerequisiteId })
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${blockedId}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "DONE" })
      .expect(409);
    expect(res.body.error.code).toBe("TASK_BLOCKED_BY_DEPENDENCY");
  });

  it("allows completion once the prerequisite is DONE", async () => {
    const prerequisiteId = await createTask("Prerequisite 2");
    const blockedId = await createTask("Blocked 2");

    await request(app.getHttpServer())
      .post(`/api/v1/tasks/${blockedId}/dependencies`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ dependsOnTaskId: prerequisiteId })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${prerequisiteId}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "DONE" })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${blockedId}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "DONE" })
      .expect(200);
  });

  it("rejects a dependency that would create a cycle", async () => {
    const a = await createTask("Cycle A");
    const b = await createTask("Cycle B");

    await request(app.getHttpServer())
      .post(`/api/v1/tasks/${b}/dependencies`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ dependsOnTaskId: a })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/tasks/${a}/dependencies`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ dependsOnTaskId: b })
      .expect(400);
  });
});
