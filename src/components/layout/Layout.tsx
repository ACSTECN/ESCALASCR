import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useUIStore } from '@/store/ui';

export function Layout() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);

  return (
    <div className="flex h-screen overflow-hidden bg-transparent">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="relative flex-1 flex flex-col min-w-0">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(239,68,68,0.18),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(220,38,38,0.16),_transparent_28%)]" />
        <Topbar />
        <main className="relative flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
