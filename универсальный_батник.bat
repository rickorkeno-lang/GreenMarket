@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: Очищаем или создаем пустой файл webapp_url.txt
copy /y nul webapp_url.txt >nul

set "LOG_FILE=ssh_tunnel.log"

echo Завершение старых процессов SSH...
taskkill /f /im ssh.exe >nul 2>&1
timeout /t 1 >nul

if exist "%LOG_FILE%" del /f /q "%LOG_FILE%"

echo Запуск фонового SSH-туннеля...
start /B "" cmd /c ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -R 80:localhost:8080 nokey@localhost.run ^> %LOG_FILE% 2^>^&1

echo Ожидание генерации ссылки...
set /a "counter=0"

:search_loop
timeout /t 1 >nul
set /a "counter+=1"

:: Проверяем таймаут (скобки экранированы символом ^, чтобы не ломать парсер)
if !counter! gtr 15 (
    echo.
    echo [Ошибка] Превышено время ожидания ссылки ^(прошло 15 секунд^).
    echo Возможно, SSH не смог подключиться. Проверьте лог-файл: %LOG_FILE%
    pause
    exit /b
)

if not exist "%LOG_FILE%" goto search_loop

set "FOUND_URL="
:: БЕЗОПАСНЫЙ ПАРСИНГ: Ищем только строку, содержащую lhr.life
:: Это полностью исключает вылеты скрипта из-за скобок в тексте приветствия localhost.run
for /f "delims=" %%L in ('findstr /R /C:"https://.*\.lhr\.life" "%LOG_FILE%" 2^>nul') do (
    :: Разбиваем найденную безопасную строку на слова
    for %%W in (%%L) do (
        echo %%W | findstr /i "https://" >nul
        if !errorlevel! equ 0 (
            set "FOUND_URL=%%W"
        )
    )
)

:: Если ссылка не найдена, продолжаем ждать
if "%FOUND_URL%"=="" goto search_loop

:: Убираем запятые, если они случайно прилипли к ссылке
set "FOUND_URL=!FOUND_URL:,=!"

:: Записываем чистую ссылку в файл без пробелов и переносов строки
<nul set /p="%FOUND_URL%">webapp_url.txt

echo.
echo Ссылка найдена и сохранена: %FOUND_URL%
echo Запуск docker-start-bot.bat...

call docker-start-bot.bat