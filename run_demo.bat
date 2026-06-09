@echo off
setlocal

cd /d "%~dp0"

echo WorkHQ Demo Assets
echo ==================

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo ERROR: Node.js was not found.
    echo Install Node.js 18 or newer from https://nodejs.org/ and run this file again.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo.
    echo ERROR: npm was not found.
    echo Reinstall Node.js from https://nodejs.org/ and run this file again.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo.
    echo Installing project dependencies...
    call npm install
    if errorlevel 1 (
        echo.
        echo ERROR: npm install failed.
        pause
        exit /b 1
    )
)

if not exist "config\workhq-config.json" (
    if exist "config\workhq-config.example.json" (
        copy /y "config\workhq-config.example.json" "config\workhq-config.json" >nul
        echo.
        echo Created config\workhq-config.json from the example.
        echo Edit that file with your WorkHQ details before using API-backed demos.
    ) else (
        echo.
        echo WARNING: config\workhq-config.example.json was not found.
    )
)

echo.
echo Starting:
echo   Demo hub: http://localhost:8080
echo   Proxy:    http://localhost:3000
echo.
echo Press Ctrl+C to stop both services.
echo.

call npm run dev

if errorlevel 1 (
    echo.
    echo The demo stopped with an error.
    pause
    exit /b 1
)

endlocal
