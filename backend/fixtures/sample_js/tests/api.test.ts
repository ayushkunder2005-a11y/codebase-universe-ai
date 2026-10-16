import { recordMetricEndpoint, getMetricsSummary } from "../src/api";

describe("Metric API", () => {
  it("should record metric successfully", () => {
    const res = recordMetricEndpoint("cpu", 42);
    expect(res.status).toBe("recorded");
  });
});
