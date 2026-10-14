import { Menu, LogOut, Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { useUIStore } from '@/store/ui';
import { getGreeting } from '@/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <button
          className="lg:hidden btn-ghost p-2"
          onClick={toggleSidebar}
          aria-label="Abrir menu"
        >
          <Menu size={20} />
        </button>
        <div>
          <p className="text-sm font-semibold text-slate-800">
            {getGreeting()}, {user?.nome?.split(' ')[0] || 'Usuário'} 👋
          </p>
          <p className="text-xs text-slate-500">
            {format(now, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })} •{' '}
            {format(now, 'HH:mm')}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="btn-ghost p-2 relative">
          <Bell size={20} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>
        <button onClick={signOut} className="btn-ghost p-2" title="Sair">
          <LogOut size={20} />
        </button>
      </div>
    </header>
  );
}
