// 在后台线程解析足迹 CSV 并整理地图与详情所需字段
self.onmessage = async function () {
 try {
  // 在后台读取文件并向页面报告实际阶段
  self.postMessage({ type: 'progress', value: 0, phase: '正在读取原始文件' });
  const response = await fetch('原始数据/灵敢足迹(2023.05.10-2026.11.07).csv');
  if (!response.ok) throw new Error(`读取足迹数据失败：${response.status}`);
  const text = await response.text();
  const lines = text.split(/\r?\n/);
  const total = lines.slice(1).filter(line => line.trim()).length;
  if (!total) throw new Error('原始文件没有足迹记录');
  const points = new Float64Array(total * 2);
  const times = new Float64Array(total);
  const rows = new Uint32Array(total);
  const altitudes = new Float64Array(total);
  const speeds = new Float64Array(total);
  let count = 0;
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180, minTime = Infinity, maxTime = -Infinity;
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    const fields = line.split(',');
    const time = Number(fields[0]);
    const lat = Number(fields[3]);
    const lon = Number(fields[4]);
    if (!fields[0]?.trim() || !fields[3]?.trim() || !fields[4]?.trim() || ![time, lat, lon].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      throw new Error(`第 ${i + 1} 行的时间或经纬度无效，未跳过记录`);
    }
    const offset = count * 2;
    points[offset] = lon;
    points[offset + 1] = lat;
    times[count] = time;
    rows[count] = i + 1;
    altitudes[count] = fields[5]?.trim() ? Number(fields[5]) : NaN;
    speeds[count] = fields[9]?.trim() ? Number(fields[9]) : NaN;
    count += 1;
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
    minTime = Math.min(minTime, time); maxTime = Math.max(maxTime, time);
    if (i % 5000 === 0) self.postMessage({ type: 'progress', value: i / (lines.length - 1) });
  }
  const pointBuffer = points.slice(0, count * 2).buffer;
  const timeBuffer = times.slice(0, count).buffer;
  const altitudeBuffer = altitudes.slice(0, count).buffer;
  const speedBuffer = speeds.slice(0, count).buffer;
  self.postMessage({ type: 'complete', count, rows: rows.buffer, points: pointBuffer, times: timeBuffer, altitudes: altitudeBuffer, speeds: speedBuffer, bounds: [minLon, minLat, maxLon, maxLat], timeRange: [minTime, maxTime] }, [pointBuffer, timeBuffer, altitudeBuffer, speedBuffer, rows.buffer]);
 } catch (error) {
  self.postMessage({ type: 'error', message: error.message });
 }
};
