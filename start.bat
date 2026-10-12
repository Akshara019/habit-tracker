@echo off
title Habit Flow
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Install it from https://nodejs.org then run this file again. & pause & exit /b)
if not exist node_modules (echo Installing packages, please wait... & call npm install)
start "" http://localhost:3000
echo Habit Flow is running. Keep this window open. Close it to stop the server.
call npm start
pause
