@echo off
title Tutory Ping Pong Championship
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\server.ps1" %*
pause
