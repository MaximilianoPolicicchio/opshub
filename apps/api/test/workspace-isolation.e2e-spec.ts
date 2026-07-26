import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, uniqueEmail } from "./utils/test-app";

describe("Workspace isolation (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerUserWithProject() {
    const email = uniqueEmail("iso");
    const registerRes = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: "SuperSecret123!", name: "Iso User", workspaceName: `Iso Workspace ${Date.now()}` })
      .expect(201);
    const accessToken = registerRes.body.data.accessToken as string;

    const projectRes = await request(app.getHttpServer())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: `Isolated Project ${Date.now()}`, type: "PRODUCT", templateKey: "empty" })
      .expect(201);

    return { accessToken, projectId: projectRes.body.data.id as string };
  }

  it("user A cannot read a project belonging to user B's workspace", async () => {
    const userA = await registerUserWithProject();
    const userB = await registerUserWithProject();

    // User B tries to read user A's project by id -- must not leak (404, not 403,
    // per PROJECT_PLAN.md §5: findFirst({id, workspaceId}) never findUnique({id})).
    await request(app.getHttpServer())
      .get(`/api/v1/projects/${userA.projectId}`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .expect(404);

    // User A can read their own project.
    await request(app.getHttpServer())
      .get(`/api/v1/projects/${userA.projectId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);
  });

  it("user A's project list never includes user B's projects", async () => {
    const userA = await registerUserWithProject();
    const userB = await registerUserWithProject();

    const listRes = await request(app.getHttpServer())
      .get("/api/v1/projects")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);

    const ids = listRes.body.data.rows.map((p: any) => p.id);
    expect(ids).not.toContain(userB.projectId);
  });

  // Reads leaking is the obvious failure; a cross-tenant *write* silently
  // succeeding is the expensive one. These assert both the status code and that
  // the target row is genuinely untouched afterwards.

  it("user B cannot update user A's project, and the project is unchanged", async () => {
    const userA = await registerUserWithProject();
    const userB = await registerUserWithProject();

    const before = await request(app.getHttpServer())
      .get(`/api/v1/projects/${userA.projectId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/projects/${userA.projectId}`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ name: "Owned by B", status: "ARCHIVED" })
      .expect(404);

    const after = await request(app.getHttpServer())
      .get(`/api/v1/projects/${userA.projectId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(after.body.data.name).toBe(before.body.data.name);
    expect(after.body.data.status).toBe(before.body.data.status);
  });

  it("user B cannot archive user A's project", async () => {
    const userA = await registerUserWithProject();
    const userB = await registerUserWithProject();

    await request(app.getHttpServer())
      .delete(`/api/v1/projects/${userA.projectId}`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/v1/projects/${userA.projectId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);
  });

  it("user B cannot attach a task to a project in user A's workspace", async () => {
    const userA = await registerUserWithProject();
    const userB = await registerUserWithProject();

    await request(app.getHttpServer())
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ projectId: userA.projectId, title: "Planted by B" })
      .expect(404);

    const tasks = await request(app.getHttpServer())
      .get(`/api/v1/tasks?projectId=${userA.projectId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(tasks.body.data.some((t: any) => t.title === "Planted by B")).toBe(false);
  });

  it("user B cannot update a task in user A's workspace", async () => {
    const userA = await registerUserWithProject();
    const userB = await registerUserWithProject();

    const created = await request(app.getHttpServer())
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ projectId: userA.projectId, title: "A's task", priority: "LOW" })
      .expect(201);
    const taskId = created.body.data.id as string;

    await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${taskId}`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ title: "Hijacked", priority: "CRITICAL" })
      .expect(404);

    const after = await request(app.getHttpServer())
      .get(`/api/v1/tasks/${taskId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(after.body.data.title).toBe("A's task");
    expect(after.body.data.priority).toBe("LOW");
  });

  it("user B cannot write a budget onto user A's project", async () => {
    const userA = await registerUserWithProject();
    const userB = await registerUserWithProject();

    await request(app.getHttpServer())
      .put(`/api/v1/projects/${userA.projectId}/budget`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ billingModel: "HOURLY", currency: "USD", budgetAmount: 1, hourlyRate: 1, estimatedHours: 1 })
      .expect(404);
  });
});
