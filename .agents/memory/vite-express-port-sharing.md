---
name: Express and Vite port sharing
description: A dev-server constraint for single-origin Express plus Vite middleware applications.
---

When Express owns the application port and Vite runs in middleware mode, do not configure Vite HMR to bind that same port separately.

**Why:** A conflicting HMR socket listener can intercept ordinary HTTP requests and make the Replit preview return `426 Upgrade Required` even though the Node process appears healthy.

**How to apply:** Let middleware-mode Vite use its default HMR behavior, or provide a deliberately separate HMR transport only when the workflow and proxy are configured for it.