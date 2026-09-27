import { useEffect, useMemo, useState, type ReactNode } from 'react';

type Sensor = { id: string; name: string; code: string; value: string; unit: string; trend: string; status: '正常' | '注意' | '离线'; color: string; points: number[] };
const sensors: Sensor[] = [
  { id: 'temp', name: '山脊温度', code: 'TMP-01', value: '-8.4', unit: '°C', trend: '↓ 1.2°', status: '正常', color: '#78d7ef', points: [20, 24, 21, 31, 28, 34, 42, 38, 47, 50] },
  { id: 'wind', name: '风速 / 风向', code: 'WND-02', value: '18.6', unit: 'm/s', trend: '↑ 3.8', status: '注意', color: '#f2bc71', points: [31, 28, 38, 40, 34, 47, 45, 56, 54, 62] },
  { id: 'snow', name: '积雪深度', code: 'SNW-03', value: '142', unit: 'cm', trend: '↑ 4 cm', status: '正常', color: '#bba4ff', points: [58, 53, 52, 50, 45, 42, 38, 35, 30, 28] },
  { id: 'power', name: '电池组电量', code: 'PWR-04', value: '76', unit: '%', trend: '↓ 2%', status: '正常', color: '#94df9a', points: [72, 70, 76, 72, 70, 76, 80, 79, 78, 76] }
];
const alerts = [{ time: '09:42', title: '风速超过巡检阈值', desc: '当前 18.6 m/s · 建议延后无人机巡检', kind: 'warning' }, { time: '08:15', title: '雪深传感器完成自检', desc: 'SNW-03 数据质量 99.2%', kind: 'good' }, { time: '06:30', title: '卫星链路已同步', desc: '上行延迟 2.4 秒 · 下一次同步 12:30', kind: 'good' }];
function MiniChart({ points, color }: { points: number[]; color: string }) { const coords = points.map((p, index) => `${(index / (points.length - 1)) * 100},${70 - p}`).join(' '); return <svg className="mini-chart" viewBox="0 0 100 70" preserveAspectRatio="none"><defs><linearGradient id={`fill-${color.replace('#','')}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".28"/><stop offset="1" stopColor={color} stopOpacity="0"/></linearGradient></defs><polygon points={`0,70 ${coords} 100,70`} fill={`url(#fill-${color.replace('#','')})`} /><polyline points={coords} fill="none" stroke={color} strokeWidth="1.7" vectorEffect="non-scaling-stroke" /></svg>; }
function MountainScene() { return <div className="mountain-scene"><div className="stars"/><div className="sun-glow"/><div className="mountain back"/><div className="mountain mid"/><div className="mountain front"/><div className="station"><span className="mast"/><span className="station-box"/><span className="antenna"/></div><div className="scene-caption"><span>海拔 4,820 m</span><span>自动观测站 · M-07</span></div></div>; }

// ---- 站点环境摘要：服务端读取，逐指标判定新鲜度 ----
type EnvMetric = { value: number | null; unit: string; observedAt: string | null; quality: number | null };
type EnvSummary = { observedAt: string | null; quality: number | null; stationStatus: string; statusLevel?: 'ok' | 'warn'; metrics: Partial<Record<EnvMetricKey, EnvMetric>> };
type EnvMetricKey = 'feelsLike' | 'visibility' | 'pressure' | 'snowfall';

const ENV_STALE_MS = 10 * 60_000; // 采样间隔 10 min，超过即视为过期
const ENV_REFRESH_MS = 60_000;
const ENV_METRICS: { key: EnvMetricKey; label: string }[] = [
  { key: 'feelsLike', label: '体感温度' },
  { key: 'visibility', label: '能见度' },
  { key: 'pressure', label: '气压' },
  { key: 'snowfall', label: '降雪' }
];

function parseTime(value: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}
function formatObserved(iso: string | null): string {
  const time = parseTime(iso);
  if (time === null) return '时间未知';
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function formatAge(iso: string | null, now: number): string {
  const time = parseTime(iso);
  if (time === null) return '';
  const minutes = Math.max(0, Math.round((now - time) / 60_000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  return minutes < 120 ? '1 小时前' : `${hours} 小时前`;
}
function useEnvironmentSummary(reloadSignal: number) {
  const [summary, setSummary] = useState<EnvSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const load = async (initial: boolean) => {
      if (initial) setLoading(true);
      try {
        const res = await fetch('/api/environment');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: EnvSummary = await res.json();
        if (!data || typeof data !== 'object' || !data.metrics) throw new Error('bad payload');
        if (!cancelled) { setSummary(data); setError(false); }
      } catch {
        if (!cancelled) setError(true); // 保留上次数据，只标记本次更新失败
      } finally {
        if (initial && !cancelled) setLoading(false);
      }
    };
    load(true);
    const timer = setInterval(() => load(false), ENV_REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [reloadSignal]);
  return { summary, loading, error };
}
function EnvironmentBadge({ loading, error, summary, now }: { loading: boolean; error: boolean; summary: EnvSummary | null; now: number }) {
  const observed = parseTime(summary?.observedAt ?? null);
  const stale = observed !== null && now - observed > ENV_STALE_MS;
  const tone = loading ? '' : error ? 'bad' : summary?.statusLevel === 'warn' || stale ? 'warn' : '';
  const label = loading ? 'SYNC' : error ? 'OFFLINE' : stale ? 'STALE' : summary?.statusLevel === 'warn' ? 'WARN' : 'LIVE';
  return <span className={`live${tone ? ` ${tone}` : ''}`}><i/> {label}</span>;
}
function EnvMetricCell({ label, metric, loading, now }: { label: string; metric: EnvMetric | undefined; loading: boolean; now: number }) {
  let note: ReactNode = null;
  let value: ReactNode;
  if (loading && !metric) {
    value = <b className="muted">读取中…</b>;
  } else if (!metric || metric.value === null || metric.observedAt === null) {
    value = <b className="muted">数据缺失</b>;
    note = <span className="metric-note bad">传感器缺测</span>;
  } else {
    const stale = now - (parseTime(metric.observedAt) ?? 0) > ENV_STALE_MS;
    value = <b>{metric.value}<small>{metric.unit}</small></b>;
    if (stale) {
      note = <span className="metric-note warn">已过期 · {formatAge(metric.observedAt, now)}</span>;
    } else if (metric.quality === null) {
      note = <span className="metric-note warn">质量未校验</span>;
    } else if (metric.quality < 90) {
      note = <span className="metric-note warn">质量偏低 {metric.quality.toFixed(1)}%</span>;
    }
  }
  return <div className="env-metric"><span>{label}</span>{value}{note}</div>;
}
function EnvironmentCard({ summary, loading, error, now }: { summary: EnvSummary | null; loading: boolean; error: boolean; now: number }) {
  const observed = parseTime(summary?.observedAt ?? null);
  const stale = observed !== null && now - observed > ENV_STALE_MS;
  const timeTone = error ? 'bad' : stale ? 'warn' : '';
  const qualityTone = summary?.quality != null && summary.quality < 90 ? 'warn' : '';
  return <div className="mountain-card">
    <div className="card-title"><div><span className="eyebrow">LIVE TERRAIN</span><h3>站点环境</h3></div><EnvironmentBadge loading={loading} error={error} summary={summary} now={now}/></div>
    <MountainScene/>
    <div className="env-meta">
      <div><span>观测时间</span><b className={timeTone}>{summary?.observedAt ? formatObserved(summary.observedAt) : loading ? '同步中…' : '时间未知'}{!error && summary?.observedAt ? ` · ${formatAge(summary.observedAt, now)}` : ''}</b>{error && <em className="bad">更新失败，显示上次数据</em>}</div>
      <div><span>数据质量</span><b className={qualityTone}>{summary?.quality != null ? `${summary.quality.toFixed(1)}%` : '无'}</b></div>
      <div><span>站点状态</span><b><i className={`dot ${error ? 'bad' : stale || summary?.statusLevel === 'warn' ? 'warn' : 'ok'}`}/>{summary?.stationStatus ?? (loading ? '连接中' : '未知')}</b></div>
    </div>
    <div className="terrain-footer">
      {ENV_METRICS.map(item => <EnvMetricCell key={item.key} label={item.label} metric={summary?.metrics[item.key]} loading={loading} now={now}/>)}
    </div>
  </div>;
}

export default function App() {
  const [selectedId, setSelectedId] = useState('wind');
  const [range, setRange] = useState('24 小时');
  const [notice, setNotice] = useState('');
  const [envReload, setEnvReload] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000); // 每分钟轮询之外，驱动过期判定刷新
    return () => clearInterval(timer);
  }, []);
  const { summary: envSummary, loading: envLoading, error: envError } = useEnvironmentSummary(envReload);
  const selected = sensors.find(sensor => sensor.id === selectedId) ?? sensors[0];
  const summary = useMemo(() => ({ normal: sensors.filter(s => s.status === '正常').length, attention: sensors.filter(s => s.status === '注意').length }), []);
  return <div className="dashboard"><header className="topbar"><div className="brand"><div className="brand-icon">✦</div><div><span className="eyebrow">ALPINE OBSERVATORY / M-07</span><h1>雪线气象站 · 运行总览</h1></div></div><div className="top-meta"><span className="sync"><i/>数据已同步 · 2026.09.25 10:04</span><button onClick={() => { setEnvReload(v => v + 1); setNotice('已请求最新环境摘要'); }}>↻ 刷新数据</button><div className="profile">陈 <span>值守员</span></div></div></header><main className="main"><section className="status-strip"><div><span className="eyebrow">STATION STATUS</span><h2>高海拔自动气象观测站</h2><p>北麓冰川保护区 · 当前气象窗口良好</p></div><div className="status-numbers"><div><strong className="cyan">{summary.normal}</strong><span>传感器正常</span></div><div><strong className="amber">{summary.attention}</strong><span>需要关注</span></div><div><strong>2.4s</strong><span>链路延迟</span></div></div></section><section className="overview-grid"><EnvironmentCard summary={envSummary} loading={envLoading} error={envError} now={now}/><div className="alert-card"><div className="card-title"><div><span className="eyebrow">OPERATION LOG</span><h3>观测动态</h3></div><button className="more" onClick={() => setNotice('已打开全部运行日志')}>全部 →</button></div><div className="alerts">{alerts.map(alert => <div className="alert" key={alert.time}><span className={`alert-mark ${alert.kind}`}>{alert.kind === 'warning' ? '!' : '✓'}</span><div><div className="alert-line"><b>{alert.title}</b><time>{alert.time}</time></div><p>{alert.desc}</p></div></div>)}</div><button className="log-btn" onClick={() => setNotice('已创建巡检任务草稿')}>＋ 创建巡检任务</button></div></section><section className="sensor-section"><div className="section-title"><div><span className="eyebrow">SENSOR ARRAY / 04</span><h3>传感器阵列</h3></div><div className="range-switch">{['6 小时','24 小时','7 天'].map(item => <button key={item} className={range === item ? 'active' : ''} onClick={() => setRange(item)}>{item}</button>)}</div></div><div className="sensor-grid">{sensors.map(sensor => <button key={sensor.id} className={selectedId === sensor.id ? 'sensor-card selected' : 'sensor-card'} onClick={() => setSelectedId(sensor.id)}><div className="sensor-top"><div><span className="sensor-code">{sensor.code}</span><h4>{sensor.name}</h4></div><span className={`sensor-status ${sensor.status === '注意' ? 'warn' : ''}`}><i/>{sensor.status}</span></div><div className="sensor-reading"><strong>{sensor.value}</strong><span>{sensor.unit}</span><em className={sensor.trend.startsWith('↓') ? 'down' : ''}>{sensor.trend}</em></div><MiniChart points={sensor.points} color={sensor.color}/><div className="sensor-time">过去 {range} <span>点击查看详情</span></div></button>)}</div></section><section className="detail-section"><div className="detail-copy"><span className="eyebrow">SELECTED SENSOR / {selected.code}</span><h3>{selected.name}历史曲线</h3><p>基于自动校准后的连续观测数据，当前设备状态为 <b>{selected.status}</b>。</p><div className="detail-tags"><span>采样间隔 10 min</span><span>质量评分 98.6</span><span>海拔 4,820 m</span></div></div><div className="big-chart"><div className="chart-y"><span>20</span><span>10</span><span>0</span><span>-10</span></div><svg viewBox="0 0 520 150" preserveAspectRatio="none"><path d="M0 92 L58 78 L110 83 L168 58 L220 66 L274 44 L330 57 L381 33 L438 45 L520 20" fill="none" stroke={selected.color} strokeWidth="3"/><path d="M0 92 L58 78 L110 83 L168 58 L220 66 L274 44 L330 57 L381 33 L438 45 L520 20 L520 150 L0 150 Z" fill={selected.color} opacity=".09"/></svg><div className="chart-x"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>现在</span></div></div></section>{notice && <div className="toast" onClick={() => setNotice('')}>{notice}<span>×</span></div>}</main></div>;
}
