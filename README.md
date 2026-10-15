# EuroSol Solar CRM

A React frontend for managing the complete solar installation business workflow — leads, site surveys, quotations, installations, inventory, payments, service requests, and more.

## Architecture

This repository contains the **frontend only**. It communicates with a live NestJS/Prisma/PostgreSQL backend at `https://api.eurosolservice.com/v1`.

| Layer | Stack |
|-------|-------|
| Frontend | React 19, Vite 6, TypeScript 5.8, Tailwind CSS 4, shadcn/ui |
| Backend | NestJS, Prisma, PostgreSQL (separate repository) |
| Auth | JWT + refresh tokens, role-based access control |
| Monitoring | Sentry (browser tracing, replays) |

## Getting Started

**Prerequisites:** Node.js 20+

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL` if your backend runs on a different origin.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | TypeScript type-check (`tsc --noEmit`) |
| `npm test` | Run unit tests (vitest) |

## Modules

Dashboard, Lead Management, Quotation/Proposal, Site Survey, Installation Tracking, Inventory, Payments & Revenue, Service & AMC, Employee Management, Regions, Admin Panel, Feedback, Blog, Tasks & Calendar, Warranty & Referrals, Growth Analytics.

## CI

GitHub Actions runs lint, tests, build, and security audit on every push and PR.
