# Flight Search Agent: CDMX → Budapest (Julio 2027)

## Search Parameters

### Outbound Flight (IDA)
- **Origin:** MEX (Ciudad de México)
- **Destination:** BUD (Budapest Ferenc Liszt)
- **Target arrival dates (priority order):**
  1. Saturday July 3, 2027 (preferred)
  2. Sunday July 4, 2027 — early arrival only (before 14:00 local), no overnight/late arrivals
  3. Any arrival before July 5, 2027
- **Departure flexibility:** Consider departures from June 29 onwards if needed for better prices or connections
- **Cabin class:** Economy AND Premium Economy

### Return Flight (VUELTA)
- **Origin:** BUD (Budapest)
- **Destination:** MEX (Ciudad de México)
- **Target date:** July 24, 2027
- **Flexibility:** ±3 days (July 21–27, 2027)
- **Cabin class:** Economy AND Premium Economy

### Preferences
- **Priority:** Lowest price first
- **Connections:** Acceptable with reasonable layovers (Mexico City, European hubs: Frankfurt, Munich, Amsterdam, Istanbul, Madrid, Paris, London)
- **Airlines of interest:** Turkish Airlines, Lufthansa, KLM, Air France, Iberia, Aeromexico, British Airways
- **NOT interested in:** Luxury/business class, ultra-long layovers (>6 hours)

## Price Baseline (as of September 2026)
- **Economy round-trip:** ~$945–$1,465 USD (MXN $18,200–$28,000)
- **Premium Economy:** TBD (typically 30-60% more than economy on this route)
- **Cheapest carriers historically:** Lufthansa (~MXN $19,523), KLM (~MXN $20,328)
- **Peak season (July):** Prices tend to be higher than average

## Notification Triggers
Notify the user when:
1. Economy round-trip drops below $1,000 USD
2. Premium Economy is available and the price difference vs Economy is <25%
3. Any significant price drop (>15% below previous search)
4. A new low price is found on any platform
5. Premium Economy price is close to Economy (worth upgrading)

## Price History Log
Track each daily search result below.

---

### Search Log

#### 2026-09-21 (Initial Search)
- **Sources checked:** Google Flights, Skyscanner, Expedia, Trip.com, Kayak, Despegar, BestDay
- **Economy RT baseline:** ~$945–$1,465 USD
- **Best economy prices found:**
  - Skyscanner: from $469 one-way / $948 RT
  - Trip.com: from $494 one-way
  - Expedia: from $527 one-way / $945 RT
  - Despegar: from MXN $22,750 (~$1,137 USD)
  - BestDay: from MXN $19,991 (~$999 USD)
  - Google Flights (Turkish Airlines): MXN $18,202 RT (~$910 USD)
- **Premium Economy:** Not yet available for July 2027 dates
- **Key carriers:** Lufthansa (60 connections/week via FRA/MUC), KLM (14/week via AMS), Turkish Airlines (via IST)
- **Notes:** July 2027 dates may not be fully loaded on all platforms yet. Best current reference price is ~$910-$1,000 USD RT economy. Munich and Amsterdam are top layover cities.
- **Status:** BASELINE ESTABLISHED. Prices appear normal for this route/season.
