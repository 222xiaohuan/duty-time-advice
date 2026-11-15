import { describe, expect, it } from "vitest";
import { addDays, hkDateOf, hkDateTime, hkToday } from "../src/lib/time";

describe("香港时间工具", () => {
  it("香港 00:30 对应 UTC 前一日 16:30，业务日期按香港计算", () => {
    const instant = new Date("2026-11-19T16:30:00Z");
    expect(hkToday(instant)).toBe("2026-11-20");
  });

  it("跨午夜：22:00 至次日 02:00", () => {
    const start = hkDateTime("2026-11-20", "22:00");
    const end = hkDateTime("2026-11-20", "02:00", 1);
    expect(start.toISOString()).toBe("2026-11-20T14:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-20T18:00:00.000Z");
    expect(hkDateOf(start)).toBe("2026-11-20");
  });

  it("日期加减跨月", () => {
    expect(addDays("2026-11-28", 5)).toBe("2026-12-03");
    expect(addDays("2026-11-20", -3)).toBe("2026-11-17");
  });
});
