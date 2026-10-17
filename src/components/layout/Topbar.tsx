import { Menu, LogOut, Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { useUIStore } from '@/store/ui';
import { getGreeting } from '@/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BrandLogo } from '@/components/ui/BrandLogo';

export function Topbar() {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 px-4 lg:px-6 backdrop-blur-xl">
      <div className="flex h-20 items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          className="lg:hidden btn-ghost p-2"
          onClick={toggleSidebar}
          aria-label="Abrir menu"
        >
          <Menu size={20} />
        </button>
        <div className="hidden xl:block">
          <BrandLogo compact subtitle="Painel Operacional" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">
            {getGreeting()}, {user?.nome?.split(' ')[0] || 'Usuário'} 👋
          </p>
          <p className="truncate text-xs text-slate-500">
            {format(now, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })} •{' '}
            {format(now, 'HH:mm')}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden md:flex items-center gap-2 rounded-2xl border border-cyan-200/70 bg-white/80 px-3 py-2 shadow-sm">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(74,222,128,0.8)]" />
          <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Tempo real</span>
        </div>
        <button className="btn-ghost p-2 relative">
          <Bell size={20} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>
        <button onClick={signOut} className="btn-ghost p-2" title="Sair">
          <LogOut size={20} />
        </button>
      </div>
      </div>
    </header>
  );
}
