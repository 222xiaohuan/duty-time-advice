import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

const app = createApp();

describe("健康检查", () => {
  it("无需身份，返回统一结构且数据库可用", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ code: 0, msg: "ok", data: { status: "up", db: "sqlite" } });
  });
});

describe("Mock 身份中间件", () => {
  it("缺少角色时返回 401", async () => {
    const res = await request(app).get("/api/me");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 40100, data: null });
  });

  it("非法角色返回 401", async () => {
    const res = await request(app).get("/api/me").set("x-mock-role", "root").set("x-mock-user-id", "1");
    expect(res.status).toBe(401);
  });

  it("manager 未提供管辖组织返回 401", async () => {
    const res = await request(app).get("/api/me").set("x-mock-role", "manager").set("x-mock-user-id", "9101");
    expect(res.status).toBe(401);
  });

  it("employee 身份解析成功", async () => {
    const res = await request(app).get("/api/me").set("x-mock-role", "employee").set("x-mock-user-id", "3");
    expect(res.body).toEqual({ code: 0, msg: "ok", data: { role: "employee", userId: 3, orgId: null, orgIds: [] } });
  });

  it("manager 身份带管辖组织", async () => {
    const res = await request(app)
      .get("/api/me")
      .set("x-mock-role", "manager")
      .set("x-mock-user-id", "9101")
      .set("x-mock-org-id", "1");
    expect(res.body.data).toEqual({ role: "manager", userId: 9101, orgId: 1, orgIds: [1, 2] });
  });
});

describe("统一错误结构", () => {
  it("未知接口返回 404 统一结构", async () => {
    const res = await request(app).get("/api/not-exist").set("x-mock-role", "admin").set("x-mock-user-id", "9001");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 40400, msg: "接口不存在", data: null });
  });

  it("非法 JSON 返回 400", async () => {
    const res = await request(app)
      .post("/api/me")
      .set("x-mock-role", "admin")
      .set("x-mock-user-id", "9001")
      .set("content-type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(40000);
  });
});
