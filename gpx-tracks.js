// 加载独立 GPX 路线，提供地图图层和按指定日期生成的导出记录
const gpxTracks = [];

// 读取路线目录与轨迹点，全部成功后再启用显示和导出
async function loadGpxTracks() {
  const manifestResponse = await fetch('GPX/routes.json');
  if (!manifestResponse.ok) throw new Error(`路线清单读取失败：${manifestResponse.status}`);
  const manifest = await manifestResponse.json();
  const tracks = await Promise.all(manifest.map(async item => {
    const response = await fetch(`GPX/${encodeURIComponent(item.file)}`);
    if (!response.ok) throw new Error(`${item.name}读取失败：${response.status}`);
    const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error(`${item.name}的 GPX 格式错误`);
    const segments = [...xml.getElementsByTagNameNS('*', 'trkseg')];
    const paths = segments.length ? segments : [...xml.getElementsByTagNameNS('*', 'rte')];
    const points = [];
    const data = paths.map(segment => {
      const nodes = [...segment.getElementsByTagNameNS('*', segments.length ? 'trkpt' : 'rtept')];
      const path = nodes.map(node => {
        const latText = node.getAttribute('lat'), lonText = node.getAttribute('lon');
        const lat = Number(latText), lon = Number(lonText);
        if (latText === null || lonText === null || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error(`${item.name}含无效坐标`);
        const elevation = node.getElementsByTagNameNS('*', 'ele')[0]?.textContent.trim() || '';
        points.push({ lat: latText, lon: lonText, elevation });
        return [lon, lat];
      });
      return { path };
    });
    if (!points.length) throw new Error(`${item.name}没有轨迹点`);
    return { ...item, points, data, time: Date.parse(`${item.date}T12:00:00+08:00`), midnight: Date.parse(`${item.date}T00:00:00+08:00`) };
  }));
  const container = document.getElementById('gpx-options');
  for (const track of tracks) {
    const label = document.createElement('label');
    label.className = 'filter-option';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox'; toggle.checked = true; toggle.id = `show-gpx-${track.id}`;
    const text = document.createElement('span');
    text.textContent = `${track.name}（${track.date}）`;
    label.append(toggle, text); container.append(label);
    toggle.addEventListener('change', refreshDisplay);
    track.toggle = toggle; gpxTracks.push(track);
  }
  document.getElementById('gpx-status').textContent = '默认显示；导出时间统一为指定日期北京时间 12:00';
}

// 为勾选路线生成独立线图层，并保留原始分段边界
function gpxLayers() {
  return gpxTracks.filter(track => track.toggle.checked).map(track => new deck.PathLayer({
    id: `gpx-${track.id}`, data: track.data, getPath: item => item.path, getColor: [219, 125, 35, 200],
    widthUnits: 'pixels', getWidth: 2, pickable: true,
    onClick: () => {
      // 路线详情单独标明规划来源，避免与实测 CSV 混淆
      const detail = document.getElementById('detail-card');
      detail.textContent = `${track.name} · ${track.date} 12:00 · ${formatNumber(track.points.length)} 个点 · ${track.id === 'qinggan' ? '用户已有 GPX' : '铁路规划路线（非实测）'}`;
    }
  }));
}

// 生成相同十四列的新记录，缺失的实测字段留空，仅填写 GPX 已有数据
function gpxExportGroups() {
  return gpxTracks.filter(track => track.toggle.checked).map(track => ({
    time: track.time, count: track.points.length,
    lines: track.points.map(point => [track.time, '', '', point.lat, point.lon, point.elevation, '', '', '', '', track.midnight, '', '', ''].join(','))
  }));
}
