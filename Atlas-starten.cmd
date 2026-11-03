@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js wird benoetigt. Installiere Node.js 20 oder neuer. & pause & exit /b 1)
curl -fsS http://127.0.0.1:4173/ >nul 2>nul && (start "" "http://127.0.0.1:4173/" & exit /b 0)
if not exist node_modules (call npm install || (pause & exit /b 1))
call npm run build || (pause & exit /b 1)
call npm run preview -- --port 4173 --strictPort --open
if errorlevel 1 pause
