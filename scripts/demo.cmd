@echo off
if exist "%~dp0..\.venv\Scripts\python.exe" (
  "%~dp0..\.venv\Scripts\python.exe" "%~dp0demo.py" %*
) else (
  python "%~dp0demo.py" %*
)
