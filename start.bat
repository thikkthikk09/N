@echo off
cd /d "%~dp0"
set "URL=http://127.0.0.1:8787/index.html"

echo Checking payment server on port 8787...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest 'http://127.0.0.1:8787/api/health' -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
  echo Server already running.
  start "" "%URL%"
  exit /b 0
)

echo Stopping any old process on port 8787...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8787 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
timeout /t 2 /nobreak >nul

echo Starting Dyna Store + Bakong proxy...
echo Keep this window OPEN while you use the store.
echo.
start "" "%URL%"
node server.mjs
if errorlevel 1 (
  echo.
  echo Server stopped. See error above.
  pause
)
