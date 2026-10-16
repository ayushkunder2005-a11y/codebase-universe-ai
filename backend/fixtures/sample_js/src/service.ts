export interface MetricRecord {
  id: string;
  value: number;
}

export class MetricService {
  private records: MetricRecord[] = [];

  public addMetric(id: string, value: number): void {
    this.records.push({ id, value });
  }

  public getSummary(): { count: number; total: number } {
    const total = this.records.reduce((acc, r) => acc + r.value, 0);
    return { count: this.records.length, total };
  }
}
