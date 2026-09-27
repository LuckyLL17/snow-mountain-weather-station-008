import express from 'express';
import cors from 'cors';
const app = express();
const port = Number(process.env.PORT || 4002);
app.use(cors()); app.use(express.json());
const readings = [{ sensor: 'TMP-01', value: -8.4, unit: '°C' }, { sensor: 'WND-02', value: 18.6, unit: 'm/s' }, { sensor: 'SNW-03', value: 142, unit: 'cm' }, { sensor: 'PWR-04', value: 76, unit: '%' }];
app.get('/api/health', (_req, res) => res.json({ status: 'ok', project: 'snow-mountain-weather-station', workflow: '采集传感器数据 → 校验质量 → 触发告警 → 同步观测记录' }));
app.get('/api/readings', (_req, res) => res.json(readings));

// 站点环境摘要：每个指标独立携带观测时间与质量，缺测字段以 null 表示，
// 前端可据此逐指标判断新鲜度，而不是把整份摘要判为不可用。
// 可用 ?scenario=stale|degraded|error 模拟数据过期、字段缺失和请求失败。
type EnvMetric = { value: number | null; unit: string; observedAt: string | null; quality: number | null };
const envMetricDefs = {
  feelsLike: { value: -14.2, unit: '°C', quality: 98.6 },
  visibility: { value: 16.8, unit: 'km', quality: 99.1 },
  pressure: { value: 582, unit: 'hPa', quality: 97.8 },
  snowfall: { value: 0.8, unit: 'mm/h', quality: 98.2 }
};
app.get('/api/environment', (req, res) => {
  const scenario = typeof req.query.scenario === 'string' ? req.query.scenario : 'normal';
  if (scenario === 'error') {
    res.status(503).json({ error: 'environment summary temporarily unavailable' });
    return;
  }
  const now = Date.now();
  const observedAt = new Date(scenario === 'stale' ? now - 26 * 60_000 : now - 60_000).toISOString();
  const metrics: Record<string, EnvMetric> = Object.fromEntries(
    Object.entries(envMetricDefs).map(([key, def]) => [key, { value: def.value, unit: def.unit, observedAt, quality: def.quality }])
  );
  let stationStatus = '正常运行';
  let statusLevel: 'ok' | 'warn' = 'ok';
  if (scenario === 'stale') {
    stationStatus = '卫星链路延迟';
    statusLevel = 'warn';
  } else if (scenario === 'degraded') {
    // 降雪传感器缺测；气压有读数但质量校验未通过
    metrics.snowfall = { value: null, unit: 'mm/h', observedAt: null, quality: null };
    metrics.pressure = { ...metrics.pressure, quality: null };
    stationStatus = '部分传感器异常';
    statusLevel = 'warn';
  }
  const observedTimes = Object.values(metrics)
    .map(metric => metric.observedAt ? Date.parse(metric.observedAt) : NaN)
    .filter(time => !Number.isNaN(time))
    .sort((a, b) => b - a);
  const qualities = Object.values(metrics).map(metric => metric.quality).filter((q): q is number => q !== null);
  res.json({
    observedAt: observedTimes.length ? new Date(observedTimes[0]).toISOString() : null,
    quality: qualities.length ? Math.min(...qualities) : null,
    stationStatus,
    statusLevel,
    metrics
  });
});

app.post('/api/sync', (_req, res) => res.json({ status: 'accepted', syncedAt: new Date().toISOString() }));
app.listen(port, () => console.log(`Weather station API running at http://localhost:${port}`));
