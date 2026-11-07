# 启动本地足迹地图查看器
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8765
$url = "http://localhost:$port/"

# 如果已有地图服务在运行，直接打开现有页面，避免重复绑定端口
try {
  $existing = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2
  if ($existing.StatusCode -eq 200 -and $existing.Content -match '灵敢足迹地图') {
    Write-Host "地图服务已经在运行，正在打开现有页面。" -ForegroundColor Green
    Start-Process $url
    exit 0
  }
} catch {
  # 端口没有现成的地图服务，继续启动
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
try {
  $listener.Start()
} catch {
  Write-Host "地图服务启动失败：$($_.Exception.Message)" -ForegroundColor Red
  Write-Host "请检查端口 $port 是否已被其他程序占用。" -ForegroundColor Yellow
  exit 1
}
Write-Host "足迹地图已启动：$url" -ForegroundColor Green
Start-Process $url

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $relative = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
    $file = Join-Path $root $relative
    if (Test-Path -LiteralPath $file -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
      $types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.csv'='text/csv; charset=utf-8' }
      $context.Response.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
      $context.Response.ContentLength64 = $bytes.Length
      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $context.Response.StatusCode = 404
    }
    $context.Response.Close()
  }
} finally {
  $listener.Stop()
}
