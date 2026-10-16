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
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-100 flex flex-col transform transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center font-bold text-white">
              E
            </div>
            <div>
              <div className="font-bold text-sm leading-tight">Escalas CR</div>
              <div className="text-[10px] text-slate-400">Gestão de Coletas</div>
            </div>
          </div>
          <button className="lg:hidden text-slate-400 hover:text-white" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        {user && (
          <div className="p-4 border-t border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center font-semibold text-sm">
                {user.nome.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{user.nome}</div>
                <div className="text-xs text-slate-400">{PERFIL_LABELS[user.perfil]}</div>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
