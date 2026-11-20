@echo off
setlocal
rem Compila as interfaces (portal, painel, transportadora) e devolve a pasta dist de cada uma ao projeto.
rem A compilacao corre fora do OneDrive, em %LOCALAPPDATA%\aveiro-em-movimento\build, para o node_modules nao ser sincronizado.
rem Uso:  construir.bat            compila as tres
rem       construir.bat portal     compila so essa
set "RAIZ=%~dp0"
set "OBRA=%LOCALAPPDATA%\aveiro-em-movimento\build"
set "LISTA=%*"
if "%LISTA%"=="" set "LISTA=portal painel transportadora"

where npm >nul 2>nul
if errorlevel 1 (
  echo O Node.js 18 ou superior nao esta instalado.
  goto erro
)

rem O portal usa o planeador da transportadora, por isso copiam-se sempre as tres pastas.
for %%A in (portal painel transportadora) do (
  robocopy "%RAIZ%%%A" "%OBRA%\%%A" /MIR /XD node_modules dist /XF package-lock.json /NFL /NDL /NJH /NJS /NP >nul
  if errorlevel 8 goto erro
  if exist "%RAIZ%%%A\package-lock.json" copy /y "%RAIZ%%%A\package-lock.json" "%OBRA%\%%A\" >nul
)

for %%A in (%LISTA%) do (
  echo.
  echo == %%A
  pushd "%OBRA%\%%A"
  call npm install --no-audit --no-fund
  if errorlevel 1 goto erro
  call npx vite build --outDir "%RAIZ%%%A\dist" --emptyOutDir
  if errorlevel 1 goto erro
  if not exist "%RAIZ%%%A\package-lock.json" copy /y package-lock.json "%RAIZ%%%A\" >nul
  popd
)

echo.
echo Feito. Se a API ja estava a correr, fecha a janela dela e volta a abrir o iniciar.bat.
goto fim

:erro
echo.
echo Nao foi possivel compilar. A causa esta na mensagem acima.
exit /b 1

:fim
endlocal
