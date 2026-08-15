@echo off
setlocal EnableExtensions
chcp 65001 >nul

set "SSH=%SystemRoot%\System32\OpenSSH\ssh.exe"
set "ROOT=%~dp0"
set "PROJ=%ROOT%react-vite-bootstrap-project"
set "PORT=5173"
set "LOG=%PROJ%\ssh-tunnel.log"
set "CFD_LOG=%PROJ%\cloudflared-tunnel.log"
set "CFD=%ROOT%cloudflared.exe"
set "URL_FILE=%ROOT%webapp_url.txt"

if /i "%~1"=="stop" goto :stop
if /i "%~1"=="url"  goto :show_url
goto :start

:start
echo === GreenMarket: создание публичного URL ===
echo.

if not exist "%SSH%" (
    echo [Ошибка] OpenSSH-клиент не найден: %SSH%
    echo Установите "OpenSSH Client" в компонентах Windows.
    exit /b 1
)
if not exist "%PROJ%\package.json" (
    echo [Ошибка] Проект не найден: %PROJ%
    exit /b 1
)

call :is_server_running
if defined SERVER_PID (
    echo [1/3] Dev-сервер уже запущен: http://localhost:%PORT%/
) else (
    echo [1/3] Запуск GreenMarket dev-сервера...
    where npm >nul 2>&1
    if errorlevel 1 (
        echo [Ошибка] npm не найден. Установите Node.js.
        exit /b 1
    )
    pushd "%PROJ%"
    start "GreenMarket Vite Dev Server" /min cmd /c "npm run dev -- --host > vite-dev.log 2>&1"
    popd
    call :wait_for_server
    if not defined SERVER_PID exit /b 1
)

echo [2/3] Остановка старых туннелей...
call :kill_tunnels

echo [3/3] Запуск SSH-туннеля через localhost.run...
call :start_lhr
call :wait_lhr
if defined PUBLIC_URL goto :done

echo.
echo [ВНИМАНИЕ] localhost.run не дал рабочую ссылку, пробуем cloudflared...
call :kill_tunnels
if not exist "%CFD%" (
    echo [Ошибка] cloudflared.exe не найден: %CFD%
    echo Последние строки лога localhost.run:
    type "%LOG%" 2>nul
    exit /b 1
)
call :start_cf
call :wait_cf
if defined PUBLIC_URL goto :done

echo.
echo [Ошибка] Не удалось поднять ни один туннель. Последние строки логов:
echo --- ssh-tunnel.log ---
type "%LOG%" 2>nul
echo.
echo --- cloudflared-tunnel.log ---
type "%CFD_LOG%" 2>nul
echo.
exit /b 1

:done
echo.
echo Ссылка проверена и работает. Публичный URL: %PUBLIC_URL%
<nul set /p="%PUBLIC_URL%">"%URL_FILE%"
echo Сохранено в: %URL_FILE%
echo Остановить туннель: %~nx0 stop
start "" "%PUBLIC_URL%"
echo.
echo Мониторинг ссылки ^(обновление webapp_url.txt при переподключении туннеля^)...
echo Закройте это окно, чтобы завершить мониторинг. Туннель продолжит работать.
set "CURRENT_URL=%PUBLIC_URL%"

:monitor_loop
ping -n 6 127.0.0.1 >nul
call :parse_lhr
if not defined PUBLIC_URL goto :monitor_loop
if "%PUBLIC_URL%"=="%CURRENT_URL%" goto :monitor_loop
<nul set /p="%PUBLIC_URL%">"%URL_FILE%"
echo Туннель переподключился, обновлена ссылка: %PUBLIC_URL%
set "CURRENT_URL=%PUBLIC_URL%"
goto :monitor_loop

:start_lhr
call :clear_file "%LOG%"
start "GreenMarket SSH Tunnel" /min cmd /c ""%SSH%" -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ConnectTimeout=15 -R 80:localhost:%PORT% nokey@localhost.run > "%LOG%" 2>&1"
exit /b 0

