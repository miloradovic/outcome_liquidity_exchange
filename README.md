# Outcome Liquidity Exchange (V1 Baseline)

This repository contains the code for the Outcome Liquidity Exchange (OLX) V1 Baseline implementation. The OLX is a decentralized exchange for trading outcome tokens, which represent the outcomes of events. This implementation serves as a baseline for future development and improvements.

## Prerequisites

- Node.js 24
- npm 11.12
- Docker

## V1 API Surface

Auth:
- POST /api/auth/register
- POST /api/auth/login
- GET /api/me

Wallet:
- GET /api/wallet
- GET /api/wallet/entries
- POST /api/wallet/deposit

Markets:
- GET /api/markets
- GET /api/markets/:marketId
- GET /api/markets/:marketId/order-book

Orders:
- POST /api/orders
- DELETE /api/orders/:orderId
- GET /api/orders/me
