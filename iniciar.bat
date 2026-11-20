@echo off
setlocal
rem Arranca a API (que tambem serve o painel e o planeador) e abre o browser quando ela responder.
rem O ambiente Python fica fora do OneDrive, em %LOCALAPPDATA%\aveiro-em-movimento\venv.
set "RAIZ=%~dp0"
set "VENV=%LOCALAPPDATA%\aveiro-em-movimento\venv"
set "URL=http://localhost:8000/"

rem Se a API ja estiver a correr, basta abrir o browser.
curl -s -o nul -m 2 %URL%v1/cenarios/atual
if not errorlevel 1 (
  echo A API ja esta a correr. A abrir o browser.
  start "" %URL%
  goto fim
)

set "PY=python"
where py >nul 2>nul
if not errorlevel 1 set "PY=py -3"

if not exist "%VENV%\Scripts\python.exe" (
  echo A preparar o ambiente Python. So acontece na primeira vez.
  %PY% -m venv "%VENV%"
  if errorlevel 1 goto erro
)
echo A confirmar as dependencias...
"%VENV%\Scripts\python.exe" -m pip install -q --disable-pip-version-check -r "%RAIZ%api\requirements.txt"
if errorlevel 1 goto erro

rem Em segundo plano: espera ate 30 s que a API responda e so entao abre o browser.
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 40;$i++){try{Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 '%URL%v1/cenarios/atual' | Out-Null; Start-Process '%URL%'; break}catch{Start-Sleep -Milliseconds 700}}"

echo.
echo API em %URL%   Fechar esta janela para parar.
echo.
cd /d "%RAIZ%api"
"%VENV%\Scripts\python.exe" -m uvicorn app.main:app --port 8000
if errorlevel 1 goto erro
goto fim

:erro
echo.
echo Nao foi possivel arrancar a API. A causa esta na mensagem acima.
echo Confirma que o Python 3.10 ou superior esta instalado e que a porta 8000 esta livre.
pause

:fim
endlocal
