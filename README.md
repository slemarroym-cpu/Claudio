# Flight Search Agent: CDMX → Budapest (Julio 2027)

Agente que busca vuelos redondos MEX → BUD en Google Flights usando Playwright.

## Requisitos

- Node.js 18+ ([descargar](https://nodejs.org))
- ~500 MB de disco para Chromium

## Instalación (una sola vez)

```bash
git clone https://github.com/slemarroym-cpu/Claudio.git
cd Claudio
npm install
npx playwright install chromium
```

## Uso

### Búsqueda manual
```bash
node search-flights.js
```

### Ejecución diaria automática (cron)

**macOS/Linux:**
```bash
# Abrir editor de cron
crontab -e

# Agregar esta línea (corre a las 9:00 AM diario):
0 9 * * * cd /ruta/a/Claudio && node search-flights.js >> flight-results/cron.log 2>&1
```

**Windows (Task Scheduler):**
1. Abrir Task Scheduler
2. Create Basic Task → "Flight Search"
3. Trigger: Daily a las 9:00 AM
4. Action: Start Program → `node` con argumento `C:\ruta\a\Claudio\search-flights.js`

## Resultados

Cada ejecución genera en `./flight-results/<fecha>/`:
- `report.txt` — Reporte legible con precios y comparación Economy vs Premium Economy
- `raw-data.json` — Datos crudos para análisis
- `*.png` — Screenshots de Google Flights por cada búsqueda

El historial de precios se acumula en `./flight-results/price-history.json`.

## Parámetros de búsqueda

Edita la sección `CONFIG` en `search-flights.js`:
- **Fechas de ida:** Jun 30, Jul 1, 2, 3 de 2027
- **Fechas de vuelta:** Jul 21, 24, 27 de 2027
- **Clases:** Economy + Premium Economy (para la búsqueda principal)
- **Moneda:** USD

## Alertas automáticas

El script imprime alertas cuando:
- Economy baja de $800 USD
- Premium Economy está a <25% de diferencia vs Economy
- El precio cae >15% respecto a la búsqueda anterior
