@echo off
REM Windows AI Health Daemon - Launcher
REM Double-click this file or run from Command Prompt

echo ============================================
echo  Nebula Command - Windows AI Health Daemon
echo ============================================
echo.

REM Check if webhook URL is set
if "%NEBULA_HEALTH_WEBHOOK%"=="" (
    echo Setting default webhook URL...
    set "NEBULA_HEALTH_WEBHOOK=https://dash.evindrake.net/api/ai/health-webhook"
)

echo Webhook: %NEBULA_HEALTH_WEBHOOK%
echo.
echo Starting health daemon... (Keep this window open)
echo.

REM Run the PowerShell script
powershell.exe -ExecutionPolicy Bypass -File "%~dp0start-health-daemon.ps1" -WebhookUrl "%NEBULA_HEALTH_WEBHOOK%"

pause
