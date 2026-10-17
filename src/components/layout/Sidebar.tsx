import { NavLink } from 'react-router-dom';
import {
  CalendarDays,
  Target,
  Users,
  Sun,
  LayoutDashboard,
  History,
  Settings,
  MapPin,
  ClipboardList,
  X,
} from 'lucide-react';
import type { PerfilUsuario } from '@/types';
import { PERFIL_LABELS } from '@/types';
import { useAuthStore } from '@/store/auth';
import { BrandLogo } from '@/components/ui/BrandLogo';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  roles: PerfilUsuario[];
}

const navItems: NavItem[] = [
  { to: '/', label: 'Calendário', icon: CalendarDays, roles: ['admin', 'supervisor', 'operador', 'visualizador'] },
  { to: '/metas', label: 'Gestão de Metas', icon: Target, roles: ['admin', 'supervisor'] },
  { to: '/condutores', label: 'Condutores', icon: Users, roles: ['admin', 'supervisor', 'operador'] },
  { to: '/escala-amanha', label: 'Escala de Amanhã', icon: Sun, roles: ['admin', 'supervisor', 'operador', 'visualizador'] },
  { to: '/lista-espera', label: 'Lista de Espera', icon: ClipboardList, roles: ['admin', 'supervisor', 'operador', 'visualizador'] },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'supervisor', 'visualizador'] },
  { to: '/cidades-hubs', label: 'Cidades & HUBs', icon: MapPin, roles: ['admin'] },
  { to: '/historico', label: 'Histórico', icon: History, roles: ['admin', 'supervisor'] },
  { to: '/configuracoes', label: 'Configurações', icon: Settings, roles: ['admin'] },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const user = useAuthStore((s) => s.user);
  const perfil = user?.perfil;

  const items = navItems.filter((item) => !perfil || item.roles.includes(perfil));

  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-72 bg-white/90 text-slate-800 border-r border-slate-200/80 shadow-[0_20px_60px_rgba(15,23,42,0.08)] flex flex-col transform overflow-hidden backdrop-blur-xl transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.08),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.08),_transparent_26%)]" />

        {/* Logo */}
        <div className="relative flex items-start justify-between px-5 py-5 border-b border-slate-200/80">
          <BrandLogo compact subtitle="Gestão de Coletas" />
          <button className="lg:hidden text-slate-400 hover:text-slate-900" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="relative flex-1 overflow-y-auto py-4 px-3 space-y-1.5">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-3 rounded-2xl text-sm font-medium transition-all ${
                  isActive
                    ? 'border border-cyan-200 bg-cyan-50 text-slate-900 shadow-[0_12px_30px_rgba(34,211,238,0.12)]'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-100 bg-white text-cyan-700 transition-transform group-hover:scale-105">
                <item.icon size={18} />
              </span>
              <span className="flex-1">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User */}
        {user && (
          <div className="relative p-4 border-t border-slate-200/80">
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-3 backdrop-blur">
              <div className="mb-2 neon-divider" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-100 to-blue-100 border border-cyan-200 flex items-center justify-center font-semibold text-sm text-slate-900">
                {user.nome.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate text-slate-900">{user.nome}</div>
                  <div className="text-xs text-slate-500">{PERFIL_LABELS[user.perfil]}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
