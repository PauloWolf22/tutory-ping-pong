@echo off
title Tutory Sports
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\server.ps1" %*
pause