:start_cf
call :clear_file "%CFD_LOG%"
start "GreenMarket Cloudflare Tunnel" /min cmd /c ""%CFD%" tunnel --url http://localhost:%PORT% --no-autoupdate > "%CFD_LOG%" 2>&1"
exit /b 0

:clear_file
if exist "%~1" del /f /q "%~1" 2>nul
if exist "%~1" (
    ping -n 3 127.0.0.1 >nul
    del /f /q "%~1" 2>nul
)
exit /b 0

:wait_lhr
set /a ATTEMPTS=0
:wl_loop
set /a ATTEMPTS+=1
if %ATTEMPTS% GEQ 30 (
    echo [ВНИМАНИЕ] Таймаут localhost.run, ссылка не заработала за 30 попыток.
    exit /b 0
)
ping -n 2 127.0.0.1 >nul
call :parse_lhr
if not defined PUBLIC_URL goto :wl_loop
call :verify_now
if errorlevel 1 goto :wl_loop
exit /b 0

:wait_cf
set /a ATTEMPTS=0
:wc_loop
set /a ATTEMPTS+=1
if %ATTEMPTS% GEQ 40 (
    echo [ВНИМАНИЕ] Таймаут cloudflared, ссылка не заработала за 40 попыток.
    exit /b 0
)
ping -n 2 127.0.0.1 >nul
call :parse_cf
if not defined PUBLIC_URL goto :wc_loop
call :verify_now
if errorlevel 1 goto :wc_loop
exit /b 0

:parse_lhr
set "PUBLIC_URL="
for /f "delims=" %%U in ('powershell -NoProfile -Command "Select-String -Path '%LOG%' -Pattern 'https://[a-zA-Z0-9._-]+[.]lhr[.]life' -AllMatches -ErrorAction SilentlyContinue | ForEach-Object { $_.Matches.Value } | Select-Object -Last 1"') do set "PUBLIC_URL=%%U"
exit /b 0

:parse_cf
set "PUBLIC_URL="
for /f "delims=" %%U in ('powershell -NoProfile -Command "Select-String -Path '%CFD_LOG%' -Pattern 'https://[a-zA-Z0-9-]+[.]trycloudflare[.]com' -AllMatches -ErrorAction SilentlyContinue | ForEach-Object { $_.Matches.Value } | Select-Object -Last 1"') do set "PUBLIC_URL=%%U"
exit /b 0

:verify_now
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%PUBLIC_URL%' -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>&1
if errorlevel 1 exit /b 1
exit /b 0

:wait_for_server
set /a ATTEMPTS=0
:ws_loop
set /a ATTEMPTS+=1
if %ATTEMPTS% GEQ 30 (
    echo [Ошибка] Dev-сервер не поднялся. Лог: %PROJ%\vite-dev.log
    exit /b 1
)
ping -n 2 127.0.0.1 >nul
call :is_server_running
if not defined SERVER_PID goto :ws_loop
echo Dev-сервер поднят: http://localhost:%PORT%/
exit /b 0

:kill_tunnels
taskkill /f /im ssh.exe >nul 2>&1
taskkill /f /im cloudflared.exe >nul 2>&1
ping -n 3 127.0.0.1 >nul
exit /b 0

:is_server_running
set "SERVER_PID="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /c:":%PORT% " ^| findstr "LISTENING"') do set "SERVER_PID=%%p"
exit /b 0

:stop
call :kill_tunnels
echo Туннель остановлен. Dev-сервер продолжает работать на http://localhost:%PORT%/
exit /b 0

:show_url
if not exist "%URL_FILE%" (
    echo Ссылка ещё не создана. Запустите %~nx0 без аргументов.
    exit /b 1
)
set /p PUBLIC_URL=<"%URL_FILE%"
echo Публичный URL: %PUBLIC_URL%
exit /b 0
