@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0failure-test.ps1" %*
