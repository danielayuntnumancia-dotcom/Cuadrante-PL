import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider } from './lib/firebase';
import { LogOut, Calendar, Users, Settings, LayoutDashboard } from 'lucide-react';
import { cn } from './lib/utils';

// Pages
import Dashboard from './pages/Dashboard';
import Cuadrante from './pages/Cuadrante';
import Plantilla from './pages/Plantilla';
import Configuracion from './pages/Configuracion';

function ProtectedRoute({ children, user }: { children: React.ReactNode, user: User | null }) {
  const [authError, setAuthError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    try {
      setAuthError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Error signing in with Google:", err);
      if (err.code === 'auth/operation-not-allowed') {
        setAuthError("El proveedor de Google no está habilitado en Firebase Console. Ve a Authentication > Sign-in method y actívalo.");
      } else if (err.code === 'auth/unauthorized-domain') {
        setAuthError("Este dominio no está autorizado en Firebase. Agrégalo en Firebase Console > Authentication > Settings.");
      } else {
        setAuthError(err.message || "Error al autenticar con Google.");
      }
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-slate-300 font-sans">
        <div className="text-center p-8 bg-slate-900/50 border border-slate-800 rounded-sm shadow-2xl max-w-sm w-full">
          <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded flex items-center justify-center mx-auto mb-4">
            <LayoutDashboard size={24} />
          </div>
          <h1 className="text-xl font-bold text-slate-100 mb-2 uppercase tracking-widest text-[13px]">Cuadrante Policial</h1>
          <p className="text-slate-500 mb-6 text-[11px] font-mono">INICIO DE SESIÓN REQUERIDO</p>
          
          {authError && (
            <div className="mb-4 p-3 bg-red-950/60 border border-red-800/80 rounded text-red-300 text-left text-[11px] font-mono leading-tight">
              {authError}
            </div>
          )}

          <button
            onClick={handleGoogleSignIn}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[11px] uppercase tracking-widest py-2 rounded transition-colors"
          >
            Autenticar con Google
          </button>
        </div>
      </div>
    );
  }
  return <Layout user={user}>{children}</Layout>;
}

function Layout({ children, user }: { children: React.ReactNode, user: User }) {
  const location = useLocation();
  const navItems = [
    { name: 'Resumen', path: '/', icon: LayoutDashboard },
    { name: 'Cuadrante', path: '/cuadrante', icon: Calendar },
    { name: 'Plantilla', path: '/plantilla', icon: Users },
    { name: 'Configuración', path: '/configuracion', icon: Settings },
  ];

  const pathName = location.pathname.replace('/', '');
  const titleMap: Record<string, string> = {
    '': 'RESUMEN PRINCIPAL',
    'cuadrante': 'CUADRANTE',
    'plantilla': 'PLANTILLA DE AGENTES',
    'configuracion': 'CONFIGURACIÓN'
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-300 font-sans text-[13px] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 border-r border-slate-800 bg-slate-900/30 flex flex-col p-3 shrink-0 gap-4">
        <div className="p-2 flex items-center gap-3 border-b border-slate-800 pb-4">
          <div className="bg-indigo-500/20 border border-indigo-500/30 p-1.5 rounded text-indigo-400">
            <Calendar size={18} />
          </div>
          <h1 className="font-bold text-slate-100 uppercase tracking-widest text-[12px]">Cuadrante 7x7</h1>
        </div>
        
        <nav className="flex-1 space-y-1 overflow-y-auto flex flex-col gap-1 mt-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 transition-colors font-mono text-[11px] tracking-widest uppercase",
                  isActive ? "text-indigo-400 bg-indigo-500/10 border-l-2 border-indigo-400" : "text-slate-500 hover:text-slate-200 border-l-2 border-transparent"
                )}
              >
                <Icon size={16} />
                <span>{item.name}</span>
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border border-slate-800 bg-slate-900/50 rounded flex items-center justify-between">
          <div className="flex items-center gap-3 truncate">
            <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.email}&background=312e81&color=a5b4fc`} alt="Avatar" className="w-8 h-8 rounded opacity-80" />
            <div className="truncate text-[10px] font-mono">
              <p className="text-slate-300 truncate font-bold">{user.displayName || 'Admin'}</p>
              <p className="text-indigo-400/80 truncate">{user.email}</p>
            </div>
          </div>
          <button onClick={() => signOut(auth)} className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors">
            <LogOut size={14} />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-12 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between px-6 shrink-0">
          <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
            {titleMap[pathName] || 'SISTEMA'}
          </div>
          <div className="flex items-center gap-4 font-mono text-[11px]">
            <div className="flex flex-col items-end">
              <span className="text-slate-500 leading-none">ESTADO DEL SISTEMA</span>
              <span className="text-emerald-400">EN LÍNEA Y SINCRONIZADO</span>
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-[10px] font-mono text-slate-500 uppercase tracking-widest">VERIFICANDO SESIÓN...</div>;
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<ProtectedRoute user={user}><Dashboard /></ProtectedRoute>} />
        <Route path="/cuadrante" element={<ProtectedRoute user={user}><Cuadrante /></ProtectedRoute>} />
        <Route path="/plantilla" element={<ProtectedRoute user={user}><Plantilla /></ProtectedRoute>} />
        <Route path="/configuracion" element={<ProtectedRoute user={user}><Configuracion /></ProtectedRoute>} />
      </Routes>
    </Router>
  );
}
