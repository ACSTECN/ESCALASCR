import { useEffect, useState } from 'react';
import { Save, Settings as SettingsIcon } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { dbConfig } from '@/lib/db';
import type { ThresholdsOcupacao } from '@/types';

const DEFAULT_THRESHOLDS: ThresholdsOcupacao = { vermelho: 70, amarelo: 100, verde: 100 };

export function ConfiguracoesPage() {
  const [thresholds, setThresholds] = useState<ThresholdsOcupacao>(DEFAULT_THRESHOLDS);
  const [intervalo, setIntervalo] = useState(60);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: t } = await dbConfig.get('thresholds_ocupacao');
      if (t?.valor) setThresholds(t.valor as ThresholdsOcupacao);
      const { data: i } = await dbConfig.get('intervalo_conflito_minutos');
      if (i?.valor) setIntervalo(Number(i.valor));
    })();
  }, []);

  const salvar = async () => {
    setSaving(true);
    await dbConfig.update('thresholds_ocupacao', thresholds);
    await dbConfig.update('intervalo_conflito_minutos', intervalo);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <PageHeader
        title="Configurações"
        description="Parâmetros do sistema"
        actions={
          <button className="btn-primary" onClick={salvar} disabled={saving}>
            <Save size={16} /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        }
      />

      {saved && (
        <div className="mb-4 p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-200">
          Configurações salvas com sucesso!
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <SettingsIcon size={18} className="text-slate-500" />
            <h2 className="font-semibold text-slate-800">Thresholds de ocupação</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Define as cores dos cartões de coleta com base no percentual de ocupação.
          </p>
          <div className="space-y-4">
            <div>
              <label className="label">Vermelho (abaixo de %)</label>
              <input
                type="number"
                className="input"
                value={thresholds.vermelho}
                onChange={(e) => setThresholds({ ...thresholds, vermelho: Number(e.target.value) })}
              />
              <p className="text-xs text-slate-400 mt-1">Abaixo deste valor = cartão vermelho</p>
            </div>
            <div>
              <label className="label">Amarelo (até %)</label>
              <input
                type="number"
                className="input"
                value={thresholds.amarelo}
                onChange={(e) => setThresholds({ ...thresholds, amarelo: Number(e.target.value) })}
              />
              <p className="text-xs text-slate-400 mt-1">Entre vermelho e este valor = cartão amarelo</p>
            </div>
            <div>
              <label className="label">Verde (a partir de %)</label>
              <input
                type="number"
                className="input"
                value={thresholds.verde}
                onChange={(e) => setThresholds({ ...thresholds, verde: Number(e.target.value) })}
              />
              <p className="text-xs text-slate-400 mt-1">Acima deste valor = cartão verde (meta atingida)</p>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <SettingsIcon size={18} className="text-slate-500" />
            <h2 className="font-semibold text-slate-800">Intervalo de conflito</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Intervalo mínimo (em minutos) entre coletas para considerar um agendamento como conflitante para o mesmo condutor.
          </p>
          <div>
            <label className="label">Minutos</label>
            <input
              type="number"
              className="input"
              value={intervalo}
              onChange={(e) => setIntervalo(Number(e.target.value))}
            />
            <p className="text-xs text-slate-400 mt-1">Ex: 60 = condutor não pode ter 2 coletas com menos de 60 min de diferença</p>
          </div>
        </div>
      </div>

      {/* Pré-visualização */}
      <div className="card p-5 mt-6">
        <h2 className="font-semibold text-slate-800 mb-4">Pré-visualização das cores</h2>
        <div className="flex flex-wrap gap-3">
          <div className="px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
            {`< ${thresholds.vermelho}% — Vermelho`}
          </div>
          <div className="px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium">
            {`${thresholds.vermelho}% – ${thresholds.amarelo}% — Amarelo`}
          </div>
          <div className="px-4 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium">
            {`≥ ${thresholds.verde}% — Verde (meta atingida)`}
          </div>
          <div className="px-4 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm font-medium">
            Em andamento
          </div>
          <div className="px-4 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-sm font-medium">
            Finalizada
          </div>
        </div>
      </div>
    </div>
  );
}
