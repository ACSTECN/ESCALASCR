// Tipos do banco de dados
export type PerfilUsuario = 'admin' | 'supervisor' | 'operador' | 'visualizador';

export type StatusAgendamento =
  | 'agendado'
  | 'confirmado'
  | 'compareceu'
  | 'ausente'
  | 'cancelado'
  | 'concluido';

export type StatusColeta = 'programada' | 'em_andamento' | 'finalizada' | 'cancelada';

export interface Cidade {
  id: string;
  nome: string;
  estado: string | null;
  ativo: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Hub {
  id: string;
  sigla: string;
  nome: string;
  cidade_id: string;
  ativo: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  // joined
  cidade?: Cidade;
}

export interface Condutor {
  id: string;
  nome_completo: string;
  cpf: string | null;
  telefone: string | null;
  fez_integracao: boolean | null;
  cidade_id: string | null;
  hub_id: string | null;
  status: string;
  observacoes: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  // joined
  cidade?: Cidade;
  hub?: Hub;
}

export interface Coleta {
  id: string;
  hub_id: string;
  data_coleta: string;
  horario: string;
  meta: number;
  status: StatusColeta;
  is_demo: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  hub?: Hub;
  agendamentos?: Agendamento[];
  // calculado
  agendados_count?: number;
  vagas_disponiveis?: number;
  ocupacao?: number;
}

export interface MetaColeta {
  id: string;
  hub_id: string;
  dia_semana: number;
  horario: string;
  meta: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  hub?: Hub;
}

export interface Agendamento {
  id: string;
  coleta_id: string;
  condutor_id: string;
  status: StatusAgendamento;
  is_demo: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  condutor?: Condutor;
  coleta?: Coleta;
}

export type StatusInteresse = 'pendente' | 'aprovado' | 'recusado';

export interface InteresseEntregador {
  id: string;
  nome: string;
  cpf: string;
  telefone: string | null;
  fez_integracao: boolean | null;
  hub_id: string;
  data_interesse: string;
  status: StatusInteresse;
  observacao: string | null;
  created_at: string;
  updated_at: string;
  // joined
  hub?: Hub;
}

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  cidade_id: string | null;
  ativo: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface HistoricoAlteracao {
  id: string;
  entidade: string;
  entidade_id: string | null;
  acao: 'create' | 'update' | 'delete';
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  usuario_id: string | null;
  created_at: string;
  usuario?: Usuario;
}

export interface Configuracao {
  id: string;
  chave: string;
  valor: unknown;
  descricao: string | null;
  updated_at: string;
}

export interface ThresholdsOcupacao {
  vermelho: number;
  amarelo: number;
  verde: number;
}

// Constantes auxiliares
export const DIAS_SEMANA = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

export const DIAS_SEMANA_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const STATUS_AGENDAMENTO_LABELS: Record<StatusAgendamento, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  compareceu: 'Compareceu',
  ausente: 'Ausente',
  cancelado: 'Cancelado',
  concluido: 'Concluído',
};

export const STATUS_COLETA_LABELS: Record<StatusColeta, string> = {
  programada: 'Programada',
  em_andamento: 'Em andamento',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
};

export const STATUS_INTERESSE_LABELS: Record<StatusInteresse, string> = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
};

export const PERFIL_LABELS: Record<PerfilUsuario, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  operador: 'Operador',
  visualizador: 'Visualizador',
};
