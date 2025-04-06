export const toMetric = (priority: number, base = 100, step = 100) =>
  base + priority * step;
