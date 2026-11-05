import { useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  ArrowLeft,
  Ticket,
  UserPlus,
} from 'lucide-react';
import { dbEntregador } from '@/lib/db';
import type { EntregadorAgenda, EntregadorSlot } from '@/types';
import { DIAS_SEMANA } from '@/types';
import { formatDateBR } from '@/utils';
import { BrandLogo } from '@/components/ui/BrandLogo';

const maskCpf = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

const maskTelefone = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

const diaSemanaDe = (data: string) => DIAS_SEMANA[new Date(data + 'T00:00:00').getDay()];

export function InteresseEntregadorPage() {
  const [idNome, setIdNome] = useState('');
  const [idCpf, setIdCpf] = useState('');
  const [idTelefone, setIdTelefone] = useState('');
  const [consultando, setConsultando] = useState(false);
  const [erroId, setErroId] = useState('');
  const [agenda, setAgenda] = useState<EntregadorAgenda | null>(null);
  const [acaoEm, setAcaoEm] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const porData = useMemo(() => {
    const map = new Map<string, EntregadorSlot[]>();
    for (const s of agenda?.slots || []) {
      const arr = map.get(s.data_coleta) || [];
      arr.push(s);
      map.set(s.data_coleta, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [agenda]);

  const consultar = async () => {
    setErroId('');
    setFeedback(null);
    if (idCpf.replace(/\D/g, '').length !== 11) return setErroId('Informe um CPF válido (11 dígitos).');
    if (idNome.trim().length < 3) return setErroId('Informe o nome completo.');

    setConsultando(true);
    const { data: res, error } = await dbEntregador.agenda(
      idNome.trim(),
      idCpf.replace(/\D/g, ''),
      idTelefone.trim()
    );
    setConsultando(false);

    if (error) {
      setErroId('Não foi possível consultar agora. Tente novamente.');
      return;
    }

    const resultado = res as EntregadorAgenda;
    if (!resultado?.encontrado) {
      setAgenda(null);
      if (resultado?.motivo === 'cpf_invalido') setErroId('CPF inválido.');
      else setErroId('Não encontramos seu cadastro. Fale com a operação para ser incluído em um grupo.');
      return;
    }

    setAgenda(resultado);
  };

  const pegarVaga = async (slot: EntregadorSlot) => {
    setAcaoEm(slot.coleta_id);
    setFeedback(null);
    const { data: res, error } = await dbEntregador.agendar(idCpf.replace(/\D/g, ''), slot.coleta_id);
    setAcaoEm(null);

    const resultado = res as { ok: boolean; motivo: string } | null;
    if (error) {
      setFeedback({ tipo: 'erro', texto: 'Não foi possível concluir agora. Tente novamente.' });
      return;
    }

    if (resultado?.ok) {
      setAgenda((prev) =>
        prev
          ? {
              ...prev,
              slots: (prev.slots || []).map((s) =>
                s.coleta_id === slot.coleta_id ? { ...s, agendado: true } : s
              ),
            }
          : prev
      );
      setFeedback({
        tipo: 'ok',
        texto: `Agendado em ${formatDateBR(slot.data_coleta)} · ${slot.horario}.`,
      });
      return;
    }

    switch (resultado?.motivo) {
      case 'sem_vaga':
        setAgenda((prev) =>
          prev
            ? {
                ...prev,
                slots: (prev.slots || []).map((s) =>
                  s.coleta_id === slot.coleta_id ? { ...s, disponivel: false } : s
                ),
              }
            : prev
        );
        setFeedback({ tipo: 'erro', texto: 'As vagas acabaram. Você pode entrar na lista de espera.' });
        break;
      case 'ja_agendado':
        setAgenda((prev) =>
          prev
            ? {
                ...prev,
                slots: (prev.slots || []).map((s) =>
                  s.coleta_id === slot.coleta_id ? { ...s, agendado: true } : s
                ),
              }
            : prev
        );
        setFeedback({ tipo: 'erro', texto: 'Você já está agendado neste dia.' });
        break;
      case 'nao_elegivel':
        setFeedback({ tipo: 'erro', texto: 'Este dia não está liberado para você.' });
        break;
      default:
        setFeedback({ tipo: 'erro', texto: 'Não foi possível pegar a vaga. Tente novamente.' });
    }
  };

  const entrarListaEspera = async (slot: EntregadorSlot) => {
    setAcaoEm(slot.coleta_id);
    setFeedback(null);
    const { data: res, error } = await dbEntregador.listaEspera(
      idNome.trim(),
      idCpf.replace(/\D/g, ''),
      idTelefone.trim(),
      slot.coleta_id
    );
    setAcaoEm(null);

    const resultado = res as { ok: boolean; motivo: string } | null;
    if (error) {
      setFeedback({ tipo: 'erro', texto: 'Não foi possível entrar na lista de espera. Tente novamente.' });
      return;
    }

    if (resultado?.ok) {
      setAgenda((prev) =>
        prev
          ? {
              ...prev,
              slots: (prev.slots || []).map((s) =>
                s.coleta_id === slot.coleta_id ? { ...s, disponivel: false, na_lista_espera: true } : s
              ),
            }
          : prev
      );
      setFeedback({
        tipo: 'ok',
        texto: `Você entrou na lista de espera para ${formatDateBR(slot.data_coleta)} · ${slot.horario}.`,
      });
    } else if (resultado?.motivo === 'ja_na_lista') {
      setAgenda((prev) =>
        prev
          ? {
              ...prev,
              slots: (prev.slots || []).map((s) =>
                s.coleta_id === slot.coleta_id ? { ...s, disponivel: false, na_lista_espera: true } : s
              ),
            }
          : prev
      );
      setFeedback({ tipo: 'erro', texto: 'Você já está na lista de espera para este dia.' });
    } else {
      setFeedback({ tipo: 'erro', texto: 'Não foi possível entrar na lista de espera.' });
    }
  };

  const reiniciar = () => {
    setAgenda(null);
    setFeedback(null);
    setErroId('');
  };

  return (
    <div className="min-h-screen tech-surface flex items-center justify-center p-4 lg:p-8">
      <div className="grid w-full max-w-7xl items-center gap-6 lg:grid-cols-[1fr_1.05fr]">
        <section className="tech-hero relative hidden overflow-hidden rounded-[32px] border border-white/10 p-10 text-white shadow-[0_30px_90px_rgba(2,6,23,0.32)] lg:block">
          <div className="absolute inset-0 tech-grid opacity-20" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div>
              <BrandLogo light subtitle="Interesse em Coletas" />
              <h1 className="mt-10 max-w-xl text-4xl font-black leading-tight tracking-[0.08em] text-white">
                Veja os dias liberados e garanta sua vaga.
              </h1>
              <p className="mt-4 max-w-xl text-base text-slate-300">
                Identifique-se com seu CPF para ver os dias liberados para você. Ao pegar, a vaga é
                sua na hora.
              </p>
            </div>

            <div className="grid gap-4">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <div className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">Disponibilidade</div>
                <div className="mt-2 text-sm text-slate-200">
                  Você vê apenas se está disponível. A quantidade de vagas é controlada pela operação.
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <div className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">Sem vaga?</div>
                <div className="mt-2 text-sm text-slate-200">
                  Se o dia lotar, você pode entrar na lista de espera direto por aqui.
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="w-full">
          <div className="mb-8 flex justify-center lg:hidden">
            <BrandLogo light subtitle="Interesse em Coletas" />
          </div>

          <div className="tech-panel overflow-hidden">
            {agenda ? (
              // ============================================================
              // RESULTADO: DIAS LIBERADOS
              // ============================================================
              <>
                <div className="flex items-center justify-between border-b border-slate-200 px-6 pt-6 pb-4">
                  <div className="min-w-0">
                    <h1 className="text-lg font-bold text-slate-900 truncate">
                      Olá, {agenda.condutor?.nome?.split(' ')[0] || 'entregador'}
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                      Estes são os dias liberados para você.
                    </p>
                  </div>
                  <button className="btn-ghost" onClick={reiniciar}>
                    <ArrowLeft size={16} /> Trocar
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  {feedback && (
                    <div
                      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                        feedback.tipo === 'ok'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-amber-200 bg-amber-50 text-amber-800'
                      }`}
                    >
                      {feedback.tipo === 'ok' ? (
                        <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
                      ) : (
                        <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                      )}
                      <span>{feedback.texto}</span>
                    </div>
                  )}

                  {porData.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
                      <p className="text-sm text-slate-600">Sem agendas disponiveis.</p>
                    </div>
                  ) : (
                    porData.map(([dia, slots]) => (
                      <div key={dia} className="rounded-2xl border border-slate-200 overflow-hidden">
                        <div className="flex items-center gap-2 bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                          <CalendarDays size={16} className="text-brand-600" />
                          <span className="font-semibold text-slate-800">{diaSemanaDe(dia)}</span>
                          <span className="text-slate-500">{formatDateBR(dia)}</span>
                          <span className="ml-auto rounded-md bg-slate-200/70 px-2 py-0.5 text-xs font-medium text-slate-600">
                            {slots[0]?.hub_sigla}
                          </span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {slots.map((slot) => {
                            const processando = acaoEm === slot.coleta_id;
                            return (
                              <div
                                key={slot.coleta_id}
                                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500">
                                    <Clock size={16} />
                                  </span>
                                  <div>
                                    <span className="font-semibold text-slate-800">{slot.horario}</span>
                                    <span className="block text-xs text-slate-500">{slot.hub_nome}</span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  {slot.agendado ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                                      <CheckCircle2 size={14} /> Você já está agendado
                                    </span>
                                  ) : slot.disponivel ? (
                                    <button
                                      className="btn-primary !py-1.5 !px-4 text-xs inline-flex items-center gap-1.5"
                                      disabled={processando}
                                      onClick={() => pegarVaga(slot)}
                                    >
                                      {processando ? (
                                        <Loader2 size={14} className="animate-spin" />
                                      ) : (
                                        <Ticket size={14} />
                                      )}
                                      Pegar vaga
                                    </button>
                                  ) : (
                                    <div className="flex flex-col items-end gap-2">
                                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-right">
                                        <div className="text-xs font-semibold text-amber-800">
                                          Sem vagas para o turno
                                        </div>
                                        <div className="mt-0.5 text-[11px] text-amber-700">
                                          Entre na fila e a operação chama você se abrir vaga.
                                        </div>
                                      </div>
                                      {slot.na_lista_espera ? (
                                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                                          <CheckCircle2 size={14} /> Você já está na fila
                                        </span>
                                      ) : (
                                        <button
                                          className="btn-secondary !py-1.5 !px-3 text-xs inline-flex items-center gap-1.5"
                                          disabled={processando}
                                          onClick={() => entrarListaEspera(slot)}
                                        >
                                          {processando ? (
                                            <Loader2 size={14} className="animate-spin" />
                                          ) : (
                                            <UserPlus size={14} />
                                          )}
                                          Entrar na fila
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              // ============================================================
              // IDENTIFICACAO
              // ============================================================
              <>
                <div className="px-6 pt-6 pb-4 border-b border-slate-200">
                  <h1 className="text-lg font-bold text-slate-900">Ver minhas vagas</h1>
                  <p className="text-sm text-slate-500 mt-1">
                    Informe seu nome, CPF e telefone para ver os dias liberados para você.
                  </p>
                </div>

                <div className="p-6 space-y-4">
                  <div>
                    <label className="label">Nome completo *</label>
                    <input
                      className="input"
                      value={idNome}
                      onChange={(e) => setIdNome(e.target.value)}
                      placeholder="Seu nome completo"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">CPF *</label>
                      <input
                        className="input"
                        value={idCpf}
                        onChange={(e) => setIdCpf(maskCpf(e.target.value))}
                        placeholder="000.000.000-00"
                        inputMode="numeric"
                      />
                    </div>
                    <div>
                      <label className="label">Telefone</label>
                      <input
                        className="input"
                        value={idTelefone}
                        onChange={(e) => setIdTelefone(maskTelefone(e.target.value))}
                        placeholder="(00) 00000-0000"
                        inputMode="numeric"
                      />
                    </div>
                  </div>

                  {erroId && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                      <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                      <span>{erroId}</span>
                    </div>
                  )}

                  <button className="btn-primary w-full" onClick={consultar} disabled={consultando}>
                    {consultando ? (
                      <><Loader2 size={16} className="animate-spin" /> Consultando...</>
                    ) : (
                      'Ver minhas vagas'
                    )}
                  </button>
                </div>
              </>
            )}
          </div>

          <p className="text-center text-xs text-slate-400 mt-4">Escalas CR · Gestão de Coletas</p>
        </div>
      </div>
    </div>
  );
}
