# 🦅 GlideMind - Free Flight Intelligence

**GlideMind** is a weather assessment and flight logbook PWA designed for paragliding and hang gliding pilots.

It is born from the evolution of the **ParaMeteo** engine, redesigning the user interface to provide a clean, high-contrast, touch-first experience optimized for outdoor mobile use.

---

## 📖 Master Architecture Plan
The full architectural and operational blueprint is documented in:
👉 **[MASTER_PLAN.md](./MASTER_PLAN.md)**

---

## 🏛️ Core Principles
1. **Decoupled Headless Core**: Pure mathematical and domain algorithms in `core/` with zero DOM dependencies and 100% test coverage.
2. **Outdoor Ergonomics (Touch HMI)**: Minimum 44px touch targets, dynamic `100dvh` mobile viewport, single-row carousels, zero trapped modals.
3. **Safety Parameters at a Glance**: Direct assessment of takeoff flyability, hourly wind evolution, turbulence levels, and thermal ceiling.
4. **Offline First (PWA)**: Standalone installation on iOS and Android with IndexedDB storage for flight tracks and local weather caching.

---

## 🚀 Development Quickstart

```bash
# Serve locally
npm run dev
# Run core test suite
npm test
```
