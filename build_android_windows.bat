@echo off
setlocal
cd /d "%~dp0"
echo === LAMSET FAN Android Build ===
where node >nul 2>nul || (echo Node.js is required. & pause & exit /b 1)
where npm >nul 2>nul || (echo npm is required. & pause & exit /b 1)
if not exist node_modules call npm install
if errorlevel 1 goto failed
if not exist android\gradlew.bat call npx cap add android
if errorlevel 1 goto failed
call npx cap sync android
if errorlevel 1 goto failed
cd android
call gradlew.bat assembleDebug
if errorlevel 1 goto failed
 echo.
echo APK created at:
echo %CD%\app\build\outputs\apk\debug\app-debug.apk
explorer app\build\outputs\apk\debug
pause
exit /b 0
:failed
echo.
echo Build failed. Check Android Studio / Android SDK / JDK setup and the error above.
pause
exit /b 1
