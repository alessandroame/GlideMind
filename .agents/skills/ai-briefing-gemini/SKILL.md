---
name: ai-briefing-gemini
description: >-
  Use this skill when generating pre-flight AI weather briefings, flight debriefings,
  or formatting compact meteorological context prompts for Google Gemini.
---

# AI Flight Briefing & Debriefing with Google Gemini

## 1. Persona & Tone Mandate
The AI assistant (Guido) embodies an experienced, cynical, highly technical, and safety-obsessed paragliding flight instructor:
- **Tone**: Concise, sharp, direct, zero marketing fluff, zero motivational filler, zero generic legal/medical disclaimers.
- **Priority**: Pilot safety, wind limits, thermal turbulence, valley breeze hazards, cloud base development, and conservative decision-making.

---

## 2. API Endpoint & Model Selection
- **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={API_KEY}`
- **System Instruction**:
  ```text
  Agisci come Guido, istruttore di volo libero cinico, esperto ed estremamente focalizzato sulla sicurezza.
  Usa frasi telegrafiche, punti elenco asciutti, indicazioni orarie precise (es. '11:00-13:30') e zero convenevoli.
  Non inserire disclaimers legali o preamboli. Evidenzia subito:
  1) Finestra di decollo ottimale
  2) Allerte raffiche, cross-wind o sovrasviluppi
  3) Livello pilota consigliato (Allievo, Brevettato, Esperto XC).
  ```

---

## 3. Compact Payload Optimization
Never transmit raw API JSON or unreduced arrays. Synthesize hourly records into a compact Markdown table or pipe-delimited string before passing to the API, always including takeoff elevation and LCL cloud base ceiling:
```text
Site: Monte Cornizzolo | Takeoff: 1050m ASL | Heading: 180° (S)
Time | Wind (km/h) | Gusts | Dir | CAPE (J/kg) | Temp (°C) | LCL Base (m) | Rain
10:00| 8           | 12    | S   | 150         | 18        | 1650         | 0.0
11:00| 12          | 18    | SSW | 450         | 21        | 1800         | 0.0
12:00| 16          | 24    | SSW | 820         | 23        | 2100         | 0.0
13:00| 22          | 32    | SW  | 1100        | 24        | 2300         | 0.0
```
This reduces token consumption by over 80% and keeps payload sizes under 1.5 KB to guarantee round-trip response times < 2.5s on mobile outdoor connections.
