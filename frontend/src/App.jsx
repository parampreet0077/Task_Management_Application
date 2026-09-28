import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  LayoutDashboard,
  CheckCircle2,
  Clock,
  AlertCircle,
  Calendar,
  Search,
  Plus,
  Trash2,
  Edit3,
  Filter,
  Kanban,
  Table as TableIcon,
  LogOut,
  User as UserIcon,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  X,
  ChevronDown,
  AlertTriangle,
  RefreshCw,
  SlidersHorizontal,
  Flame,
  Check,
  Radio,
  ExternalLink
} from 'lucide-react';

// Derive API Base URL (defaults to proxy or origin if empty)
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function App() {
  // -------------------------------------------------------------
  // Authentication State
  // -------------------------------------------------------------
  const [token, setToken] = useState(() => localStorage.getItem('flowtask_token') || null);
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('flowtask_user');
    return saved ? JSON.parse(saved) : null;
  });

  // Auth form states
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // -------------------------------------------------------------
  // Task & UI State
  // -------------------------------------------------------------
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [activeView, setActiveView] = useState('kanban'); // 'kanban' | 'table'
  const [socketConnected, setSocketConnected] = useState(false);
  const [liveNotification, setLiveNotification] = useState(null);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('ALL'); // 'ALL' | 'High' | 'Medium' | 'Low'
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'Todo' | 'In Progress' | 'Done'

  // Modals state
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null); // null if creating, task object if editing
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    priority: 'Medium',
    status: 'Todo',
    dueDate: '',
  });
  const [taskFormError, setTaskFormError] = useState('');
  const [taskFormSubmitting, setTaskFormSubmitting] = useState(false);

  // Delete confirmation modal state
  const [deletingTask, setDeletingTask] = useState(null);
  const [deleteConfirmSubmitting, setDeleteConfirmSubmitting] = useState(false);

  // Drag and drop state
  const [draggingTaskId, setDraggingTaskId] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);

  // Socket reference
  const socketRef = useRef(null);

  // -------------------------------------------------------------
  // Auth Helpers
  // -------------------------------------------------------------
  const handleAuthSuccess = (newToken, newUser) => {
    localStorage.setItem('flowtask_token', newToken);
    localStorage.setItem('flowtask_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    setAuthError('');
  };

  const handleLogout = () => {
    localStorage.removeItem('flowtask_token');
    localStorage.removeItem('flowtask_user');
    setToken(null);
    setUser(null);
    setTasks([]);
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const payload = authMode === 'login'
      ? { email: authEmail, password: authPassword }
      : { name: authName, email: authEmail, password: authPassword };

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      handleAuthSuccess(data.token, data.user);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const fillDemoAccount = () => {
    setAuthEmail('alex.developer@flowtask.io');
    setAuthPassword('password123');
    if (authMode === 'register') {
      setAuthName('Alex Rivera');
    }
  };

  // -------------------------------------------------------------
  // Tasks API Calls
  // -------------------------------------------------------------
  const fetchTasks = useCallback(async () => {
    if (!token) return;
    setLoadingTasks(true);
    try {
      const res = await fetch(`${API_URL}/api/tasks`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (res.status === 401 || res.status === 403) {
        handleLogout();
        return;
      }
      const data = await res.json();
      if (res.ok) {
        setTasks(data.tasks || []);
      }
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoadingTasks(false);
    }
  }, [token]);

  // Initial tasks fetch on token availability
  useEffect(() => {
    if (token) {
      fetchTasks();
    }
  }, [token, fetchTasks]);

  // -------------------------------------------------------------
  // Socket.io Real-time Synchronization
  // -------------------------------------------------------------
  useEffect(() => {
    if (!token || !user) return;

    // Connect to Socket.io server
    const socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('join', user.id);
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    // Real-time Event: Task Created
    socket.on('task:created', (newTask) => {
      if (newTask.userId === user.id || newTask.ownerId === user.id) {
        setTasks((prev) => {
          if (prev.some((t) => t.id === newTask.id)) return prev;
          return [newTask, ...prev];
        });
        showLiveToast(`New task added: "${newTask.title}"`);
      }
    });

    // Real-time Event: Task Updated
    socket.on('task:updated', (updatedTask) => {
      if (updatedTask.userId === user.id || updatedTask.ownerId === user.id) {
        setTasks((prev) =>
          prev.map((t) => (t.id === updatedTask.id ? updatedTask : t))
        );
        showLiveToast(`Task updated: "${updatedTask.title}"`);
      }
    });

    // Real-time Event: Task Deleted
    socket.on('task:deleted', ({ id, ownerId }) => {
      if (!ownerId || ownerId === user.id) {
        setTasks((prev) => prev.filter((t) => t.id !== id));
        showLiveToast('A task was removed');
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [token, user]);

  const showLiveToast = (message) => {
    setLiveNotification(message);
    setTimeout(() => {
      setLiveNotification((current) => (current === message ? null : current));
    }, 4000);
  };

  // -------------------------------------------------------------
  // Task Mutation Handlers
  // -------------------------------------------------------------
  const openCreateModal = () => {
    setEditingTask(null);
    setTaskForm({
      title: '',
      description: '',
      priority: 'Medium',
      status: 'Todo',
      dueDate: '',
    });
    setTaskFormError('');
    setIsTaskModalOpen(true);
  };

  const openEditModal = (task) => {
    setEditingTask(task);
    setTaskForm({
      title: task.title,
      description: task.description || '',
      priority: task.priority || 'Medium',
      status: task.status || 'Todo',
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
    });
    setTaskFormError('');
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = async (e) => {
    e.preventDefault();
    if (!taskForm.title.trim()) {
      setTaskFormError('Please enter a task title');
      return;
    }

    setTaskFormSubmitting(true);
    setTaskFormError('');

    try {
      const url = editingTask
        ? `${API_URL}/api/tasks/${editingTask.id}`
        : `${API_URL}/api/tasks`;
      const method = editingTask ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(taskForm),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save task');
      }

      // Optimistically update local state if socket has slight latency
      if (editingTask) {
        setTasks((prev) => prev.map((t) => (t.id === data.task.id ? data.task : t)));
      } else {
        setTasks((prev) => [data.task, ...prev.filter(t => t.id !== data.task.id)]);
      }

      setIsTaskModalOpen(false);
    } catch (err) {
      setTaskFormError(err.message);
    } finally {
      setTaskFormSubmitting(false);
    }
  };

  const handleQuickStatusChange = async (taskId, newStatus) => {
    try {
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      );

      const res = await fetch(`${API_URL}/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        // Rollback if failed
        fetchTasks();
      }
    } catch (err) {
      console.error('Failed to change status:', err);
      fetchTasks();
    }
  };

  const handleDeleteTask = async () => {
    if (!deletingTask) return;
    setDeleteConfirmSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/api/tasks/${deletingTask.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to delete task');
      }

      setTasks((prev) => prev.filter((t) => t.id !== deletingTask.id));
      setDeletingTask(null);
    } catch (err) {
      console.error('Delete error:', err);
      alert('Error deleting task: ' + err.message);
    } finally {
      setDeleteConfirmSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // Drag & Drop Handlers (Kanban)
  // -------------------------------------------------------------
  const handleDragStart = (e, taskId) => {
    e.dataTransfer.setData('text/plain', taskId);
    setDraggingTaskId(taskId);
  };

  const handleDragOver = (e, columnStatus) => {
    e.preventDefault();
    setDragOverColumn(columnStatus);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, targetStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggingTaskId;
    setDraggingTaskId(null);
    setDragOverColumn(null);

    if (taskId) {
      const task = tasks.find((t) => t.id === taskId);
      if (task && task.status !== targetStatus) {
        handleQuickStatusChange(taskId, targetStatus);
      }
    }
  };

  // -------------------------------------------------------------
  // Filtered Tasks & Statistics
  // -------------------------------------------------------------
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Search filter
      const matchesSearch =
        !searchQuery.trim() ||
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (task.description && task.description.toLowerCase().includes(searchQuery.toLowerCase()));

      // Priority filter
      const matchesPriority =
        priorityFilter === 'ALL' || task.priority === priorityFilter;

      // Status filter
      const matchesStatus =
        statusFilter === 'ALL' || task.status === statusFilter;

      return matchesSearch && matchesPriority && matchesStatus;
    });
  }, [tasks, searchQuery, priorityFilter, statusFilter]);

  const metrics = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === 'Done').length;
    const inProgress = tasks.filter((t) => t.status === 'In Progress').length;
    const todo = tasks.filter((t) => t.status === 'Todo').length;
    const pending = inProgress + todo;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, inProgress, todo, pending, completionRate };
  }, [tasks]);

  // Color & Badge Utilities
  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'High':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <Flame className="w-3 h-3" /> High
          </span>
        );
      case 'Medium':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3" /> Medium
          </span>
        );
      case 'Low':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <Check className="w-3 h-3" /> Low
          </span>
        );
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Done':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> Done
          </span>
        );
      case 'In Progress':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">
            <RefreshCw className="w-3 h-3 animate-spin" /> In Progress
          </span>
        );
      case 'Todo':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-700/60 text-slate-300 border border-slate-600">
            <Clock className="w-3 h-3" /> Todo
          </span>
        );
    }
  };

  const isOverdue = (dueDate, status) => {
    if (!dueDate || status === 'Done') return false;
    const due = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due < today;
  };

  // -------------------------------------------------------------
  // Render Auth Screen if not logged in
  // -------------------------------------------------------------
  if (!token || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md">
          {/* Brand Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 shadow-xl shadow-indigo-500/25 mb-4 border border-violet-400/20">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-400">
              FlowTask Studio
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Production-grade Real-time Task Management System
            </p>
          </div>

          {/* Card */}
          <div className="glass-panel rounded-2xl p-6 sm:p-8 shadow-2xl border border-white/10 relative overflow-hidden">
            {/* Ambient blur glow */}
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-violet-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

            {/* Mode Switcher */}
            <div className="flex bg-slate-900/80 p-1 rounded-xl mb-6 border border-slate-800">
              <button
                type="button"
                onClick={() => { setAuthMode('login'); setAuthError(''); }}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                  authMode === 'login'
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setAuthMode('register'); setAuthError(''); }}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                  authMode === 'register'
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Create Account
              </button>
            </div>

            {authError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === 'register' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="e.g. Alex Rivera"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 text-white text-sm outline-none transition-all placeholder:text-slate-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="alex@flowtask.io"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 text-white text-sm outline-none transition-all placeholder:text-slate-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 text-white text-sm outline-none transition-all placeholder:text-slate-500"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 active:scale-[0.99] font-medium text-white shadow-lg shadow-violet-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {authLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <span>{authMode === 'login' ? 'Sign In to Dashboard' : 'Create FlowTask Account'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Quick Demo Credentials */}
            <div className="mt-6 pt-4 border-t border-slate-800 text-center">
              <button
                type="button"
                onClick={fillDemoAccount}
                className="text-xs text-violet-400 hover:text-violet-300 underline underline-offset-4 font-medium transition-colors"
              >
                Click here to autofill demo credentials
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Render Dashboard
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen flex flex-col">
      {/* Real-time Toast Banner */}
      {liveNotification && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-violet-950/90 border border-violet-500/40 text-violet-200 text-xs shadow-2xl backdrop-blur-md animate-bounce">
          <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          <span>{liveNotification}</span>
        </div>
      )}

      {/* Top Navbar */}
      <header className="sticky top-0 z-30 glass-panel border-b border-white/10 px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 border border-violet-400/30">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">FlowTask</h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  Studio
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <span>{socketConnected ? 'Real-time Sync Active' : 'Connecting Sync...'}</span>
              </div>
            </div>
          </div>

          {/* User Profile & Actions */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 py-1 px-3 rounded-full bg-slate-900/80 border border-slate-800">
              <img
                src={user.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.name}`}
                alt={user.name}
                className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 object-cover"
              />
              <div className="hidden sm:block text-left">
                <p className="text-xs font-semibold text-slate-200 leading-tight">{user.name}</p>
                <p className="text-[11px] text-slate-400 leading-tight truncate max-w-[140px]">{user.email}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              title="Log Out"
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        
        {/* Dashboard Metrics Row */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Metric 1: Total Tasks */}
          <div className="glass-panel p-4 sm:p-5 rounded-2xl border border-white/5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Tasks</p>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">{metrics.total}</h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <LayoutDashboard className="w-6 h-6" />
            </div>
          </div>

          {/* Metric 2: In Progress / Pending */}
          <div className="glass-panel p-4 sm:p-5 rounded-2xl border border-white/5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">In Progress</p>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">{metrics.inProgress}</h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Clock className="w-6 h-6" />
            </div>
          </div>

          {/* Metric 3: Completed */}
          <div className="glass-panel p-4 sm:p-5 rounded-2xl border border-white/5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Completed</p>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-emerald-400 mt-1">{metrics.completed}</h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>

          {/* Metric 4: Progress % */}
          <div className="glass-panel p-4 sm:p-5 rounded-2xl border border-white/5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Completion</p>
              <span className="text-xs font-bold text-violet-300">{metrics.completionRate}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2.5 mt-3 overflow-hidden border border-slate-700/50">
              <div
                className="bg-gradient-to-r from-violet-500 to-emerald-400 h-2.5 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${metrics.completionRate}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              {metrics.completed} of {metrics.total} tasks resolved
            </p>
          </div>
        </section>

        {/* Action Controls & Filters Bar */}
        <section className="glass-panel p-4 rounded-2xl border border-white/5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Left: Search input */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks by title or details..."
              className="w-full pl-10 pr-9 py-2 rounded-xl bg-slate-900/90 border border-slate-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 text-sm text-white placeholder:text-slate-500 outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Center: Dropdown Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Priority Filter */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300">
              <Flame className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500">Priority:</span>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="bg-transparent text-slate-200 outline-none cursor-pointer text-xs font-semibold"
              >
                <option value="ALL" className="bg-slate-900 text-slate-200">All</option>
                <option value="High" className="bg-slate-900 text-rose-400">High</option>
                <option value="Medium" className="bg-slate-900 text-amber-400">Medium</option>
                <option value="Low" className="bg-slate-900 text-emerald-400">Low</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent text-slate-200 outline-none cursor-pointer text-xs font-semibold"
              >
                <option value="ALL" className="bg-slate-900 text-slate-200">All</option>
                <option value="Todo" className="bg-slate-900 text-slate-300">Todo</option>
                <option value="In Progress" className="bg-slate-900 text-purple-300">In Progress</option>
                <option value="Done" className="bg-slate-900 text-emerald-300">Done</option>
              </select>
            </div>

            {/* View Switcher: Kanban vs Table */}
            <div className="flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setActiveView('kanban')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  activeView === 'kanban'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Kanban Board View"
              >
                <Kanban className="w-3.5 h-3.5" />
                <span>Board</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveView('table')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  activeView === 'table'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Table / List View"
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>Table</span>
              </button>
            </div>
          </div>

          {/* Right: New Task Button */}
          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 active:scale-[0.98] text-white text-sm font-semibold shadow-lg shadow-violet-600/25 transition-all whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Create Task</span>
          </button>
        </section>

        {/* View 1: Kanban Board View */}
        {activeView === 'kanban' && (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {['Todo', 'In Progress', 'Done'].map((colStatus) => {
              const columnTasks = filteredTasks.filter((t) => t.status === colStatus);
              const isOver = dragOverColumn === colStatus;

              return (
                <div
                  key={colStatus}
                  onDragOver={(e) => handleDragOver(e, colStatus)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, colStatus)}
                  className={`flex flex-col rounded-2xl glass-panel p-4 min-h-[500px] transition-all border ${
                    isOver
                      ? 'border-violet-500 bg-violet-500/10'
                      : 'border-white/5'
                  }`}
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          colStatus === 'Todo'
                            ? 'bg-slate-400'
                            : colStatus === 'In Progress'
                            ? 'bg-purple-400'
                            : 'bg-emerald-400'
                        }`}
                      />
                      <h4 className="font-semibold text-sm text-slate-200">{colStatus}</h4>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                      {columnTasks.length}
                    </span>
                  </div>

                  {/* Task Cards in Column */}
                  <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                    {columnTasks.length === 0 ? (
                      <div className="h-40 flex flex-col items-center justify-center text-center p-4 border border-dashed border-slate-800 rounded-xl">
                        <p className="text-xs text-slate-500">No tasks in {colStatus}</p>
                        <p className="text-[10px] text-slate-600 mt-1">Drag items here or add a new one</p>
                      </div>
                    ) : (
                      columnTasks.map((task) => {
                        const overdue = isOverdue(task.dueDate, task.status);

                        return (
                          <div
                            key={task.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, task.id)}
                            className="glass-card rounded-xl p-4 transition-all duration-150 cursor-grab active:cursor-grabbing hover:shadow-xl hover:shadow-violet-950/20 group relative border border-white/5"
                          >
                            {/* Card Top: Priority & Action Buttons */}
                            <div className="flex items-center justify-between gap-2 mb-2">
                              {getPriorityBadge(task.priority)}
                              <div className="flex items-center gap-1 opacity-75 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={() => openEditModal(task)}
                                  className="p-1 rounded-md text-slate-400 hover:text-violet-300 hover:bg-violet-500/20 transition-colors"
                                  title="Edit Task"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingTask(task)}
                                  className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 transition-colors"
                                  title="Delete Task"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Title & Description */}
                            <h5 className="text-sm font-semibold text-slate-100 mb-1 leading-snug line-clamp-2">
                              {task.title}
                            </h5>
                            {task.description && (
                              <p className="text-xs text-slate-400 line-clamp-2 mb-3">
                                {task.description}
                              </p>
                            )}

                            {/* Card Footer: Due Date & Quick Status Shift */}
                            <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs">
                              {task.dueDate ? (
                                <div
                                  className={`flex items-center gap-1 text-[11px] ${
                                    overdue ? 'text-rose-400 font-semibold' : 'text-slate-400'
                                  }`}
                                >
                                  <Calendar className="w-3 h-3" />
                                  <span>
                                    {new Date(task.dueDate).toLocaleDateString(undefined, {
                                      month: 'short',
                                      day: 'numeric',
                                    })}
                                  </span>
                                  {overdue && (
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 ml-0.5">
                                      Overdue
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-600">No date</span>
                              )}

                              {/* Quick Move Buttons */}
                              <div className="flex items-center gap-1">
                                {colStatus !== 'Todo' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleQuickStatusChange(
                                        task.id,
                                        colStatus === 'Done' ? 'In Progress' : 'Todo'
                                      )
                                    }
                                    title="Move back"
                                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                                  >
                                    <ArrowLeft className="w-3 h-3" />
                                  </button>
                                )}
                                {colStatus !== 'Done' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleQuickStatusChange(
                                        task.id,
                                        colStatus === 'Todo' ? 'In Progress' : 'Done'
                                      )
                                    }
                                    title="Move forward"
                                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                                  >
                                    <ArrowRight className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* View 2: Table / List View */}
        {activeView === 'table' && (
          <section className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-900/90 text-xs uppercase font-semibold text-slate-400 border-b border-slate-800">
                  <tr>
                    <th scope="col" className="py-3.5 px-4 sm:px-6">Task Details</th>
                    <th scope="col" className="py-3.5 px-4">Priority</th>
                    <th scope="col" className="py-3.5 px-4">Status</th>
                    <th scope="col" className="py-3.5 px-4">Due Date</th>
                    <th scope="col" className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500">
                        No tasks match your search and filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredTasks.map((task) => {
                      const overdue = isOverdue(task.dueDate, task.status);

                      return (
                        <tr
                          key={task.id}
                          className="hover:bg-slate-800/40 transition-colors group"
                        >
                          <td className="py-3.5 px-4 sm:px-6 max-w-xs sm:max-w-md">
                            <p className="font-semibold text-slate-100">{task.title}</p>
                            {task.description && (
                              <p className="text-xs text-slate-400 truncate mt-0.5">
                                {task.description}
                              </p>
                            )}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {getPriorityBadge(task.priority)}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <select
                              value={task.status}
                              onChange={(e) => handleQuickStatusChange(task.id, e.target.value)}
                              className="bg-slate-900/90 text-xs rounded-lg px-2 py-1 border border-slate-700 text-slate-200 outline-none cursor-pointer focus:border-violet-500"
                            >
                              <option value="Todo">Todo</option>
                              <option value="In Progress">In Progress</option>
                              <option value="Done">Done</option>
                            </select>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-xs">
                            {task.dueDate ? (
                              <span
                                className={`inline-flex items-center gap-1.5 ${
                                  overdue ? 'text-rose-400 font-semibold' : 'text-slate-300'
                                }`}
                              >
                                <Calendar className="w-3.5 h-3.5" />
                                {new Date(task.dueDate).toLocaleDateString(undefined, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                                {overdue && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-bold">
                                    Overdue
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditModal(task)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-violet-300 hover:bg-violet-500/20 transition-colors"
                                title="Edit Task"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingTask(task)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 transition-colors"
                                title="Delete Task"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {/* ------------------------------------------------------------- */}
      {/* Modal: Create / Edit Task */}
      {/* ------------------------------------------------------------- */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg rounded-2xl p-6 border border-white/10 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-400" />
                {editingTask ? 'Edit Task' : 'Create New Task'}
              </h3>
              <button
                type="button"
                onClick={() => setIsTaskModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {taskFormError && (
              <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{taskFormError}</span>
              </div>
            )}

            <form onSubmit={handleSaveTask} className="mt-4 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Task Title <span className="text-violet-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  placeholder="e.g. Implement WebSocket heartbeat mechanism"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none placeholder:text-slate-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  placeholder="Add details, acceptance criteria, or documentation links..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none placeholder:text-slate-500 resize-none"
                />
              </div>

              {/* Priority & Status Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Priority Level
                  </label>
                  <select
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none cursor-pointer"
                  >
                    <option value="Low">Low Priority</option>
                    <option value="Medium">Medium Priority</option>
                    <option value="High">High Priority</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Initial Status
                  </label>
                  <select
                    value={taskForm.status}
                    onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none cursor-pointer"
                  >
                    <option value="Todo">Todo</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Done">Done</option>
                  </select>
                </div>
              </div>

              {/* Due Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Target Due Date
                </label>
                <input
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
                />
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsTaskModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={taskFormSubmitting}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-violet-600/25 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {taskFormSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{editingTask ? 'Save Changes' : 'Create Task'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Modal: Delete Confirmation Dialog */}
      {/* ------------------------------------------------------------- */}
      {deletingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md rounded-2xl p-6 border border-rose-500/20 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Task</h3>
                <p className="text-xs text-slate-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-sm text-slate-300 my-4 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              Are you sure you want to permanently delete{' '}
              <span className="font-semibold text-white">"{deletingTask.title}"</span>?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={deleteConfirmSubmitting}
                onClick={() => setDeletingTask(null)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirmSubmitting}
                onClick={handleDeleteTask}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white text-sm font-semibold shadow-lg shadow-rose-600/25 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {deleteConfirmSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
