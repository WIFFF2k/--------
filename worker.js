// 在后台线程解析足迹 CSV 并整理地图与详情所需字段
let sourceBytes;
let sourceLineOffsets;
let sourceRows;
let sourceTimes;
let sourceNewline;

// 按日期插入 GPX 行，同时原样复制保留的 CSV 行，未选 GPX 时沿用字节级导出
function exportWithGpx(visibleRows, groups) {
 if (!groups.length) return exportVisibleRows(visibleRows);
 groups.sort((a, b) => a.time - b.time);
 const encoder = new TextEncoder();
 const parts = [];
 let cursor = 0, selected = 0, groupIndex = 0;
 for (let i = 0; i < sourceRows.length; i += 1) {
  const row = sourceRows[i], start = sourceLineOffsets[row - 1];
  while (groupIndex < groups.length && groups[groupIndex].time <= sourceTimes[i]) {
   if (start > cursor) parts.push(sourceBytes.subarray(cursor, start));
   cursor = start;
   parts.push(encoder.encode(groups[groupIndex].lines.join(sourceNewline) + sourceNewline));
   groupIndex += 1;
  }
  if (visibleRows[selected] === row) { selected += 1; continue; }
  if (start > cursor) parts.push(sourceBytes.subarray(cursor, start));
  cursor = sourceLineOffsets[row];
 }
 if (cursor < sourceBytes.length) parts.push(sourceBytes.subarray(cursor));
 if (groupIndex < groups.length && parts.length && parts[parts.length - 1].at(-1) !== 10) parts.push(encoder.encode(sourceNewline));
 while (groupIndex < groups.length) {
  parts.push(encoder.encode(groups[groupIndex].lines.join(sourceNewline) + sourceNewline));
  groupIndex += 1;
 }
 return new Blob(parts, { type: 'text/csv;charset=utf-8' });
}

// 按原始行号删除隐藏记录，直接拼接原始字节，保留表头、空行和编码
function exportVisibleRows(visibleRows) {
 const parts = [];
 let cursor = 0, selected = 0;
 for (const row of sourceRows) {
  if (visibleRows[selected] === row) { selected += 1; continue; }
  const start = sourceLineOffsets[row - 1];
  if (start > cursor) parts.push(sourceBytes.subarray(cursor, start));
  cursor = sourceLineOffsets[row];
 }
 if (cursor < sourceBytes.length) parts.push(sourceBytes.subarray(cursor));
 return new Blob(parts, { type: 'text/csv;charset=utf-8' });
}

self.onmessage = async function (event) {
 if (event.data.type === 'export') {
  try {
   const visibleRows = new Uint32Array(event.data.rows);
   const groups = event.data.gpxGroups;
   const blob = exportWithGpx(visibleRows, groups);
   self.postMessage({ type: 'export-complete', blob, count: visibleRows.length + groups.reduce((total, group) => total + group.count, 0) });
  } catch (error) {
   self.postMessage({ type: 'export-error', message: error.message });
  }
  return;
 }
 try {
  // 在后台读取文件并向页面报告实际阶段
  self.postMessage({ type: 'progress', value: 0, phase: '正在读取原始文件' });
  const response = await fetch('原始数据/灵敢足迹(2023.05.10-2026.11.07).csv');
  if (!response.ok) throw new Error(`读取足迹数据失败：${response.status}`);
  sourceBytes = new Uint8Array(await response.arrayBuffer());
  const offsets = [0];
  for (let i = 0; i < sourceBytes.length; i += 1) {
   if (sourceBytes[i] === 10) offsets.push(i + 1);
  }
  offsets.push(sourceBytes.length);
  sourceLineOffsets = new Uint32Array(offsets);
  sourceNewline = sourceBytes[offsets[1] - 2] === 13 ? '\r\n' : '\n';
  const text = new TextDecoder('utf-8').decode(sourceBytes);
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
  sourceRows = rows.slice(0, count);
  sourceTimes = times.slice(0, count);
  self.postMessage({ type: 'complete', count, rows: rows.buffer, points: pointBuffer, times: timeBuffer, altitudes: altitudeBuffer, speeds: speedBuffer, bounds: [minLon, minLat, maxLon, maxLat], timeRange: [minTime, maxTime] }, [pointBuffer, timeBuffer, altitudeBuffer, speedBuffer, rows.buffer]);
 } catch (error) {
  self.postMessage({ type: 'error', message: error.message });
 }
};
