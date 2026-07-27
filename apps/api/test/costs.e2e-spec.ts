import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, uniqueEmail } from "./utils/test-app";

/**
 * Costs hold money, so cross-tenant leakage matters more here than almost
 * anywhere else. These mirror workspace-isolation.e2e-spec.ts: assert the 404,
 * assert the target row is untouched afterwards, and assert the owner's own
 * call still succeeds — otherwise a 404 proves nothing.
 */
describe("Operating costs (e2e)", () => {
  let app: INestApplication;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function newWorkspace(prefix: string) {
    const res = await request(server())
      .post("/api/v1/auth/register")
      .send({
        email: uniqueEmail(prefix),
        password: "CostsSecret123!",
        name: "Costs User",
        workspaceName: `Costs WS ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      })
      .expect(201);
    return { token: res.body.data.accessToken as string };
  }

  async function seedCosts(token: string) {
    const vendor = await request(server())
      .post("/api/v1/costs/vendors")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: `Vendor ${Date.now()}-${Math.random().toString(36).slice(2, 7)}` })
      .expect(201);

    const subscription = await request(server())
      .post("/api/v1/costs/subscriptions")
      .set("Authorization", `Bearer ${token}`)
      .send({ vendorId: vendor.body.data.id, name: "Plan", expectedAmount: "20.00" })
      .expect(201);

    const expense = await request(server())
      .post("/api/v1/costs/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({
        vendorId: vendor.body.data.id,
        subscriptionId: subscription.body.data.id,
        amount: "25.00",
        incurredAt: "2026-07-04T00:00:00.000Z",
      })
      .expect(201);

    return {
      vendorId: vendor.body.data.id as string,
      subscriptionId: subscription.body.data.id as string,
      expenseId: expense.body.data.id as string,
    };
  }

  describe("vendor identity", () => {
    it("rejects the same vendor under a different capitalisation", async () => {
      const { token } = await newWorkspace("vendor-dup");
      const name = `Acme ${Date.now()}`;

      await request(server())
        .post("/api/v1/costs/vendors")
        .set("Authorization", `Bearer ${token}`)
        .send({ name })
        .expect(201);

      const dup = await request(server())
        .post("/api/v1/costs/vendors")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: `  ${name.toUpperCase()}  ` })
        .expect(400);

      expect(dup.body.error.code).toBe("VENDOR_ALREADY_EXISTS");
    });

    it("lets two workspaces each have a vendor with the same name", async () => {
      const a = await newWorkspace("vendor-a");
      const b = await newWorkspace("vendor-b");
      const name = `Shared Vendor ${Date.now()}`;

      // Uniqueness is per workspace, not global — otherwise one tenant could
      // block another from recording a supplier they both use.
      for (const { token } of [a, b]) {
        await request(server())
          .post("/api/v1/costs/vendors")
          .set("Authorization", `Bearer ${token}`)
          .send({ name })
          .expect(201);
      }
    });
  });

  describe("server-controlled fields", () => {
    it("ignores a client trying to create an already-confirmed import", async () => {
      const { token } = await newWorkspace("fields");
      const vendor = await request(server())
        .post("/api/v1/costs/vendors")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: `Sneaky ${Date.now()}` })
        .expect(201);

      const res = await request(server())
        .post("/api/v1/costs/expenses")
        .set("Authorization", `Bearer ${token}`)
        .send({
          vendorId: vendor.body.data.id,
          amount: "10.00",
          incurredAt: "2026-07-04T00:00:00.000Z",
          // Both are server-set. A client must not be able to forge provenance.
          status: "PENDING_REVIEW",
          source: "N8N_IMPORT",
        })
        .expect(201);

      expect(res.body.data.status).toBe("CONFIRMED");
      expect(res.body.data.source).toBe("MANUAL");
    });
  });

  describe("workspace isolation", () => {
    it("does not list another workspace's vendors, subscriptions or expenses", async () => {
      const a = await newWorkspace("iso-a");
      const b = await newWorkspace("iso-b");
      const seeded = await seedCosts(a.token);

      for (const path of ["/api/v1/costs/vendors", "/api/v1/costs/subscriptions", "/api/v1/costs/expenses"]) {
        const res = await request(server())
          .get(path)
          .set("Authorization", `Bearer ${b.token}`)
          .expect(200);
        const ids = (res.body.data as { id: string }[]).map((r) => r.id);
        expect(ids).not.toContain(seeded.vendorId);
        expect(ids).not.toContain(seeded.subscriptionId);
        expect(ids).not.toContain(seeded.expenseId);
      }
    });

    it("cannot update another workspace's expense, and leaves it unchanged", async () => {
      const a = await newWorkspace("iso-upd-a");
      const b = await newWorkspace("iso-upd-b");
      const seeded = await seedCosts(a.token);

      await request(server())
        .patch(`/api/v1/costs/expenses/${seeded.expenseId}`)
        .set("Authorization", `Bearer ${b.token}`)
        .send({ amount: "9999.00" })
        .expect(404);

      const after = await request(server())
        .get("/api/v1/costs/expenses")
        .set("Authorization", `Bearer ${a.token}`)
        .expect(200);
      const row = (after.body.data as { id: string; amount: string | number }[]).find(
        (r) => r.id === seeded.expenseId,
      )!;
      expect(Number(row.amount)).toBe(25);
    });

    it("cannot review another workspace's expense", async () => {
      const a = await newWorkspace("iso-rev-a");
      const b = await newWorkspace("iso-rev-b");
      const seeded = await seedCosts(a.token);

      await request(server())
        .post(`/api/v1/costs/expenses/${seeded.expenseId}/review`)
        .set("Authorization", `Bearer ${b.token}`)
        .send({ status: "REJECTED" })
        .expect(404);
    });

    it("cannot delete another workspace's subscription or archive its vendor", async () => {
      const a = await newWorkspace("iso-del-a");
      const b = await newWorkspace("iso-del-b");
      const seeded = await seedCosts(a.token);

      await request(server())
        .delete(`/api/v1/costs/subscriptions/${seeded.subscriptionId}`)
        .set("Authorization", `Bearer ${b.token}`)
        .expect(404);

      await request(server())
        .delete(`/api/v1/costs/vendors/${seeded.vendorId}`)
        .set("Authorization", `Bearer ${b.token}`)
        .expect(404);

      // A's own subscription survived the attempt.
      const subs = await request(server())
        .get("/api/v1/costs/subscriptions")
        .set("Authorization", `Bearer ${a.token}`)
        .expect(200);
      expect((subs.body.data as { id: string }[]).map((s) => s.id)).toContain(seeded.subscriptionId);
    });

    it("cannot attach a subscription to a vendor in another workspace", async () => {
      const a = await newWorkspace("iso-attach-a");
      const b = await newWorkspace("iso-attach-b");
      const seeded = await seedCosts(a.token);

      await request(server())
        .post("/api/v1/costs/subscriptions")
        .set("Authorization", `Bearer ${b.token}`)
        .send({ vendorId: seeded.vendorId, name: "Planted", expectedAmount: "1.00" })
        .expect(404);
    });

    it("keeps monthly summaries separate", async () => {
      const a = await newWorkspace("iso-sum-a");
      const b = await newWorkspace("iso-sum-b");
      await seedCosts(a.token);

      const summaryB = await request(server())
        .get("/api/v1/costs/summary?month=2026-07")
        .set("Authorization", `Bearer ${b.token}`)
        .expect(200);

      // B has recorded nothing, so B's close must be empty regardless of A.
      expect(summaryB.body.data.byCurrency).toEqual([]);
      expect(summaryB.body.data.priceIncreases).toEqual([]);
    });
  });

  describe("monthly summary", () => {
    it("reports expected, actual and a flagged price increase", async () => {
      const { token } = await newWorkspace("summary");
      await seedCosts(token);

      const res = await request(server())
        .get("/api/v1/costs/summary?month=2026-07")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.byCurrency).toEqual([
        { currency: "USD", expected: "20.00", actual: "25.00", difference: "5.00" },
      ]);
      expect(res.body.data.priceIncreases).toHaveLength(1);
      expect(res.body.data.priceIncreases[0].increasePercent).toBe("25.00");
    });

    it("rejects a malformed month rather than failing at the parser", async () => {
      const { token } = await newWorkspace("summary-bad");
      await request(server())
        .get("/api/v1/costs/summary?month=2026-13")
        .set("Authorization", `Bearer ${token}`)
        .expect(400);
    });
  });
});
