# React + Vite Frontend

Modern React frontend for the Knowledge Graph application with optimistic UI updates.

## Features

- ⚡ **Instant UI updates** - Changes appear immediately (optimistic updates)
- 🔄 **Background sync** - Google Drive sync happens in background
- 🌙 **Dark/Light theme** - Persisted theme preference
- 📱 **Mobile ready** - Responsive design, PWA-ready
- 🎯 **TypeScript** - Full type safety

## Setup

### Prerequisites
- Node.js 18+ and npm
- Backend API running on http://localhost:8000

### Install dependencies
```bash
cd frontend
npm install
```

### Development
```bash
# Start dev server (proxies API to localhost:8000)
npm run dev
```

The frontend runs on http://localhost:3000 and proxies `/api/*` requests to the FastAPI backend.

### Production build
```bash
npm run build
npm run preview
```

## Architecture

```
frontend/
├── src/
│   ├── api/
│   │   └── client.ts       # API client functions
│   ├── components/
│   │   ├── EditModal.tsx   # Edit/Create item modal
│   │   ├── Notification.tsx # Toast notifications
│   │   └── Section.tsx     # Graph section component
│   ├── context/
│   │   └── ThemeContext.tsx # Theme provider
│   ├── hooks/
│   │   └── useGraph.ts     # React Query hooks with optimistic updates
│   ├── pages/
│   │   └── GraphView.tsx   # Main graph view page
│   ├── App.tsx             # Root component with routing
│   ├── App.css             # Styles
│   └── main.tsx            # Entry point
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Key Concepts

### Optimistic Updates
When you edit an item:
1. UI updates **immediately** (no waiting)
2. API call happens in background
3. Google Drive sync happens after API success
4. If API fails, UI reverts to previous state

### How to Edit
- **Right-click** any item to open edit modal
- **Click** items with children to navigate into them
- **Move buttons** (▲) reorder items

## API Endpoints Used

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/structure` | GET | Fetch full structure |
| `/api/items/{path}` | PUT | Update an item |
| `/api/items/{path}` | POST | Create child item |
| `/api/items/{path}` | DELETE | Delete an item |
| `/api/items/{path}/move-up` | POST | Move item up |
| `/api/sync-to-drive` | POST | Sync to Google Drive |
