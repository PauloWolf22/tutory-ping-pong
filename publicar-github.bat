@echo off
title Publicar Tutory Ping Pong no GitHub Pages
cd /d "%~dp0"
set "REPO=PauloWolf22/tutory-ping-pong"
set "PASTA=%CD:\=/%"

git config --global --get-all safe.directory | findstr /x /c:"%PASTA%" >nul || git config --global --add safe.directory "%PASTA%"

echo [1/4] Conferindo o login do GitHub...
gh auth status >nul 2>&1
if not errorlevel 1 goto logado
echo.
echo Esta janela nao esta logada no GitHub.
echo O navegador vai abrir: entre com a conta PauloWolf22 e cole o codigo mostrado aqui.
echo.
gh auth login --hostname github.com --git-protocol https --web
gh auth status >nul 2>&1
if errorlevel 1 goto erro
:logado
gh auth setup-git
if errorlevel 1 goto erro

echo [2/4] Conferindo o repositorio %REPO%...
gh repo view %REPO% >nul 2>&1
if not errorlevel 1 goto existe
gh repo create %REPO% --public --description "Plataforma do campeonato interno de ping pong da Tutory"
if errorlevel 1 goto erro
:existe
git remote get-url origin >nul 2>&1
if errorlevel 1 git remote add origin https://github.com/%REPO%.git

echo [3/4] Enviando o app...
git push -u origin main
if errorlevel 1 goto erro
git subtree split --prefix app -b gh-pages
if errorlevel 1 goto erro
git push -f origin gh-pages
if errorlevel 1 goto erro

echo [4/4] Ativando o site...
gh api repos/%REPO%/pages >nul 2>&1
if not errorlevel 1 goto ativo
gh api -X POST repos/%REPO%/pages -f "source[branch]=gh-pages" -f "source[path]=/" >nul
if errorlevel 1 goto erro
:ativo
echo.
echo PRONTO. Em alguns minutos o app abre em:
echo https://paulowolf22.github.io/tutory-ping-pong/
echo.
pause
exit /b 0

:erro
echo.
echo Algo falhou. Copie o texto acima e envie no chat.
pause
exit /b 1
