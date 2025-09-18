@echo off
echo 포트 3001 정리 중...

REM 포트 3001을 사용하는 프로세스 찾기
for /f "tokens=5" %%i in ('netstat -ano ^| findstr :3001') do (
    if not "%%i"=="0" (
        echo 프로세스 %%i 종료 중...
        taskkill /PID %%i /F >nul 2>&1
    )
)

echo 서버 시작 중...
npm run dev