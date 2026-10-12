@echo off
cd /d "%~dp0"
if not exist flight-results mkdir flight-results
echo ==== %date% %time% ==== >> flight-results\run.log
node search-flights.js >> flight-results\run.log 2>&1
