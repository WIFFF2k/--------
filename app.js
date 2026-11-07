// 初始化地图、接收解析结果并提供足迹点检查交互
const state = { points: null, times: null, altitudes: null, speeds: null, count: 0, bounds: null, timeRange: null };
// 根据连续滑行、起飞及落地记录划定两段航程，结束时刻的地面记录保留
const flightRanges = [
  [Date.parse('2025-07-26T13:41:10.110+08:00'), Date.parse('2025-07-26T16:03:54.082+08:00')],
  [Date.parse('2025-07-27T12:50:50.425+08:00'), Date.parse('2025-07-27T15:05:30.191+08:00')]
];
const flightToggle = document.getElementById('show-flight');
const harbinFlightToggle = document.getElementById('show-harbin-flight');
const juneFlightToggle = document.getElementById('show-june-flight');
const marchFlightToggle = document.getElementById('show-march-flight');
const decemberFlightToggle = document.getElementById('show-december-flight');
const decemberReturnToggle = document.getElementById('show-december-return');
const anomalyToggle = document.getElementById('show-isolated');
const displayToggles = [flightToggle, harbinFlightToggle, juneFlightToggle, marchFlightToggle, decemberFlightToggle, decemberReturnToggle, anomalyToggle];
const showAllButton = document.getElementById('show-all-filters');
const hideAllButton = document.getElementById('hide-all-filters');
const exportButton = document.getElementById('export-csv');
const exportStatus = document.getElementById('export-status');
let exporting = false;
// 两次成都武汉航程分别控制，包含起飞滑行，保留目的地恢复地面定位后的记录
const marchFlightRange = [Date.parse('2026-03-16T11:41:52.271+08:00'), Date.parse('2026-03-16T13:31:25.462+08:00')];
const decemberFlightRange = [Date.parse('2025-12-25T11:11:42.900+08:00'), Date.parse('2025-12-25T13:08:32.373+08:00')];
// 12 月 30 日成都返回武汉，包含连续起飞滑行，保留落地减速后的地面点
const decemberReturnRange = [Date.parse('2025-12-30T20:29:50.551+08:00'), Date.parse('2025-12-30T22:03:32.559+08:00')];
// 六月往返只隐藏滑行及飞行区间，保留落地后和两程之间的地面活动
const juneFlightRanges = [
  [Date.parse('2026-06-21T20:31:48.783+08:00'), Date.parse('2026-06-21T23:20:55.964+08:00')],
  [Date.parse('2026-06-28T15:43:46.390+08:00'), Date.parse('2026-06-28T18:48:42.567+08:00')]
];
// 8 月 30 日实际为哈尔滨返回武汉，包含离开停机位后的滑行，保留武汉落地记录
const harbinFlightRange = [Date.parse('2026-08-30T11:41:15.890+08:00'), Date.parse('2026-08-30T15:12:36.436+08:00')];
// 仅匹配用户指定的八处孤立位置，重复及近邻定位共十四条，按时间和 WGS84 经纬度确认
const isolatedRecords = new Map([
  [1760709651583, [109.49199307, 30.33311468]], // 恩施
  [1692273425000, [114.29802915, 25.11456111]], // 南雄
  [1747443315367, [110.63877369, 21.67645435]], // 化州
  [1747443409114, [110.63877369, 21.67645435]],
  [1748756799843, [108.91773427, 34.17659071]], // 西安第一处
  [1770609291044, [108.94554061, 34.22709418]], // 西安第二处
  [1770611427134, [108.94554061, 34.22709418]],
  [1770611578818, [108.94554061, 34.22709418]],
  [1767268130498, [117.14574733, 36.16930106]], // 泰安
  [1767269456822, [120.38529273, 36.1491285]], // 青岛
  [1782049260559, [114.43496113, 36.52419732]], // 邯郸
  [1782049384422, [114.43484081, 36.52431806]],
  [1782049403591, [114.43512156, 36.52401268]],
  [1782049422767, [114.43460119, 36.52440462]]
]);
const loading = document.getElementById('loading');
const loadingDetail = document.getElementById('loading-detail');
const progress = document.getElementById('progress');
const tiandituKey = window.MAP_CONFIG.tiandituKey;
const map = new maplibregl.Map({
  container: 'map',
  center: [104, 35],
  zoom: 4.35,
  maxZoom: 18,
  attributionControl: false,
  style: { version: 8, sources: { img: { type: 'raster', tiles: [`https://t0.tianditu.gov.cn/DataServer?T=vec_w&x={x}&y={y}&l={z}&tk=${tiandituKey}`], tileSize: 256 }, cia: { type: 'raster', tiles: [`https://t0.tianditu.gov.cn/DataServer?T=cva_w&x={x}&y={y}&l={z}&tk=${tiandituKey}`], tileSize: 256 } }, layers: [{ id: 'img', type: 'raster', source: 'img' }, { id: 'cia', type: 'raster', source: 'cia' }] }
});
map.addControl(new maplibregl.NavigationControl(), 'top-right');
const overlay = new deck.MapboxOverlay({ interleaved: false, layers: [] });
map.addControl(overlay);
map.on('error', () => {
  // 底图请求失败与足迹读取状态独立显示
  document.getElementById('map-error').hidden = false;
});

