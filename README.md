# Panacea

link to website

## Frontend (React)

The UI lives in **`frontend/`** — **Vite** + **React** + **TypeScript**. HTML entry: [`frontend/index.html`](frontend/index.html); React mounts on `#root` via [`frontend/src/main.tsx`](frontend/src/main.tsx).

### Run locally

```bash
cd frontend
npm install
npm run dev
```

Then open the URL Vite prints (usually **http://localhost:5173**).

### Production build

```bash
cd frontend
npm run build
```

Static files are written to **`frontend/dist/`** — serve with any static host or put behind nginx/caddy.
