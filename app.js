// 初始化地图、接收解析结果并提供足迹点检查交互
const state = { points: null, times: null, altitudes: null, speeds: null, count: 0, bounds: null, timeRange: null };
const loading = document.getElementById('loading');
const loadingDetail = document.getElementById('loading-detail');
const progress = document.getElementById('progress');
const tiandituKey = window.MAP_CONFIG.tiandituKey;
const map = new maplibregl.Map({
  container: 'map',
  center: [121.4, 31.2],
  zoom: 4,
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

// 根据数据范围定位地图并刷新点图层
function renderTracks() {
  const indices = Array.from({ length: state.count }, (_, index) => index);
  overlay.setProps({ layers: [new deck.ScatterplotLayer({ id: 'track-points', data: indices, pickable: true, radiusUnits: 'pixels', getPosition: index => [state.points[index * 2], state.points[index * 2 + 1]], getRadius: 2.5, getFillColor: [13, 143, 131, 155], radiusMinPixels: 1, radiusMaxPixels: 5, onClick: info => showDetail(info.index) })] });
  map.fitBounds([[state.bounds[0], state.bounds[1]], [state.bounds[2], state.bounds[3]]], { padding: 60, duration: 0 });
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
  document.getElementById('point-count').textContent = formatNumber(state.count);
  document.getElementById('time-range').textContent = `${formatTime(state.timeRange[0])} 至 ${formatTime(state.timeRange[1])}`;
  document.getElementById('coord-range').textContent = `${state.bounds[1].toFixed(3)}°–${state.bounds[3].toFixed(3)}°N / ${state.bounds[0].toFixed(3)}°–${state.bounds[2].toFixed(3)}°E`;
}

// 启动后台解析线程
const worker = new Worker('worker.js');
worker.onmessage = event => {
  const message = event.data;
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
  updateStats();
  renderTracks();
  loading.remove();
  document.getElementById('fit-button').disabled = false;
};
worker.onerror = event => { loadingDetail.textContent = `读取失败：${event.message || '请确认已通过启动脚本打开页面'}`; };
worker.postMessage({ type: 'start' });
document.getElementById('fit-button').addEventListener('click', () => {
  // 重新定位时复用已经创建的全量点图层
  map.fitBounds([[state.bounds[0], state.bounds[1]], [state.bounds[2], state.bounds[3]]], { padding: 60, duration: 0 });
});
