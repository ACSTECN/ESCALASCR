import { useEffect, useState } from 'react';
import { CalendarDays, MapPin, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { dbCidades, dbHubs, dbInteresses } from '@/lib/db';
import type { Cidade, Hub } from '@/types';
import { DIAS_SEMANA } from '@/types';

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

const hoje = () => new Date().toISOString().slice(0, 10);

export function InteresseEntregadorPage() {
  const [cidades, setCidades] = useState<Cidade[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [loading, setLoading] = useState(true);

  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cidadeId, setCidadeId] = useState('');
  const [hubId, setHubId] = useState('');
  const [data, setData] = useState('');

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState<{ hub: Hub; data: string } | null>(null);

  useEffect(() => {
    (async () => {
      const [c, h] = await Promise.all([dbCidades.listAtivas(), dbHubs.listAtivos()]);
      setCidades((c.data as Cidade[]) || []);
      setHubs((h.data as Hub[]) || []);
      setLoading(false);
    })();
  }, []);

  const hubsFiltrados = cidadeId ? hubs.filter((h) => h.cidade_id === cidadeId) : hubs;

  const salvar = async () => {
    setErro('');
    if (nome.trim().length < 3) return setErro('Informe o nome completo.');
    if (cpf.replace(/\D/g, '').length !== 11) return setErro('Informe um CPF válido (11 dígitos).');
    if (!hubId) return setErro('Selecione o HUB onde quer fazer coleta.');
    if (!data) return setErro('Selecione o dia de interesse.');
    if (data < hoje()) return setErro('A data não pode ser anterior a hoje.');

    setSalvando(true);
    const { error } = await dbInteresses.create({
      nome: nome.trim(),
      cpf: cpf.replace(/\D/g, ''),
      telefone: telefone.trim() || null,
      hub_id: hubId,
      data_interesse: data,
      status: 'pendente',
    });
    setSalvando(false);

    if (error) {
      if (error.code === '23505' || error.message.toLowerCase().includes('duplicate')) {
        setErro('Você já registrou interesse neste HUB para esta data.');
      } else {
        setErro('Não foi possível registrar o interesse. Tente novamente.');
      }
      return;
    }

    const hub = hubs.find((h) => h.id === hubId)!;
    setSucesso({ hub, data });
  };

  const novoInteresse = () => {
    setSucesso(null);
    setNome('');
    setCpf('');
    setTelefone('');
    setCidadeId('');
    setHubId('');
    setData('');
    setErro('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-brand-600 flex items-center justify-center font-bold text-white text-lg">
            E
          </div>
          <div className="text-white">
            <div className="font-bold leading-tight">Escalas CR</div>
            <div className="text-xs text-slate-300">Interesse em Coletas</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {sucesso ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="text-emerald-600" size={32} />
              </div>
              <h2 className="text-xl font-bold text-slate-800">Interesse registrado!</h2>
              <p className="text-sm text-slate-500 mt-2">
                Você demonstrou interesse em fazer coleta em:
              </p>
              <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4 text-left space-y-2">
                <div className="flex items-center gap-2 text-slate-700">
                  <MapPin size={16} className="text-brand-600" />
                  <span className="font-semibold">{sucesso.hub.sigla}</span>
                  <span className="text-slate-500">{sucesso.hub.nome}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <CalendarDays size={16} className="text-brand-600" />
                  <span>
                    {new Date(sucesso.data + 'T00:00:00').toLocaleDateString('pt-BR')} ·{' '}
                    {DIAS_SEMANA[new Date(sucesso.data + 'T00:00:00').getDay()]}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-4">
                Sua solicitação foi enviada para nossa equipe. Compareça no HUB no dia informado.
              </p>
              <button className="btn-primary w-full mt-6" onClick={novoInteresse}>
                Registrar outro interesse
              </button>
            </div>
          ) : (
            <>
              <div className="px-6 pt-6 pb-4 border-b border-slate-100">
                <h1 className="text-lg font-bold text-slate-800">Quero fazer coleta</h1>
                <p className="text-sm text-slate-500 mt-1">
                  Preencha seus dados e escolha o HUB e o dia em que você tem interesse em trabalhar.
                </p>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="label">Nome completo *</label>
                  <input
                    className="input"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Seu nome completo"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">CPF *</label>
                    <input
                      className="input"
                      value={cpf}
                      onChange={(e) => setCpf(maskCpf(e.target.value))}
                      placeholder="000.000.000-00"
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <label className="label">Telefone</label>
                    <input
                      className="input"
                      value={telefone}
                      onChange={(e) => setTelefone(maskTelefone(e.target.value))}
                      placeholder="(00) 00000-0000"
                      inputMode="numeric"
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Cidade</label>
                  <select
                    className="input"
                    value={cidadeId}
                    onChange={(e) => {
                      setCidadeId(e.target.value);
                      setHubId('');
                    }}
                  >
                    <option value="">Todas as cidades</option>
                    {cidades.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">HUB onde quer fazer coleta *</label>
                  <select className="input" value={hubId} onChange={(e) => setHubId(e.target.value)} disabled={loading}>
                    <option value="">{loading ? 'Carregando...' : 'Selecione o HUB...'}</option>
                    {hubsFiltrados.map((h) => (
                      <option key={h.id} value={h.id}>{h.sigla} — {h.nome}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">Dia de interesse *</label>
                  <input
                    type="date"
                    className="input"
                    min={hoje()}
                    value={data}
                    onChange={(e) => setData(e.target.value)}
                  />
                  {data && (
                    <p className="text-xs text-slate-500 mt-1">
                      {DIAS_SEMANA[new Date(data + 'T00:00:00').getDay()]}
                    </p>
                  )}
                </div>

                {erro && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>{erro}</span>
                  </div>
                )}

                <button className="btn-primary w-full" onClick={salvar} disabled={salvando}>
                  {salvando ? (
                    <><Loader2 size={16} className="animate-spin" /> Enviando...</>
                  ) : (
                    'Confirmar interesse'
                  )}
                </button>

                <p className="text-xs text-slate-400 text-center">
                  Confirme apenas os dias em que você realmente tem disponibilidade.
                </p>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          Escalas CR · Gestão de Coletas
        </p>
      </div>
    </div>
  );
}
