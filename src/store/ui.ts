import { create } from 'zustand';

export type Tema = 'light' | 'dark';

const TEMA_KEY = 'escalas-cr:tema';
const NATAL_KEY = 'escalas-cr:natal';

const lerTemaSalvo = (): Tema => {
  if (typeof window === 'undefined') return 'light';
  try {
    return window.localStorage.getItem(TEMA_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

const dentroDoPeriodoNatalino = () => {
  const agora = new Date();
  const mes = agora.getMonth() + 1;
  const dia = agora.getDate();
  return mes === 12 || (mes === 1 && dia <= 6);
};

const lerNatalSalvo = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const salvo = window.localStorage.getItem(NATAL_KEY);
    if (salvo === 'true') return true;
    if (salvo === 'false') return false;
    // Sem preferencia salva: liga sozinho no periodo natalino (01/dez a 06/jan)
    return dentroDoPeriodoNatalino();
  } catch {
    return false;
  }
};

const aplicarTema = (tema: Tema) => {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', tema === 'dark');
  try {
    window.localStorage.setItem(TEMA_KEY, tema);
  } catch {
    // Ignora falhas de armazenamento (ex.: modo privado)
  }
};

const aplicarNatal = (ativo: boolean) => {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('natal', ativo);
  try {
    window.localStorage.setItem(NATAL_KEY, String(ativo));
  } catch {
    // Ignora falhas de armazenamento (ex.: modo privado)
  }
};

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (b: boolean) => void;

  // Tema claro / escuro
  tema: Tema;
  setTema: (tema: Tema) => void;
  toggleTema: () => void;

  // Tema natalino (acentos verdes/dourados + neve)
  natal: boolean;
  setNatal: (ativo: boolean) => void;
  toggleNatal: () => void;

  // Filtros do calendário
  filtroCidadeId: string | null;
  filtroHubId: string | null;
  filtroStatus: string | null;
  setFiltroCidade: (id: string | null) => void;
  setFiltroHub: (id: string | null) => void;
  setFiltroStatus: (s: string | null) => void;
}

const temaInicial = lerTemaSalvo();
aplicarTema(temaInicial);

const natalInicial = lerNatalSalvo();
aplicarNatal(natalInicial);

export const useUIStore = create<UIState>((set, get) => ({
  sidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (b) => set({ sidebarOpen: b }),

  tema: temaInicial,
  setTema: (tema) => {
    aplicarTema(tema);
    set({ tema });
  },
  toggleTema: () => get().setTema(get().tema === 'dark' ? 'light' : 'dark'),

  natal: natalInicial,
  setNatal: (ativo) => {
    aplicarNatal(ativo);
    set({ natal: ativo });
  },
  toggleNatal: () => get().setNatal(!get().natal),

  filtroCidadeId: null,
  filtroHubId: null,
  filtroStatus: null,
  setFiltroCidade: (id) => set({ filtroCidadeId: id }),
  setFiltroHub: (id) => set({ filtroHubId: id }),
  setFiltroStatus: (s) => set({ filtroStatus: s }),
}));
