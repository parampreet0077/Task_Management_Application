# FlowTask Studio 🚀

FlowTask Studio is an end-to-end, production-ready, real-time task management web application engineered with modern full-stack best practices.

![FlowTask Studio](https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80)

---

## 🛠️ Technology Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Lucide React icons
- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose (with automatic in-memory fallback via `mongodb-memory-server` if no local/remote DB is active)
- **Real-Time Layer**: Socket.io (instant bidirectional synchronization across sessions)
- **Security & Authentication**: JWT (JSON Web Tokens) with `bcryptjs` password hashing

---

## 🌟 Key Features

1. **Authentication & Authorization**:
   - Secure user registration and login with bcrypt hashing (10 salt rounds).
   - JWT tokens passed via HTTP `Authorization: Bearer <token>` headers.
   - Protected route verification on both client views and server API routes.
   - User profile with dynamic avatars and 1-click logout.

2. **Complete Task CRUD Operations**:
   - Model schema: `id`, `title`, `description`, `priority` (`Low`, `Medium`, `High`), `status` (`Todo`, `In Progress`, `Done`), `dueDate`, `userId`, and `timestamps`.
   - Responsive modals for creating and editing tasks with real-time validation.
   - Confirmation dialog before deleting any task.

3. **Dual View Experience**:
   - **Kanban Board View**: 3 columns (`Todo`, `In Progress`, `Done`) with native HTML5 drag-and-drop support, quick status shift buttons, and overdue deadline alerts.
   - **Table / List View**: Clean, dense tabular view with priority/status badges, date formatting, and inline action controls.

4. **Real-time Synchronization**:
   - Real-time events broadcasted via Socket.io on create (`task:created`), update (`task:updated`), status shift, and deletion (`task:deleted`).
   - Multiple browser tabs or user sessions reflect updates instantly without page reloading.
   - Live socket connectivity indicator (pulsing green status pill).

5. **Search & Metrics Dashboard**:
   - Live text search across titles and descriptions.
   - Filter dropdowns for Priority (`High`, `Medium`, `Low`) and Status (`Todo`, `In Progress`, `Done`).
   - Metric cards displaying Total Tasks, In Progress count, Completed count, and percentage completion progress bar.

---

## 📂 Project Structure

```
flowtask-studio/
├── backend/
│   ├── .env.example
│   ├── .env
│   ├── package.json
│   └── server.js          # Express app, Socket.io server, Mongoose models, and routes
├── frontend/
│   ├── .env.example
│   ├── .env
│   ├── index.html
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx        # Complete dashboard, Kanban/Table views, modals, socket listeners
│       ├── index.css      # Tailwind base, glassmorphism styles, custom scrollbar
│       └── main.jsx       # React DOM entry point
├── package.json           # Root workspace helper scripts
└── README.md
```

---

## ⚡ Quick Start

### 1. Prerequisites
- **Node.js** v18 or higher (v20+ recommended)
- **npm** v9 or higher

### 2. Installation
Run from root or inside each folder:

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 3. Start the Application

#### Option A: Two separate terminals (Recommended for development)

**Terminal 1 (Backend):**
```bash
cd backend
npm run dev
# Server runs at http://localhost:5000
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
# Vite runs at http://localhost:5173
```

#### Option B: Root scripts
```bash
# In the root folder:
npm run backend    # Starts backend with file-watching
npm run frontend   # Starts Vite frontend
```

Now open **`http://localhost:5173`** in your browser!

---

## 🔐 Environment Variables

### Backend (`backend/.env`)
```ini
PORT=5000
# Leave empty to use auto in-memory MongoDB, or provide your connection string:
# MONGODB_URI=mongodb://localhost:27017/flowtask_studio
MONGODB_URI=
JWT_SECRET=super_secret_flowtask_jwt_key_2026_dev_prod
CORS_ORIGIN=http://localhost:5173
NODE_ENV=development
```

### Frontend (`frontend/.env`)
```ini
VITE_API_URL=http://localhost:5000
```

---

## 📡 REST API Reference

### Authentication
- `POST /api/auth/register` — Register new user (`name`, `email`, `password`)
- `POST /api/auth/login` — Sign in user (`email`, `password`)
- `GET /api/auth/me` — Get authenticated user details (Protected)

### Tasks (Protected with `Bearer <token>`)
- `GET /api/tasks` — List tasks (supports query params: `search`, `priority`, `status`)
- `POST /api/tasks` — Create new task (`title`, `description`, `priority`, `status`, `dueDate`)
- `PUT /api/tasks/:id` — Update existing task or status
- `DELETE /api/tasks/:id` — Delete task

### Health
- `GET /api/health` — Service and database status

---

## 🔄 Real-time Events (Socket.io)

| Event | Direction | Payload | Description |
|---|---|---|---|
| `join` | Client ➔ Server | `userId` | User joins room `user_${userId}` |
| `task:created` | Server ➔ Client | `Task object` | New task created |
| `task:updated` | Server ➔ Client | `Task object` | Task modified or status shifted |
| `task:deleted` | Server ➔ Client | `{ id, ownerId }` | Task deleted |
