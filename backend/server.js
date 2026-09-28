/**
 * FlowTask Studio - Production-Ready Backend Server
 * Complete REST API & Real-time WebSocket Server
 * Tech Stack: Express, Mongoose / MongoDB, Socket.io, JWT, bcryptjs
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'flowtask_super_secret_jwt_key_2026';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/flowtask_studio';

const app = express();
const server = http.createServer(app);

// -------------------------------------------------------------
// Real-time Socket.io Setup
// -------------------------------------------------------------
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  },
});

// Middleware
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

// -------------------------------------------------------------
// Mongoose Models & Schemas
// -------------------------------------------------------------
let isMongoConnected = false;

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    avatar: { type: String, default: '' },
  },
  { timestamps: true }
);

UserSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id ? ret._id.toString() : ret.id;
    delete ret._id;
    delete ret.__v;
    delete ret.password;
    return ret;
  },
});

const TaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      default: 'Medium',
    },
    status: {
      type: String,
      enum: ['Todo', 'In Progress', 'Done'],
      default: 'Todo',
    },
    dueDate: { type: Date, default: null },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

TaskSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id ? ret._id.toString() : ret.id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const MongoUser = mongoose.model('User', UserSchema);
const MongoTask = mongoose.model('Task', TaskSchema);

// -------------------------------------------------------------
// Resilient In-Memory Data Store (Zero-config instant local fallback)
// -------------------------------------------------------------
const memoryDb = {
  users: [],
  tasks: [],
};

// Database unified interface
const db = {
  async findUserByEmail(email) {
    const normalized = email.toLowerCase().trim();
    if (isMongoConnected) {
      return await MongoUser.findOne({ email: normalized });
    }
    return memoryDb.users.find((u) => u.email.toLowerCase() === normalized) || null;
  },

  async findUserById(id) {
    if (isMongoConnected) {
      return await MongoUser.findById(id).select('-password');
    }
    const user = memoryDb.users.find((u) => u.id === id);
    if (!user) return null;
    const { password, ...safeUser } = user;
    return safeUser;
  },

  async createUser({ name, email, password, avatar }) {
    const normalized = email.toLowerCase().trim();
    if (isMongoConnected) {
      const user = await MongoUser.create({ name, email: normalized, password, avatar });
      return user.toJSON();
    }
    const newUser = {
      id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
      name: name.trim(),
      email: normalized,
      password,
      avatar,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    memoryDb.users.push(newUser);
    const { password: _, ...safeUser } = newUser;
    return safeUser;
  },

  async getTasks({ userId, search, priority, status }) {
    if (isMongoConnected) {
      const query = { userId };
      if (priority && ['Low', 'Medium', 'High'].includes(priority)) query.priority = priority;
      if (status && ['Todo', 'In Progress', 'Done'].includes(status)) query.status = status;
      if (search && search.trim() !== '') {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [{ title: searchRegex }, { description: searchRegex }];
      }
      const tasks = await MongoTask.find(query).sort({ createdAt: -1 });
      return tasks.map((t) => t.toJSON());
    }

    let results = memoryDb.tasks.filter((t) => t.userId === userId.toString());

    if (priority && priority !== 'ALL') {
      results = results.filter((t) => t.priority === priority);
    }
    if (status && status !== 'ALL') {
      results = results.filter((t) => t.status === status);
    }
    if (search && search.trim() !== '') {
      const q = search.toLowerCase().trim();
      results = results.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q))
      );
    }

    return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async createTask({ title, description, priority, status, dueDate, userId }) {
    if (isMongoConnected) {
      const task = await MongoTask.create({
        title,
        description: description || '',
        priority,
        status,
        dueDate: dueDate ? new Date(dueDate) : null,
        userId,
      });
      return task.toJSON();
    }

    const newTask = {
      id: 'tsk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
      title: title.trim(),
      description: description ? description.trim() : '',
      priority: ['Low', 'Medium', 'High'].includes(priority) ? priority : 'Medium',
      status: ['Todo', 'In Progress', 'Done'].includes(status) ? status : 'Todo',
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      userId: userId.toString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    memoryDb.tasks.push(newTask);
    return newTask;
  },

  async updateTask(id, userId, updates) {
    if (isMongoConnected) {
      const task = await MongoTask.findOne({ _id: id, userId });
      if (!task) return null;

      if (updates.title !== undefined) task.title = updates.title.trim();
      if (updates.description !== undefined) task.description = updates.description.trim();
      if (updates.priority !== undefined) task.priority = updates.priority;
      if (updates.status !== undefined) task.status = updates.status;
      if (updates.dueDate !== undefined) {
        task.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
      }

      await task.save();
      return task.toJSON();
    }

    const index = memoryDb.tasks.findIndex((t) => t.id === id && t.userId === userId.toString());
    if (index === -1) return null;

    const task = memoryDb.tasks[index];
    if (updates.title !== undefined) task.title = updates.title.trim();
    if (updates.description !== undefined) task.description = updates.description.trim();
    if (updates.priority !== undefined && ['Low', 'Medium', 'High'].includes(updates.priority)) {
      task.priority = updates.priority;
    }
    if (updates.status !== undefined && ['Todo', 'In Progress', 'Done'].includes(updates.status)) {
      task.status = updates.status;
    }
    if (updates.dueDate !== undefined) {
      task.dueDate = updates.dueDate ? new Date(updates.dueDate).toISOString() : null;
    }
    task.updatedAt = new Date().toISOString();

    memoryDb.tasks[index] = task;
    return task;
  },

  async deleteTask(id, userId) {
    if (isMongoConnected) {
      const task = await MongoTask.findOneAndDelete({ _id: id, userId });
      return !!task;
    }

    const index = memoryDb.tasks.findIndex((t) => t.id === id && t.userId === userId.toString());
    if (index === -1) return false;
    memoryDb.tasks.splice(index, 1);
    return true;
  },
};

// -------------------------------------------------------------
// Authentication Middleware
// -------------------------------------------------------------
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await db.findUserById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token: user not found.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

// -------------------------------------------------------------
// Auth Endpoints
// -------------------------------------------------------------

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await db.findUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const avatar = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(name.trim())}`;

    const user = await db.createUser({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      avatar,
    });

    const token = jwt.sign({ userId: user.id || user._id }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({
      message: 'User registered successfully',
      token,
      user,
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await db.findUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const safeUser = user.toJSON ? user.toJSON() : { id: user.id, name: user.name, email: user.email, avatar: user.avatar };
    const token = jwt.sign({ userId: safeUser.id }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: safeUser,
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  return res.status(200).json({ user: req.user });
});

// -------------------------------------------------------------
// Task CRUD Endpoints (Protected)
// -------------------------------------------------------------

// GET /api/tasks
app.get('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const { search, priority, status } = req.query;
    const userId = req.user.id || req.user._id;

    const tasks = await db.getTasks({ userId, search, priority, status });
    return res.status(200).json({ tasks });
  } catch (err) {
    console.error('Error fetching tasks:', err);
    return res.status(500).json({ error: 'Failed to retrieve tasks.' });
  }
});

// POST /api/tasks
app.post('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const { title, description, priority, status, dueDate } = req.body;
    const userId = req.user.id || req.user._id;

    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Task title is required.' });
    }

    const task = await db.createTask({
      title,
      description,
      priority,
      status,
      dueDate,
      userId,
    });

    // Real-time broadcast
    const room = `user_${userId.toString()}`;
    io.to(room).emit('task:created', task);
    io.emit('task:created', { ...task, ownerId: userId.toString() });

    return res.status(201).json({
      message: 'Task created successfully',
      task,
    });
  } catch (err) {
    console.error('Error creating task:', err);
    return res.status(500).json({ error: 'Failed to create task.' });
  }
});

// PUT /api/tasks/:id
app.put('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id;
    const { title, description, priority, status, dueDate } = req.body;

    const updatedTask = await db.updateTask(id, userId, {
      title,
      description,
      priority,
      status,
      dueDate,
    });

    if (!updatedTask) {
      return res.status(404).json({ error: 'Task not found or unauthorized.' });
    }

    // Real-time broadcast
    const room = `user_${userId.toString()}`;
    io.to(room).emit('task:updated', updatedTask);
    io.emit('task:updated', { ...updatedTask, ownerId: userId.toString() });

    return res.status(200).json({
      message: 'Task updated successfully',
      task: updatedTask,
    });
  } catch (err) {
    console.error('Error updating task:', err);
    return res.status(500).json({ error: 'Failed to update task.' });
  }
});

// DELETE /api/tasks/:id
app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id;

    const deleted = await db.deleteTask(id, userId);
    if (!deleted) {
      return res.status(404).json({ error: 'Task not found or unauthorized.' });
    }

    // Real-time broadcast
    const payload = { id, ownerId: userId.toString() };
    const room = `user_${userId.toString()}`;
    io.to(room).emit('task:deleted', payload);
    io.emit('task:deleted', payload);

    return res.status(200).json({
      message: 'Task deleted successfully',
      id,
    });
  } catch (err) {
    console.error('Error deleting task:', err);
    return res.status(500).json({ error: 'Failed to delete task.' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'FlowTask Studio API',
    timestamp: new Date().toISOString(),
    database: isMongoConnected ? 'mongodb-connected' : 'in-memory-active',
  });
});

// -------------------------------------------------------------
// Real-time Socket.io Connection Handler
// -------------------------------------------------------------
io.on('connection', (socket) => {
  socket.on('join', (userId) => {
    if (userId) {
      const room = `user_${userId}`;
      socket.join(room);
    }
  });
});

// -------------------------------------------------------------
// Server Start & Non-blocking Mongo Connection Check
// -------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` FlowTask Studio Server listening on http://localhost:${PORT}`);
  console.log(` Real-time WebSocket: ws://localhost:${PORT}`);
  console.log(`=======================================================`);

  // Attempt connection to MongoDB in the background without blocking server boot
  mongoose
    .connect(MONGODB_URI, { serverSelectionTimeoutMS: 2500 })
    .then(() => {
      isMongoConnected = true;
      console.log(`[Database] Successfully connected to MongoDB: ${MONGODB_URI}`);
    })
    .catch((err) => {
      isMongoConnected = false;
      console.log(`[Database] MongoDB not running locally (${err.message}).`);
      console.log(`[Database] In-memory persistence active - 100% operational out-of-the-box.`);
    });
});

module.exports = { app, server };
