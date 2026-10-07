---
name: open-meteo-integration
description: >-
  Use this skill when querying Open-Meteo weather APIs, implementing aerological
  sounding calculations (Magnus-Tetens, LCL, lapse rate), or managing meteorological cache.
---

# Open-Meteo Integration & Aeronautical Sounding Ingestion

## 1. API Endpoints & Request Protocol
Open-Meteo provides high-resolution global numerical weather prediction data without mandatory API keys:
- **Base URL**: `https://api.open-meteo.com/v1/forecast`
- **Standard Parameters**:
  - `timezone=auto`
  - `format=json`
  - `hourly=temperature_2m,dewpoint_2m,pressure_msl,cloudcover_low,cloudcover_mid,cloudcover_high,windspeed_10m,winddirection_10m,windgusts_10m,cape,precipitation,surface_pressure`
- **Atmospheric Pressure Levels (Sounding / Skew-T)**:
  - `hourly=temperature_1000hPa,temperature_925hPa,temperature_850hPa,temperature_700hPa,temperature_500hPa`
  - `relativehumidity_1000hPa,relativehumidity_925hPa,relativehumidity_850hPa,relativehumidity_700hPa,relativehumidity_500hPa`
  - `windspeed_1000hPa,windspeed_925hPa,windspeed_850hPa,windspeed_700hPa,windspeed_500hPa`
  - `geopotential_height_1000hPa,geopotential_height_925hPa,geopotential_height_850hPa,geopotential_height_700hPa,geopotential_height_500hPa`

---

## 2. Caching Policy and LocalStorage Architecture
1. **Cache TTL (Time To Live)**:
   - Minimum **15-30 minutes** for identical coordinates $(\text{lat}, \text{lon})$ and forecast date.
   - For past days or completed flights, data can be permanently stored in `IndexedDB`.
2. **Key Format**:
   `glidemind_cache_weather_<lat.toFixed(4)>_<lon.toFixed(4)>_<YYYY-MM-DD>`
3. **Rate Limits & IP Quota Guards**:
   - Free tier quotas: $\le 10,000$ calls/day, $\le 5,000$ calls/hour, $\le 600$ calls/minute per client IP.
   - Exponential backoff with jitter must trigger on HTTP 429.
   - In automated test environments or crawler scripts, live network calls are blocked via mock flag (`?mock_weather=1` or `glidemind_mock_weather`).

---

## 3. Client-Side Aerological Calculations
To avoid fetching excessive variables over the network, GlideMind computes these thermodynamic metrics in pure client-side JavaScript:

1. **Magnus-Tetens Dew Point ($T_d$)**:
   $$\gamma(T, RH) = \frac{17.27 \cdot T}{237.7 + T} + \ln\left(\frac{RH}{100}\right)$$
   $$T_d = \frac{237.7 \cdot \gamma(T, RH)}{17.27 - \gamma(T, RH)}$$

2. **Cumulus Lifted Condensation Level ($H_{\text{LCL}}$ - Cloud Base)**:
   $$H_{\text{LCL}} \approx H_{\text{ground}} + 125 \cdot (T_{2m} - T_{d,2m})\quad [\text{meters}]$$

3. **Environmental Lapse Rate ($\Gamma$)**:
   $$\Gamma = -\frac{T_2 - T_1}{z_2 - z_1}\quad [^\circ\text{C} / 100\text{m}]$$
   - $\Gamma > 1.0^\circ\text{C}/100\text{m}$: Super-adiabatic / Unstable (strong lift / turbulence).
   - $\Gamma \in [0.65, 0.98]^\circ\text{C}/100\text{m}$: Conditionally unstable (standard thermal soaring).
   - $\Gamma < 0.65^\circ\text{C}/100\text{m}$: Stable / Inversion layer (ceiling limit).
