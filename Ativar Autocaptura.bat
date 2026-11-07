@echo off
start "" chrome.exe "chrome-extension://leoedomaajljpnlaibklpbelclbjaafl/ativar.html"
if errorlevel 1 (
  echo O Google Chrome nao foi encontrado.
  pause
)
