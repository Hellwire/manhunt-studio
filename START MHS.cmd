@echo off
start "" php -S localhost:8080
timeout /t 2 /nobreak > nul
start "" "http://localhost:8080"
