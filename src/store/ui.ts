import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (b: boolean) => void;

  // Filtros do calendário
  filtroCidadeId: string | null;
  filtroHubId: string | null;
  filtroStatus: string | null;
  setFiltroCidade: (id: string | null) => void;
  setFiltroHub: (id: string | null) => void;
  setFiltroStatus: (s: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (b) => set({ sidebarOpen: b }),

  filtroCidadeId: null,
  filtroHubId: null,
  filtroStatus: null,
  setFiltroCidade: (id) => set({ filtroCidadeId: id }),
  setFiltroHub: (id) => set({ filtroHubId: id }),
  setFiltroStatus: (s) => set({ filtroStatus: s }),
}));
