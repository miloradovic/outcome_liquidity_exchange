# Outcome Liquidity Exchange (V1 Baseline)

This repository contains the code for the Outcome Liquidity Exchange (OLX) V1 Baseline implementation. The OLX is a decentralized exchange for trading outcome tokens, which represent the outcomes of events. This implementation serves as a baseline for future development and improvements.

## Prerequisites

- Node.js 22
- npm 10
- Docker Desktop

## Local Development

1. Copy environment defaults:

   ```bash
   cp .env.example .env
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the app locally:

   ```bash
   npm run start:dev
   ```

4. Verify health:

   ```bash
   curl http://localhost:3000/api/health
   ```
