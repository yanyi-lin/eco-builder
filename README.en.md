# eco-builder: AI-Assisted Ecological Model Builder

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![CI](https://github.com/yanyi-lin/eco-builder/actions/workflows/ci.yml/badge.svg)](https://github.com/yanyi-lin/eco-builder/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=nodedotjs&logoColor=white)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)](tsconfig.json)

English | [中文](README.md)

An interactive ecological simulation tool **assisted by AI agents**: build, simulate, and analyze arbitrary ecological models using **natural language**. Supports a bilingual interface (Chinese / English).

- **AI-Assisted**
- Based on the **Lotka-Volterra mathematical model**
- **Data-driven** by GBIF & GloBI

## Table of Contents

- [Features](#features)
- [Deployment](#deployment)
- [Environment Variables](#environment-variables)
- [AI Agent and Tools](#ai-agent-and-tools)
- [Core Model Equations](#core-model-equations)
- [File Structure](#file-structure)
- [Testing](#testing)
- [Dependencies](#dependencies)

---

## Features

### Simulation Mode
- **Dynamic Population Density Chart**: Based on Chart.js, dynamically displaying population density changes.
- **Dual Y-Axes Chart**: Used to clearly display populations with vast density differences in the ecosystem (e.g., hagfish and chemoautotrophic bacteria in a whale fall system).
- **Interactive Control**: Start / Pause / Reset simulation.
- **Ecological Disturbance Experiments**: One-click reduction of any population by 10% / 30% / 50% to observe system resilience.

### Build Mode (AI-Guided)
- **Natural Language Construction**: Just say "build a forest ecosystem" or "build a Paramecium competition culture medium", and the AI agent will automatically search data, add components, set relationships, and run simulations.
- **Multi-Relationship Support**: Predation, competition, and mutualism.
- **Data-Driven**: GBIF query for scientific names (Latin names), GloBI query for species interactions.
- **Automated Feasibility Verification**: Automatically executes a "Check → Modify → Recheck" loop after building. The program can distinguish parametric extinction (where the agent sets wrong parameters) from structural inevitable extinction (where the system is ecologically bound to collapse):
  - **Parametric Extinction** (e.g., excessive predation) -> Auto-parameter tuning and repair (`adjusted`).
  - **Structural Inevitable Extinction** (e.g., whale fall: no producer) -> The agent points it out but allows running. Observing a collapsing system and studying ecological steady-states both carry immense educational value.
  - **Ecological Pyramid Constraint**: Predator populations should not exceed prey populations, automatically corrected.
- **Competition & Resource Depletion Modeling**: Supports Gause's competitive exclusion experiments (limited culture medium depletion -> both go to zero).
- **Unlimited Components** (Soft guardrail of 20) to build large food webs.

### Bilingual Support
- Language switch button in the top-right corner (Chinese / EN). The entire UI (including chart axes, modals, buttons) updates instantly and persists in local storage.
- AI response language automatically follows user input (falls back to interface language if undetected); tool outputs are summarized by the agent.

---

## Deployment

The project consists of two parts: **frontend** (static assets built by Vite) and **Node.js backend** (agentic `/api/chat` + static file service). The backend serves static resources natively, so only **one process** is needed to run the entire application in production. The same codebase supports 4 deployment methods (Hono dual-runtime architecture).

### Method 1: Local Development (WSL / Any Linux)

```bash
npm install
cp .env.example .env        # Fill in OPENAI_API_KEY
npm run dev:server          # Terminal 1: Backend http://localhost:3000
npm run dev                 # Terminal 2: Frontend http://localhost:5173 (with /api auto-proxied to 3000)
```

### Method 2: Pagoda Panel (bt.cn) Deployment (Recommended for Non-developers)

> Prerequisites: Pagoda Panel **11.0+**, software store with **Node.js Version Manager** (2.7+) installed.

1. **Install Node**: App Store -> Node.js Version Manager -> Install **Node 20 or 22 LTS** -> Click "Set CLI version" to select it (if the version list is incomplete, click "Update Version List" first).
2. **Upload Code**: Upload the project to the website directory (default `/www/wwwroot/eco-builder`), or pull via Pagoda's Git feature.
3. **Build**: Run `npm install && npm run build` in the project directory (or in the panel terminal).
4. **Add Node Project**: Websites -> Node Projects -> Add Project: select the project root directory, startup mode: select **Custom ecosystem.config.cjs**, port **3000**, run user **www**, select the Node version 20/22.
   - **Note**: The `name` in `ecosystem.config.cjs` must **match the project name in the panel exactly**, otherwise the panel will show "Not Running".
   - **Note**: Write environment variables (`OPENAI_API_KEY`, etc.) in the `env` section of `ecosystem.config.cjs` (or in the "Environment Variables" tab of the panel); **do not use `env_production`** (Pagoda does not inject it when executing pm2).
5. **Reverse Proxy**: Websites -> Add Site (fill in domain) -> Settings -> Reverse Proxy -> Set Target URL to `http://127.0.0.1:3000`.
6. **Firewall**: Only open ports **80/443** in the security group (keep 3000 local, do not expose it).
7. **Boot Autostart** (Crucial): Pagoda -> Cron -> Shell Script -> select execution cycle as "On Boot", script content:
   `/bin/bash /www/server/nodejs/vhost/scripts/{project_name}.sh &` (after deployment, **test a server restart** to ensure auto-recovery).
8. **HTTPS** (Optional): Website -> SSL -> Apply for a free Let's Encrypt certificate and enable with one click.

### Method 3: Docker (Alternative, SSH access required)

```bash
# Build image (see Dockerfile in root)
docker build -t eco-builder .
# Run (replace with actual environment variables)
docker run -d --name eco-builder -p 3000:3000 \
  -e OPENAI_API_KEY=sk-xxx -e OPENAI_BASE_URL=https://api.deepseek.com \
  -e OPENAI_MODEL=deepseek-v4-flash eco-builder
# Reverse proxy 127.0.0.1:3000 using Pagoda/Nginx (or Pagoda 9.3.0+ Container Reverse Proxy)
```

### Method 4: Cloudflare Workers (Same Code, Custom Domain)

> Architecture: Shared Hono app (`server/app.ts`) with dual-runtime — Node entry point for Pagoda/Docker, Worker entry point (`worker/index.ts`) for CF Workers. Static assets are served via CF's native Static Assets service; Worker only processes `/api/*`.

```bash
npm install
npm run build                    # Generates dist/ (assets) and dist-server/
cp .dev.vars.example .dev.vars   # Local development environment (ignored in git)
npx wrangler dev                 # Local dry-run http://localhost:8787

# Production Deployment
npx wrangler secret put OPENAI_API_KEY   # Or panel Settings → Variables and Secrets
npx wrangler deploy                       # Configure routing in CF dashboard after binding a custom domain
```

- **Environment Variables**: `OPENAI_BASE_URL` / `OPENAI_MODEL` / `BUILD_MAX_STEPS` should be set in the `vars` section of `wrangler.jsonc` (plaintext); `OPENAI_API_KEY` must be configured as a **Secret** (encrypted, strongly validated by `secrets.required` during deploy).
- **Step Limits**: The Cloudflare free tier restricts requests to 50 subrequests. `BUILD_MAX_STEPS` defaults to 60 (Pagoda is unrestricted); CF deployment has it set to **40** in `wrangler.jsonc` to avoid hit limits. Pagoda uses default 60 if unset.
- **Rate Limiting**: The 20k daily request limit is managed via in-process memory. Under CF Workers multiple isolates environment, this is a **per-isolate approximate value** (not globally accurate), which is acceptable for educational usage; for precise global counts, Durable Objects would be required (available in historical git versions if needed).

### LLM Selection

- Recommended: `deepseek-v4-flash` (system prompts were optimized for this model during development).
- Recommend LLMs with strong multilingual support.
- Extremely powerful models (e.g., `kimi-k3`, `deepseek-v4-pro`, `qwen-3.8max`, `glm-5.3`) are not recommended (slower token throughput, prone to over-complicating outputs).
- Ultra-fast LLMs (e.g., `stepfun-3.7-flash`) are not recommended (risk of lag, related optimizations are not planned).

---

## Environment Variables

| Variable | Description | Example |
| -------------------- | ------------------------------------------------ | -------------------------- |
| `OPENAI_BASE_URL` | OpenAI-compatible API base URL (automatically appends `/chat/completions`) | `https://api.deepseek.com` |
| `OPENAI_MODEL` | Model Name | `deepseek-v4-flash` |
| `OPENAI_API_KEY` | API Key (secret, do not commit to repository) | `sk-...` |
| `PORT` | Node service listening port (default: 3000; not needed for CF) | `3000` |
| `BUILD_MAX_STEPS` | Maximum steps per round in build mode (default: 60; recommended: 40 for CF) | `40` |
| `SIMULATE_MAX_STEPS` | Maximum steps per round in simulation mode (default: 20) | `20` |

- **Local Development**: Copy `.env.example` to `.env` and fill it in (`.env` is ignored by git).
- **Pagoda Panel**: Put in `ecosystem.config.cjs` under `env` (or Panel "Environment Variables").
- **CF Workers**: `vars` (plaintext) + `secrets` (`OPENAI_API_KEY`), local uses `.dev.vars`.
- Compatible with any OpenAI Chat Completions compatible endpoint (DeepSeek, official OpenAI, third-party gateways, Ollama), powered by `@ai-sdk/openai-compatible`.

---

## AI Agent and Tools

The AI Agent is implemented based on the **Vercel AI SDK** (`ai` + `@ai-sdk/react`): Node backend (`server/`) declares tool schemas and calls OpenAI-compatible APIs with streaming responses. The tool execution directly mutates the state of the simulator/builder on the client-side (`onToolCall`), with `sendAutomaticallyWhen` to automatically run subsequent LLM turns (proceeds immediately after client-side tool execution finishes).

### Simulation Mode Tools

| Tool | Function |
| ----------------------------- | ----------------------------- |
| `read-animal-data` | Read species list, quantities, relations, and running status. |
| `animal-population-set` | Update species quantities (partial update). **Must call read first.** |
| `start` / `pause` / `restart` | Start / Pause / Reset simulation. |

### Build Mode Tools

| Tool | Function |
| -------------------- | ----------------------------------------------------- |
| `search-species` | Search species taxonomic info (Latin name, confidence) from GBIF. |
| `query-interactions` | Query species interactions from GloBI (only returns records involving both). |
| `add-species` | Add species (id, name, initial quantity, hasLogistic, growthRate, carryingCapacity, deathRate). |
| `add-relation` | Add relation (predation, competition, mutualism); coefficient is auto-generated. |
| `get-current-model` | Inspect the current model being constructed. |
| `build-model` | Compile the model (generates EcoModelSpec). |
| `run-model` | Compile and run the model (performs feasibility checks and switches to simulation mode). |

### Build Constraints
- **Only build species explicitly requested by the user**, never add extra species arbitrarily (unless requested).
- **Limited resources** like culture/nutrient solutions are represented using competition relationships rather than independent self-growing species.

---

## Core Model Equations

The general differential equations are dynamically generated by `src/eco/derivatives.ts` based on `EcoModelSpec`:

| Relation | Differential Term | Description |
| ----------------- | ------------------------------------ | ---------------------- |
| Self-growth (logistic) | `+ r · N · (1 - N / K)` | Producer / Self-growing species |
| Natural Death | `- d · N` | Species natural death rate |
| Predation (prey → predator) | `prey: -a · P · H`; `predator: +e · a · P · H` | Predation rate `a`, Conversion efficiency `e` |
| Top Predator Death | `- m · H` | Additional death rate for top predators |
| Competition | `- α · N1 · N2` | Mutual suppression |
| Mutualism (with saturation) | `+ β · N1 · N2 / (1 + h · N1 · N2)` | Holling Type II saturation to prevent divergence |

The simulation uses **Euler's Method** for numerical integration (step size `dt = 0.045`), retaining the latest 900 steps in the data window.

---

## File Structure

```
.
├── index.html                    # Vite Entry (local vendor assets)
├── package.json / vite.config.ts / tsconfig*.json
├── wrangler.jsonc                # Cloudflare Workers configuration
├── .env.example / .dev.vars.example  # Env templates
├── src/
│   ├── main.tsx / App.tsx        # App entry + Mode switcher
│   ├── i18n/                     # Bilingual support (LanguageProvider / Translations)
│   ├── eco/                      # Ecological simulation core (pure TS, framework agnostic)
│   │   ├── types.ts              # SpeciesDef / RelationDef / EcoModelSpec
│   │   ├── derivatives.ts        # Dynamically generate dN/dt from spec (delegated to computeStep)
│   │   ├── computeStep.ts        # Shared single-step integration (used by derivatives & feasibility)
│   │   ├── models/               # Built-in model specs (lotkaVolterra3)
│   │   ├── useEcoSimulation.ts   # Simulation state-machine hook
│   │   ├── useEcoChart.ts        # Chart.js hook (dynamic dataset + dual Y-axes)
│   │   ├── useEcoBuilder.ts      # Builder state management
│   │   └── constants.ts
│   ├── tools/
│   │   ├── builderTools.ts       # Build tools executor (buildModel, add-species, etc.)
│   │   ├── feasibility.ts        # Numerical feasibility checks (two-stage repair loop)
│   │   └── ecoTools.ts           # Simulation tools executor
│   ├── components/               # UI components (ChartPanel, BuilderPanel, EcoTuner, Agent drawer, etc.)
│   └── styles.css
├── server/                       # Shared backend (Hono, Node + CF Workers dual-runtime)
│   ├── app.ts                    # Shared Hono app (/api/chat + security headers + rate-limiting, runtime-agnostic)
│   ├── chat.ts                   # streamText chat handler (env injection + step limits)
│   ├── prompts.ts                # Simulation/Build mode system prompts
│   ├── tools.ts                  # 12 Agent tools schemas (executed client-side)
│   ├── mode.ts                   # [MODE: build] prefix detection (pure function)
│   ├── rateLimit.ts              # Daily request rate-limiting (in-memory)
│   └── index.ts                  # Node entry (dotenv + static + SPA fallback + serve)
├── worker/
│   └── index.ts                  # CF Workers entry (export default fetch, zero Node-builtins)
├── ecosystem.config.cjs          # Pagoda PM2 deployment configuration
├── wrangler.jsonc                # Cloudflare Workers deployment configuration (assets + vars + secrets)
├── scripts/verify-feasibility.ts # Numerical feasibility regression tests
└── data/raw/                     # Prefetched ecological data cache
```

---

## Testing

```bash
npm run typecheck            # TypeScript type checking (Frontend + server + worker)
npm test                     # vitest unit/integration tests (104 tests: eco-core, tools, protocol, bilingual, frontend)
npm run verify:feasibility   # Numerical feasibility regression tests (whale fall, lv3, resource depletion, mutualism, etc.)
```

---

## Dependencies

- [Chart.js](https://www.chartjs.org/) v4 – Dynamic line charts (local vendor)
- [marked](https://marked.js.org/) + [DOMPurify](https://github.com/cure53/DOMPurify) – AI markdown rendering and sanitization (local vendor)
- [React](https://react.dev/) 19 + [Vite](https://vitejs.dev/) 6 – Frontend library and bundler
- [Vercel AI SDK](https://ai-sdk.dev/) (`ai` / `@ai-sdk/react` / `@ai-sdk/openai-compatible`) – AI chat (Node-side streaming + client-side tool execution)
- [Hono](https://hono.dev/) 4 – Cross-runtime web framework (shared app between Node and CF Workers)
- [@hono/node-server](https://www.npmjs.com/package/@hono/node-server) – Node adapter for Hono (Pagoda/pm2)
- [zod](https://zod.dev/) – Tool schema validation

---
