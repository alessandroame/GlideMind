# Rule: Testing Weather Mocking & Rate Limit Guard

## 1. Objective & Critical Mandate
The Open-Meteo live API enforces strict daily request rate limits (HTTP 429 Too Many Requests). When testing UI components, Logbook, 3D Replay, Hangar, Driver.js tours, Settings, Themes, or any other feature not explicitly validating Open-Meteo request schemas, the agent and automated test scripts MUST NOT perform live network requests to Open-Meteo.

## 2. Mocking Protocol During Testing
1. **Automated Headless & Crawler Tests (`scripts/*.js`)**:
   - All visual and interactive crawler test scripts must boot the application with mock weather enabled (via `http://localhost:3000/?mock_weather=1` or `localStorage.setItem('glidemind_mock_weather', 'true')`).
2. **Deterministic Offline Fixtures**:
   - `core/openMeteoApi.js` provides `generateMockWeatherPayload(lat, lng, targetDate)` that returns a comprehensive, valid hourly weather dataset covering all required parameters (wind speed at all levels, CAPE, boundary layer, pressure, temperature, dew point, cloud cover, and solar radiation).
3. **Selective Live Testing**:
   - Live API calls to `api.open-meteo.com` are permitted ONLY during dedicated unit tests or integration tests whose sole explicit purpose is to verify API contract schemas and network parsing.
