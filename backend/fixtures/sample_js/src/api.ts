import { MetricService } from "./service";

export const service = new MetricService();

export function recordMetricEndpoint(id: string, value: number) {
  service.addMetric(id, value);
  return { status: "recorded", summary: service.getSummary() };
}

export const getMetricsSummary = () => {
  return service.getSummary();
};
