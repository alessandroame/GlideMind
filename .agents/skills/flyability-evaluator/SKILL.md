---
name: flyability-evaluator
description: >-
  Use this skill when evaluating, implementing, or testing hourly paragliding flyability,
  launch safety indices, wind limits, or takeoff directional alignment.
---

# Flyability Evaluator Algorithm Specification

## 1. Context & Method
The flyability index determines whether a given hour is safe and flyable for paragliding pilots.
The algorithm evaluates individual risk factors (precipitation, sustained wind, gusts, convective CAPE, mechanical/thermal turbulence, takeoff alignment) using a worst-case severity evaluation with prioritized tie-breaking:
$$\text{Lee Rotor Risk (50)} > \text{Precipitation (40)} > \text{Sustained Wind / Gusts (30)} > \text{Turbulence (20)} > \text{CAPE Overdevelopment (10)}$$

---

## 2. Priority Waterfall Conditions

| Order | Status | Color Code | Condition Trigger | Flight Implication |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **NO FLY** | Blue (`#3b82f6`) | `precipitation > 0.1` mm | Rain or convective showers. Paraglider fabric becomes wet, heavy, risking deep stall. |
| **2** | **NO FLY** | Red (`#ef4444`) | `windspeed_10m > 25` km/h | Sustained wind exceeding glider penetration margin. Risk of blow-away behind launch. |
| **3** | **NO FLY** | Red (`#ef4444`) | `windgusts_10m > 35` km/h | Extreme gusts exceeding glider trim speed. |
| **4** | **NO FLY** | Red (`#ef4444`) | `edr > 0.65` | Severe atmospheric turbulence. High collapse probability. |
| **5** | **DANGER** | Red (`#ef4444`) | `cape > 1500` J/kg | Violent convective thermals, severe cumulonimbus (CB) development risk. |
| **6** | **WARNING** | Orange (`#f97316`) | `windspeed_10m > 20` km/h | Strong sustained wind. Demands active bar and reverse launch expertise. |
| **7** | **WARNING** | Orange (`#f97316`) | `windgusts_10m > 25` km/h | Strong gusts. High ground handling demand. |
| **8** | **WARNING** | Orange (`#f97316`) | `edr > 0.42` | Significant thermal/mechanical shear requiring constant active piloting. |
| **9** | **WARNING** | Orange (`#f97316`) | `cape > 900` J/kg | Strong thermal activity with mountain overdevelopment potential. |
| **10** | **DEMANDING** | Yellow (`#eab308`) | `windgusts_10m > 20` km/h | Active breezes requiring focused takeoff approach. |
| **11** | **DEMANDING** | Yellow (`#eab308`) | `edr > 0.22` | Moderate midday mountain air suitable for licensed XC pilots. |
| **12** | **DEMANDING** | Yellow (`#eab308`) | `cape > 600` J/kg | Thermally active atmosphere suitable for XC cross-country. |
| **13** | **GOOD** | Emerald (`#10b981`) | `windspeed_10m > 12` km/h && `windspeed_10m <= 20` km/h | Laminar dynamic ridge soaring conditions. |
| **14** | **CALM_TRAINING** | Teal (`#14b8a6`) | `windspeed_10m <= 8` && `cape < 100` J/kg | Smooth, calm air ideal for student glides and maneuvers training. |
| **15** | **GOOD** | Green (`#22c55e`) | *Fallback* | Balanced standard flyability. |

---

## 3. Atmospheric Turbulence Formulation (Synthetic EDR)
Atmospheric turbulence is quantified on a normalized scale $[0, 1]$ via Eddy Dissipation Rate approximation:
$$\text{EDR} = \min\left(1.0, \frac{0.4 \cdot (G_{10m} - W_{10m}) + \frac{\text{CAPE}}{200} + 0.2 \cdot S_{\text{vertical}}}{25}\right)$$
Where:
- $G_{10m} - W_{10m}$: Peak gust delta in km/h.
- $\text{CAPE}$: Convective Available Potential Energy in J/kg.
- $S_{\text{vertical}}$: Vertical wind shear $|V_{\text{925hPa}} - V_{\text{10m}}|$ in km/h.

---

## 4. Directional Alignment & Lee-Side Rotor Guard
Takeoff heading $\theta_{\text{takeoff}}$ is compared against the wind direction $\theta_{\text{wind}}$:
$$\Delta\theta = \min(|\theta_{\text{takeoff}} - \theta_{\text{wind}}|, 360^\circ - |\theta_{\text{takeoff}} - \theta_{\text{wind}}|)$$

- **In-Axis**: $\Delta\theta \le 30^\circ \implies$ Direct headwind component.
- **Cross-Wind Caution**: $30^\circ < \Delta\theta \le 50^\circ \implies$ Cross-wind limit (forces overall status to at least Yellow DEMANDING).
- **Cross-Wind Limit**: $50^\circ < \Delta\theta \le 90^\circ \implies$ High cross-wind (forces status to Red NO FLY if wind $> 12\text{ km/h}$).
- **Lee-Side Rotor Hazard (Sottovento)**: $\Delta\theta > 90^\circ \implies$ Tail-wind / back-slope rotor. Forces status to **Red NO FLY** whenever wind $> 10\text{ km/h}$ due to deadly lee-side curlover vortices.
