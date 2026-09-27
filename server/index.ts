import express from 'express';
import cors from 'cors';
const app = express();
const port = Number(process.env.PORT || 4002);
app.use(cors()); app.use(express.json());
const readings = [{ sensor: 'TMP-01', value: -8.4, unit: '°C' }, { sensor: 'WND-02', value: 18.6, unit: 'm/s' }, { sensor: 'SNW-03', value: 142, unit: 'cm' }, { sensor: 'PWR-04', value: 76, unit: '%' }];
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
// 站点环境摘要：观测时间、质量评分、站点状态与各项指标（每项可独立缺失或过期）
app.get('/api/environment', (_req, res) => res.json({
  station: 'M-07',
  stationStatus: 'online',
  quality: 97.8,
  observedAt: minutesAgo(2),
  metrics: {
    feelsLike: { value: -14.2, unit: '°C', observedAt: minutesAgo(2) },
    visibility: { value: 16.8, unit: 'km', observedAt: minutesAgo(2) },
    pressure: { value: 582, unit: 'hPa', observedAt: minutesAgo(3) },
    snowfall: { value: 0.8, unit: 'mm/h', observedAt: minutesAgo(2) }
  }
}));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', project: 'snow-mountain-weather-station', workflow: '采集传感器数据 → 校验质量 → 触发告警 → 同步观测记录' }));
app.get('/api/readings', (_req, res) => res.json(readings));
app.post('/api/sync', (_req, res) => res.json({ status: 'accepted', syncedAt: new Date().toISOString() }));
app.listen(port, () => console.log(`Weather station API running at http://localhost:${port}`));
