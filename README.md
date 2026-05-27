# StoreDesk POS - Supermarket Billing Software

Production-oriented supermarket billing, inventory, and POS system built with React, Express, MongoDB, and Electron.

## Features

- JWT login with admin, manager, and cashier roles
- Dashboard with total sales, today sales, product count, low stock alerts, revenue chart, and recent transactions
- Product, category, customer, supplier, staff, settings, and backup management
- Fast POS billing with product search, cart quantity controls, discounts, GST, cash/UPI/card payment, invoice history, and stock deduction
- Thermal invoice preview and print support in browser and Electron
- Inventory logs, manual stock adjustment, supplier purchase stock-in entries
- Sales, profit/loss, product analytics, PDF export, and Excel export
- Dark/light mode, responsive layout, toast notifications, loading-safe API flows
- Windows desktop packaging with Electron and NSIS installer

## Project Structure

```text
client/     React + Vite + Tailwind web app
server/     Node.js + Express + MongoDB REST API
electron/   Desktop wrapper, print bridge, Windows installer config
```

## Local Setup

1. Install dependencies:

```bash
npm install
npm run install:all
```

2. Create environment files:

```bash
copy server\.env.example server\.env
copy client\.env.example client\.env
```

3. Start MongoDB locally or set `MONGO_URI` to MongoDB Atlas in `server/.env`.

4. Seed the first admin and sample products:

```bash
npm run seed
```

Default login:

```text
admin@store.com
Admin@12345
```

5. Start the web app and API:

```bash
npm run dev
```

Frontend: `http://localhost:5173`  
Backend: `http://localhost:5000/api`

## Desktop App

Run Electron in development:

```bash
npm run dev:desktop
```

Build the Windows installer:

```bash
npm run dist:win
```

The installer is created at:

```text
electron/release/StoreDesk POS Setup 1.0.0.exe
```

The installed desktop app starts the bundled Express backend automatically. It still needs MongoDB access:

- Local/offline mode: install MongoDB Community Server on the target PC and keep the MongoDB service running.
- Cloud mode: create `%APPDATA%\StoreDesk POS\server.env` on the target PC with `MONGO_URI=<MongoDB Atlas URI>` and `JWT_SECRET=<long random secret>` before opening the app.

If no `server.env` exists, the app uses:

```text
mongodb://127.0.0.1:27017/supermarket_billing
```

The generated installer is unsigned for local builds. Windows may show a SmartScreen warning until you sign it with a code-signing certificate.

## Deployment

### Backend on Render/Railway

- Root directory: `server`
- Build command: `npm install`
- Start command: `npm start`
- Environment variables:
  - `NODE_ENV=production`
  - `PORT=5000`
  - `MONGO_URI=<MongoDB Atlas connection string>`
  - `JWT_SECRET=<long random secret>`
  - `JWT_EXPIRES_IN=7d`
  - `CLIENT_URL=<deployed frontend URL>`

### Frontend on Vercel/Netlify

- Root directory: `client`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable:
  - `VITE_API_URL=<deployed backend URL>/api`

## API Modules

- `POST /api/auth/login`
- `GET /api/dashboard`
- `/api/products`
- `/api/categories`
- `/api/sales`
- `/api/customers`
- `/api/suppliers`
- `/api/purchases`
- `/api/inventory/logs`
- `/api/reports/*`
- `/api/settings`
- `/api/users`
- `/api/backup`

All business routes are JWT protected. Admin-only endpoints include staff management, backups, and destructive operations.

## Production Notes

- Change `JWT_SECRET` before deployment.
- Use MongoDB Atlas for hosted mode.
- Use a local MongoDB service and local API URL for offline desktop deployments.
- Configure the thermal printer as the default Windows printer, or extend `electron/main.cjs` to select `printerName` from settings.
- Replace the generated icon in `electron/assets/icon.ico` with a final brand icon before public release.
