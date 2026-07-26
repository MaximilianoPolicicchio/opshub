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
});