// 格式化数字，保证状态面板适合阅读
function formatNumber(value) { return new Intl.NumberFormat('zh-CN').format(value); }

// 格式化毫秒时间戳
function formatTime(value) { return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai' }).format(new Date(value)); }

// 按独立开关刷新点图层及可见范围，不改变相机
function renderTracks() {
  const indices = [];
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (let index = 0; index < state.count; index += 1) {
    const time = state.times[index];
    if (!flightToggle.checked && flightRanges.some(([start, end]) => time >= start && time < end)) continue;
    if (!harbinFlightToggle.checked && time >= harbinFlightRange[0] && time < harbinFlightRange[1]) continue;
    if (!juneFlightToggle.checked && juneFlightRanges.some(([start, end]) => time >= start && time < end)) continue;
    if (!marchFlightToggle.checked && time >= marchFlightRange[0] && time < marchFlightRange[1]) continue;
    if (!decemberFlightToggle.checked && time >= decemberFlightRange[0] && time < decemberFlightRange[1]) continue;
    if (!decemberReturnToggle.checked && time >= decemberReturnRange[0] && time < decemberReturnRange[1]) continue;
    const lon = state.points[index * 2];
    const lat = state.points[index * 2 + 1];
    const isolated = !anomalyToggle.checked && isolatedRecords.get(time);
    if (isolated && lon === isolated[0] && lat === isolated[1]) continue;
    indices.push(index);
    bounds[0] = Math.min(bounds[0], lon); bounds[1] = Math.min(bounds[1], lat);
    bounds[2] = Math.max(bounds[2], lon); bounds[3] = Math.max(bounds[3], lat);
  }
  state.visibleIndices = indices;
  const visibleGpx = gpxTracks.filter(track => track.toggle.checked);
  state.gpxCount = visibleGpx.reduce((total, track) => total + track.points.length, 0);
  for (const track of visibleGpx) for (const point of track.points) {
    bounds[0] = Math.min(bounds[0], Number(point.lon)); bounds[1] = Math.min(bounds[1], Number(point.lat));
    bounds[2] = Math.max(bounds[2], Number(point.lon)); bounds[3] = Math.max(bounds[3], Number(point.lat));
  }
  state.visibleBounds = indices.length + state.gpxCount ? bounds : null;
  overlay.setProps({ layers: [new deck.ScatterplotLayer({ id: 'track-points', data: indices, pickable: true, radiusUnits: 'pixels', getPosition: index => [state.points[index * 2], state.points[index * 2 + 1]], getRadius: 2.5, getFillColor: [13, 143, 131, 155], radiusMinPixels: 1, radiusMaxPixels: 5, onClick: info => showDetail(info.object) }), ...gpxLayers()] });
  updateStats();
}

// 定位当前显示的全部点位
function fitVisibleTracks() {
  if (state.visibleBounds) map.fitBounds([[state.visibleBounds[0], state.visibleBounds[1]], [state.visibleBounds[2], state.visibleBounds[3]]], { padding: 60, duration: 0 });
}

// 显示选中点的原始字段摘要
function showDetail(index) {
  if (index == null || index < 0) return;
  const lon = state.points[index * 2];
  const lat = state.points[index * 2 + 1];
  document.getElementById('detail-card').innerHTML = `<dl><dt>原始行号</dt><dd>${state.rows[index]}</dd><dt>记录时间</dt><dd>${formatTime(state.times[index])}</dd><dt>WGS84 纬度</dt><dd>${lat.toFixed(8)}</dd><dt>WGS84 经度</dt><dd>${lon.toFixed(8)}</dd><dt>海拔</dt><dd>${state.altitudes[index].toFixed(2)} m</dd><dt>速度</dt><dd>${state.speeds[index].toFixed(2)} m/s</dd></dl>`;
}

// 更新数据概览区域
function updateStats() {
  document.getElementById('point-count').textContent = formatNumber(state.visibleIndices.length + state.gpxCount);
  document.getElementById('filter-summary').textContent = `原始 ${formatNumber(state.count)} 条 · 已隐藏 ${formatNumber(state.count - state.visibleIndices.length)} 条`;
  document.getElementById('filter-summary').textContent += ` · GPX 显示 ${formatNumber(state.gpxCount)} 个点`;
  const times = gpxTracks.filter(track => track.toggle.checked).map(track => track.time);
  document.getElementById('time-range').textContent = `${formatTime(Math.min(state.timeRange[0], ...times))} 至 ${formatTime(Math.max(state.timeRange[1], ...times))}`;
  const bounds = state.visibleBounds;
  document.getElementById('coord-range').textContent = bounds ? `${bounds[1].toFixed(3)}°–${bounds[3].toFixed(3)}°N / ${bounds[0].toFixed(3)}°–${bounds[2].toFixed(3)}°E` : '无显示点';
}

// 启动后台解析线程
const worker = new Worker('worker.js');
worker.onmessage = async event => {
  const message = event.data;
  if (message.type === 'export-complete' || message.type === 'export-error') {
    finishExport(message);
    return;
  }
  if (message.type === 'progress') {
    const value = Math.round(message.value * 100);
    progress.style.width = `${value}%`;
    loadingDetail.textContent = message.phase || `已解析 ${value}%…`;
    return;
  }
  if (message.type === 'error') {
    loadingDetail.textContent = `读取失败：${message.message}`;
    return;
  }
  state.count = message.count;
  state.rows = new Uint32Array(message.rows);
  state.points = new Float64Array(message.points);
  state.times = new Float64Array(message.times);
  state.altitudes = new Float64Array(message.altitudes);
  state.speeds = new Float64Array(message.speeds);
  state.bounds = message.bounds;
  state.timeRange = message.timeRange;
  renderTracks();
  displayToggles.forEach(toggle => { toggle.disabled = false; });
  showAllButton.disabled = false;
  hideAllButton.disabled = false;
  loading.remove();
  document.getElementById('fit-button').disabled = false;
  try {
    await loadGpxTracks();
    renderTracks();
    exportButton.disabled = false;
  } catch (error) {
    document.getElementById('gpx-status').textContent = `GPX 加载失败：${error.message}，请刷新重试`;
    exportStatus.textContent = 'GPX 未加载完整，暂不能导出';
  }
};
worker.onerror = event => {
  // 后台错误按读取和导出阶段分别显示
  if (exporting) finishExport({ type: 'export-error', message: event.message || '后台导出中断，请刷新页面后重试' });
  else loadingDetail.textContent = `读取失败：${event.message || '请确认已通过启动脚本打开页面'}`;
};
worker.postMessage({ type: 'start' });
document.getElementById('fit-button').addEventListener('click', fitVisibleTracks);
// 所有开关共享刷新入口，保持当前中心、缩放、旋转和倾斜角度
function refreshDisplay() {
  document.getElementById('detail-card').innerHTML = '<p class="detail-placeholder">点击地图上的点查看原始记录</p>';
  renderTracks();
}
displayToggles.forEach(toggle => toggle.addEventListener('change', refreshDisplay));

// 批量设置已有隐藏项目，只刷新一次图层并保留当前相机
function setAllFiltersVisible(visible) {
  displayToggles.forEach(toggle => { toggle.checked = visible; });
  refreshDisplay();
}
showAllButton.addEventListener('click', () => setAllFiltersVisible(true));
hideAllButton.addEventListener('click', () => setAllFiltersVisible(false));

// 固定点击时的显示记录，导出期间继续切换不会改变本次文件内容
function exportCurrentCsv() {
  const rows = Uint32Array.from(state.visibleIndices, index => state.rows[index]);
  const gpxGroups = gpxExportGroups();
  exporting = true;
  exportButton.disabled = true;
  exportStatus.textContent = `正在导出 ${formatNumber(rows.length + state.gpxCount)} 条记录…`;
  worker.postMessage({ type: 'export', rows: rows.buffer, gpxGroups }, [rows.buffer]);
}

// 下载后台生成的新文件，反馈结果并释放下载地址
function finishExport(message) {
  try {
    if (message.type === 'export-error') throw new Error(message.message);
    const url = URL.createObjectURL(message.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `灵敢足迹_筛选后_${message.count}条_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    exportStatus.textContent = `已发起下载：${formatNumber(message.count)} 条记录（点击导出时的勾选状态）`;
  } catch (error) {
    exportStatus.textContent = `导出失败：${error.message}`;
  } finally {
    exporting = false;
    exportButton.disabled = false;
  }
}
exportButton.addEventListener('click', exportCurrentCsv);
