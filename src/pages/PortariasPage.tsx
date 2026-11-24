import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, MapPin, Pencil, Plus, RefreshCw, Search, Upload, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { dbCondutores, dbPortarias } from '@/lib/db';
import type { Condutor, PortariaCondutor, TipoPortaria } from '@/types';

const PORTARIAS: { value: TipoPortaria; label: string; short: string }[] = [
  { value: 'belo_horizonte', label: 'Belo Horizonte', short: 'BH' },
  { value: 'guarulhos', label: 'Guarulhos', short: 'GRU' },
];

type PortariaDraft = Omit<PortariaCondutor, 'id' | 'created_at' | 'updated_at' | 'condutor'>;
type ParsedRow = Omit<PortariaDraft, 'portaria' | 'condutor_id'>;

const normalizar = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const soDigitos = (value: string) => value.replace(/\D/g, '');
const normalizarCabecalho = (value: string) => normalizar(value).replace(/[^a-z0-9]/g, '');

const decodificarBuffer = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
};

const parseDelimitedLine = (line: string, delimiter: string) => {
  const cells: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  cells.push(value.trim());
  return cells;
};

const parsePortaria = (text: string): { rows: ParsedRow[]; total: number; errors: string[] } => {
  let lines = text.replace(/\r\n?/g, '\n').split('\n').filter((line) => line.trim());
  const declared = lines[0]?.match(/^sep=(.)\s*$/i);
  const declaredDelimiter = declared?.[1] || '';
  if (declared) lines = lines.slice(1);
  if (lines.length === 0) return { rows: [], total: 0, errors: ['O arquivo está vazio.'] };

  const candidates = ['\t', ';', ',', '|'];
  const delimiter =
    declaredDelimiter ||
    candidates.reduce((best, candidate) => {
      const score = lines.slice(0, 5).reduce((sum, line) => sum + line.split(candidate).length - 1, 0);
      return score > best.score ? { delimiter: candidate, score } : best;
    }, { delimiter: '\t', score: 0 }).delimiter;
  const matrix = lines.map((line) => parseDelimitedLine(line, delimiter));
  const headers = (matrix[0] || []).map(normalizarCabecalho);
  const aliases: Record<keyof ParsedRow, string[]> = {
    nome: ['nome', 'nomemotorista', 'nomecompleto', 'motorista', 'condutor', 'entregador'],
    cpf: ['cpf', 'documento'],
    transportadora: ['transportadora', 'transportador', 'empresa'],
    local: ['local', 'localidade', 'unidade', 'base'],
    cargo: ['cargo', 'funcao'],
    agencia: ['agencia'],
    status: ['status', 'situacao', 'liberacao'],
    aprovacao: ['aprovacao', 'statusaprovacao'],
    data_envio: ['dataenvio', 'datadoenvio', 'datadoenv', 'dataenv', 'datadeenvio', 'envio'],
    observacoes: ['observacao', 'observacoes', 'obs'],
  };
  const columns = Object.fromEntries(
    (Object.keys(aliases) as (keyof ParsedRow)[]).map((key) => [
      key,
      headers.findIndex((header) => aliases[key].some((alias) => header.includes(alias))),
    ])
  ) as Record<keyof ParsedRow, number>;
  const hasHeader = columns.nome >= 0 || columns.cpf >= 0;
  if (!hasHeader) {
    return {
      rows: [],
      total: Math.max(matrix.length - 1, 0),
      errors: ['Não identifiquei as colunas Nome ou CPF. Mantenha o cabeçalho original da planilha.'],
    };
  }

  const get = (row: string[], key: keyof ParsedRow) =>
    columns[key] >= 0 ? (row[columns[key]] || '').trim() : '';
  const dataRows = matrix.slice(1);
  const errors: string[] = [];
  const rows = dataRows.flatMap((line, index) => {
    const nome = get(line, 'nome');
    const cpfDigits = soDigitos(get(line, 'cpf'));
    if (!nome && cpfDigits.length !== 11) return [];
    if (!nome) {
      errors.push(`Linha ${index + 2}: CPF sem nome; registro ignorado.`);
      return [];
    }
    return [{
      nome,
      cpf: cpfDigits.length === 11 ? cpfDigits : '',
      transportadora: get(line, 'transportadora'),
      local: get(line, 'local'),
      cargo: get(line, 'cargo'),
      agencia: get(line, 'agencia'),
      status: get(line, 'status'),
      aprovacao: get(line, 'aprovacao'),
      data_envio: get(line, 'data_envio'),
      observacoes: get(line, 'observacoes'),
    }];
  });
  return { rows, total: dataRows.length, errors };
};

const situacaoPortaria = (record: Pick<PortariaCondutor, 'status' | 'aprovacao'>) =>
  record.aprovacao?.trim() || record.status?.trim() || 'Sem status';

const badgeVariant = (value: string): 'success' | 'warning' | 'danger' | 'gray' => {
  const status = normalizar(value);
  if (status.includes('nao liberado') || status.includes('reprovado') || status.includes('bloqueado') || status.includes('negado')) {
    return 'danger';
  }
  if (status.includes('liberado') || status.includes('aprovado')) return 'success';
  if (status.includes('aguardando') || status.includes('pendente')) return 'warning';
  return 'gray';
};

const novoDraft = (portaria: TipoPortaria): PortariaDraft => ({
  portaria,
  condutor_id: null,
  nome: '',
  cpf: null,
  transportadora: null,
  local: null,
  cargo: null,
  agencia: null,
  status: null,
  aprovacao: null,
  data_envio: null,
  observacoes: null,
});

export function PortariasPage() {
  const [portaria, setPortaria] = useState<TipoPortaria>('belo_horizonte');
  const [records, setRecords] = useState<PortariaCondutor[]>([]);
  const [condutores, setCondutores] = useState<Condutor[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [relinking, setRelinking] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PortariaCondutor | null>(null);
  const [draft, setDraft] = useState<PortariaDraft>(novoDraft('belo_horizonte'));
  const [condutorBusca, setCondutorBusca] = useState('');
  const [vinculoManual, setVinculoManual] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    total: number;
    inseridos: number;
    atualizados: number;
    vinculados: number;
    semVinculo: number;
    duplicados: number;
    errors: string[];
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [portariasResult, condutoresResult] = await Promise.all([
      dbPortarias.listAll(portaria),
      dbCondutores.listAllForMatching(),
    ]);
    if (portariasResult.error) {
      alert(`Não foi possível carregar a portaria: ${portariasResult.error.message}`);
      setRecords([]);
    } else {
      setRecords((portariasResult.data as PortariaCondutor[]) || []);
    }
    if (condutoresResult.error) {
      alert(`Não foi possível carregar os condutores: ${condutoresResult.error.message}`);
      setCondutores([]);
    } else {
      setCondutores((condutoresResult.data as Condutor[]) || []);
    }
    setLoading(false);
  }, [portaria]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const condutoresPorCpf = useMemo(() => {
    const map = new Map<string, Condutor[]>();
    condutores.forEach((condutor) => {
      const cpf = soDigitos(condutor.cpf || '');
      if (cpf.length !== 11) return;
      const list = map.get(cpf) || [];
      list.push(condutor);
      map.set(cpf, list);
    });
    return map;
  }, [condutores]);

  const condutoresPorNome = useMemo(() => {
    const map = new Map<string, Condutor[]>();
    condutores.forEach((condutor) => {
      const nome = normalizar(condutor.nome_completo);
      if (!nome) return;
      const list = map.get(nome) || [];
      list.push(condutor);
      map.set(nome, list);
    });
    return map;
  }, [condutores]);

  const localizarCondutor = (nome: string, cpf: string) => {
    const cpfDigits = soDigitos(cpf);
    if (cpfDigits.length === 11) {
      const porCpf = condutoresPorCpf.get(cpfDigits) || [];
      if (porCpf.length === 1) return { condutor: porCpf[0], ambiguo: false };
      if (porCpf.length > 1) return { condutor: null, ambiguo: true };
    }
    const porNome = condutoresPorNome.get(normalizar(nome)) || [];
    if (porNome.length === 1) return { condutor: porNome[0], ambiguo: false };
    return { condutor: null, ambiguo: porNome.length > 1 };
  };

  const condutoresFiltrados = useMemo(() => {
    const termo = normalizar(condutorBusca);
    const cpfTermo = soDigitos(condutorBusca);
    const filtrados = condutores.filter((condutor) =>
      !termo ||
      normalizar(condutor.nome_completo).includes(termo) ||
      (cpfTermo.length > 0 && soDigitos(condutor.cpf || '').includes(cpfTermo))
    );
    const selecionado = condutores.find((condutor) => condutor.id === draft.condutor_id);
    if (selecionado && !filtrados.some((condutor) => condutor.id === selecionado.id)) {
      filtrados.unshift(selecionado);
    }
    return filtrados.slice(0, 100);
  }, [condutores, condutorBusca, draft.condutor_id]);

  const parsed = useMemo(() => parsePortaria(importText), [importText]);

  // Linhas repetidas no próprio arquivo (mesmo CPF ou mesmo nome normalizado).
  const duplicadosArquivo = useMemo(() => {
    const vistos = new Set<string>();
    let repetidos = 0;
    for (const row of parsed.rows) {
      const chave = row.cpf ? `cpf:${row.cpf}` : `nome:${normalizar(row.nome)}`;
      if (vistos.has(chave)) repetidos++;
      else vistos.add(chave);
    }
    return repetidos;
  }, [parsed]);
  const visibleRecords = useMemo(() => {
    const term = normalizar(search);
    if (!term) return records;
    return records.filter((record) =>
      normalizar([
        record.nome,
        record.cpf || '',
        record.transportadora || '',
        record.local || '',
        record.cargo || '',
        record.agencia || '',
        record.status || '',
        record.aprovacao || '',
      ].join(' ')).includes(term)
    );
  }, [records, search]);

  const liberarCount = records.filter((record) => badgeVariant(situacaoPortaria(record)) === 'success').length;
  const semVinculoCount = records.filter((record) => !record.condutor_id).length;

  const abrirCadastro = (record?: PortariaCondutor) => {
    setEditing(record || null);
    setCondutorBusca(record?.nome || '');
    setVinculoManual(false);
    setDraft(record ? {
      portaria: record.portaria,
      condutor_id: record.condutor_id,
      nome: record.nome,
      cpf: record.cpf,
      transportadora: record.transportadora,
      local: record.local,
      cargo: record.cargo,
      agencia: record.agencia,
      status: record.status,
      aprovacao: record.aprovacao,
      data_envio: record.data_envio,
      observacoes: record.observacoes,
    } : novoDraft(portaria));
    setFormOpen(true);
  };

  const salvarCadastro = async () => {
    const nome = draft.nome.trim();
    const cpfDigits = soDigitos(draft.cpf || '');
    if (!nome) {
      alert('Informe o nome do condutor.');
      return;
    }
    const match = localizarCondutor(nome, cpfDigits);
    const payload: PortariaDraft = {
      ...draft,
      portaria,
      nome,
      cpf: cpfDigits.length === 11 ? cpfDigits : null,
      condutor_id: vinculoManual
        ? draft.condutor_id
        : draft.condutor_id || match.condutor?.id || null,
    };
    setSaving(true);
    const result = editing
      ? await dbPortarias.update(editing.id, payload)
      : await dbPortarias.create(payload);
    setSaving(false);
    if (result.error) {
      alert(`Não foi possível salvar: ${result.error.message}`);
      return;
    }
    setFormOpen(false);
    await loadData();
  };

  const importar = async () => {
    if (!importText.trim() || importing) return;
    if (parsed.rows.length === 0) {
      setImportResult({
        total: parsed.total,
        inseridos: 0,
        atualizados: 0,
        vinculados: 0,
        semVinculo: 0,
        duplicados: 0,
        errors: parsed.errors.length ? parsed.errors : ['Nenhum registro válido encontrado.'],
      });
      return;
    }

    setImporting(true);
    setImportResult(null);
    const { data: existentesData, error: existentesError } = await dbPortarias.listAll(portaria);
    if (existentesError) {
      setImportResult({
        total: parsed.total,
        inseridos: 0,
        atualizados: 0,
        vinculados: 0,
        semVinculo: 0,
        duplicados: 0,
        errors: [existentesError.message],
      });
      setImporting(false);
      return;
    }

    const existentes = (existentesData as PortariaCondutor[]) || [];
    const errors = [...parsed.errors];
    const seen = new Set<string>();
    let inseridos = 0;
    let atualizados = 0;
    let vinculados = 0;
    let semVinculo = 0;
    let duplicados = 0;

    for (const row of parsed.rows) {
      const cpf = row.cpf || null;
      const chaveLinha = cpf ? `cpf:${cpf}` : `nome:${normalizar(row.nome)}`;
      if (seen.has(chaveLinha)) {
        duplicados++;
        errors.push(`${row.nome}: já aparece antes neste arquivo; a primeira ocorrência foi mantida.`);
        continue;
      }
      seen.add(chaveLinha);

      const match = localizarCondutor(row.nome, cpf || '');
      if (match.ambiguo) {
        errors.push(`${row.nome}: mais de um condutor corresponde ao CPF/nome; registro salvo sem vínculo para revisão.`);
      }
      const existente = existentes.find((item) =>
        (match.condutor && item.condutor_id === match.condutor.id) ||
        (cpf && soDigitos(item.cpf || '') === cpf) ||
        (!cpf && normalizar(item.nome) === normalizar(row.nome))
      );
      const valor = (incoming: string | null | undefined, old: string | null | undefined) =>
        incoming?.trim() || old || null;
      const payload: PortariaDraft = {
        portaria,
        condutor_id: match.condutor?.id || existente?.condutor_id || null,
        nome: row.nome,
        cpf: cpf || existente?.cpf || null,
        transportadora: valor(row.transportadora, existente?.transportadora),
        local: valor(row.local, existente?.local),
        cargo: valor(row.cargo, existente?.cargo),
        agencia: valor(row.agencia, existente?.agencia),
        status: valor(row.status, existente?.status),
        aprovacao: valor(row.aprovacao, existente?.aprovacao),
        data_envio: valor(row.data_envio, existente?.data_envio),
        observacoes: valor(row.observacoes, existente?.observacoes),
      };

      const result = existente
        ? await dbPortarias.update(existente.id, payload)
        : await dbPortarias.create(payload);
      if (result.error) {
        errors.push(`${row.nome}: ${result.error.message}`);
        continue;
      }
      if (existente) atualizados++;
      else inseridos++;
      if (payload.condutor_id) vinculados++;
      else semVinculo++;

      const saved = result.data as PortariaCondutor;
      const index = existentes.findIndex((item) => item.id === saved.id);
      if (index >= 0) existentes[index] = { ...existentes[index], ...saved, ...payload };
      else existentes.push({ ...saved, ...payload });
    }

    setImportResult({
      total: parsed.total,
      inseridos,
      atualizados,
      vinculados,
      semVinculo,
      duplicados,
      errors,
    });
    setImporting(false);
    await loadData();
  };

  const atualizarDePara = async () => {
    if (relinking) return;
    if (!window.confirm(
      'Atualizar vínculos de todas as portarias (Belo Horizonte e Guarulhos)?\n\n' +
      'O sistema tentará CPF e nome completo normalizado. Vínculos já existentes não serão alterados.'
    )) return;

    setRelinking(true);
    const [{ data: todosRegistros, error: portariasError }, { data: todosCondutores, error: condutoresError }] =
      await Promise.all([dbPortarias.listAll(), dbCondutores.listAllForMatching()]);
    if (portariasError || condutoresError) {
      setRelinking(false);
      alert(`Não foi possível carregar todos os dados para atualizar os vínculos: ${portariasError?.message || condutoresError?.message}`);
      return;
    }

    const pendentes = ((todosRegistros as PortariaCondutor[]) || []).filter((record) => !record.condutor_id);
    if (pendentes.length === 0) {
      setRelinking(false);
      await loadData();
      alert('Todos os registros das portarias de Belo Horizonte e Guarulhos já estão vinculados.');
      return;
    }

    const candidatos = (todosCondutores as unknown as Condutor[]) || [];
    setCondutores(candidatos);
    const porCpf = new Map<string, Condutor[]>();
    const porNome = new Map<string, Condutor[]>();
    candidatos.forEach((condutor) => {
      const cpf = soDigitos(condutor.cpf || '');
      if (cpf.length === 11) porCpf.set(cpf, [...(porCpf.get(cpf) || []), condutor]);
      const nome = normalizar(condutor.nome_completo);
      if (nome) porNome.set(nome, [...(porNome.get(nome) || []), condutor]);
    });
    const localizarEntreTodos = (nome: string, cpf: string) => {
      const cpfDigits = soDigitos(cpf);
      if (cpfDigits.length === 11) {
        const matchesCpf = porCpf.get(cpfDigits) || [];
        if (matchesCpf.length === 1) return { condutor: matchesCpf[0], ambiguo: false };
        if (matchesCpf.length > 1) return { condutor: null, ambiguo: true };
      }
      const matchesNome = porNome.get(normalizar(nome)) || [];
      if (matchesNome.length === 1) return { condutor: matchesNome[0], ambiguo: false };
      return { condutor: null, ambiguo: matchesNome.length > 1 };
    };
    let vinculados = 0;
    let ambiguos = 0;
    let semCorrespondencia = 0;
    const errors: string[] = [];
    const semCorrespondenciaNomes: string[] = [];

    for (const record of pendentes) {
      const match = localizarEntreTodos(record.nome, record.cpf || '');
      if (match.ambiguo) {
        ambiguos++;
        continue;
      }
      if (!match.condutor) {
        semCorrespondencia++;
        if (semCorrespondenciaNomes.length < 10) {
          semCorrespondenciaNomes.push(`${record.nome}${record.cpf ? ` (CPF ${record.cpf})` : ''}`);
        }
        continue;
      }

      const { error } = await dbPortarias.update(record.id, { condutor_id: match.condutor.id });
      if (error) {
        errors.push(`${record.nome}: ${error.message}`);
      } else {
        vinculados++;
      }
    }

    await loadData();
    setRelinking(false);
    alert(
      'Atualização geral de vínculos concluída.\n' +
      `${vinculados} vínculo(s) atualizado(s), ${ambiguos} ambíguo(s), ` +
      `${semCorrespondencia} sem correspondência e ${errors.length} erro(s).\n` +
      'Os vínculos que já existiam foram preservados.' +
      (semCorrespondenciaNomes.length ? `\n\nSem correspondência:\n${semCorrespondenciaNomes.join('\n')}` : '') +
      (errors.length ? `\n\nErros:\n${errors.slice(0, 5).join('\n')}` : '')
    );
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const extension = (file.name.split('.').pop() || '').toLowerCase();
      if (extension === 'xlsx' || extension === 'xls') {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          defval: '',
          raw: false,
          blankrows: false,
        });
        setImportText(matrix.map((row) => row.map((cell) => String(cell ?? '').replace(/[\t\r\n]+/g, ' ').trim()).join('\t')).join('\n'));
      } else {
        setImportText(decodificarBuffer(await file.arrayBuffer()));
      }
      setFileName(file.name);
      setImportResult(null);
    } catch {
      setImportResult({
        total: 0,
        inseridos: 0,
        atualizados: 0,
        vinculados: 0,
        semVinculo: 0,
        duplicados: 0,
        errors: ['Não foi possível ler o arquivo. Tente .xlsx, .xls, .csv ou .txt.'],
      });
    }
    event.target.value = '';
  };

  const abrirImportacao = () => {
    setImportText('');
    setFileName('');
    setImportResult(null);
    setImportOpen(true);
  };

  const portariaLabel = PORTARIAS.find((item) => item.value === portaria)?.label || '';

  return (
    <div>
      <PageHeader
        title="Portarias"
        description="Importe e mantenha as liberações de Belo Horizonte e Guarulhos vinculadas aos condutores."
        actions={
          <>
            <button
              className="btn-secondary"
              onClick={atualizarDePara}
              disabled={relinking || loading}
              title="Reavaliar os registros sem vínculo das duas portarias usando CPF e nome normalizado"
            >
              <RefreshCw size={16} className={relinking ? 'animate-spin' : ''} />
              {relinking ? 'Atualizando todas as portarias...' : 'Atualizar vínculos de todas as portarias'}
            </button>
            <button className="btn-secondary" onClick={abrirImportacao}>
              <Upload size={16} /> Importar planilha
            </button>
            <button className="btn-primary" onClick={() => abrirCadastro()}>
              <Plus size={16} /> Cadastro manual
            </button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {PORTARIAS.map((item) => (
          <button
            key={item.value}
            className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
              portaria === item.value
                ? 'border-cyan-300 bg-cyan-50 text-cyan-900 shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
            onClick={() => setPortaria(item.value)}
          >
            <MapPin size={15} className="mr-2 inline" />
            Portaria {item.label}
          </button>
        ))}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Registros</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{records.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Liberados / aprovados</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">{liberarCount}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sem vínculo com condutor</div>
          <div className="mt-1 text-2xl font-bold text-amber-700">{semVinculoCount}</div>
        </div>
      </div>

      <div className="card mb-4 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            className="input pl-10"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, CPF, status, agência ou transportadora..."
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Carregando portaria...</div>
        ) : visibleRecords.length === 0 ? (
          <EmptyState
            icon={<FileSpreadsheet size={32} />}
            title={`Nenhum registro na portaria ${portariaLabel}`}
            description="Importe a planilha ou cadastre uma liberação manualmente."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left">Condutor / CPF</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Dados operacionais</th>
                  <th className="px-4 py-3 text-left">Data de envio</th>
                  <th className="px-4 py-3 text-left">Vínculo</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRecords.map((record) => {
                  const situacao = situacaoPortaria(record);
                  return (
                    <tr key={record.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{record.condutor?.nome_completo || record.nome}</div>
                        <div className="font-mono text-xs text-slate-500">{record.cpf || record.condutor?.cpf || 'Sem CPF'}</div>
                      </td>
                      <td className="px-4 py-3"><Badge variant={badgeVariant(situacao)}>{situacao}</Badge></td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {[record.local, record.cargo, record.agencia, record.transportadora].filter(Boolean).join(' · ') || '—'}
                        {record.observacoes && <div className="mt-1 text-slate-400">{record.observacoes}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{record.data_envio || '—'}</td>
                      <td className="px-4 py-3">
                        {record.condutor_id
                          ? <Badge variant="success">Vinculado</Badge>
                          : <Badge variant="warning">Revisar vínculo</Badge>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          className="btn-ghost p-1.5"
                          onClick={() => abrirCadastro(record)}
                          title="Editar cadastro da portaria"
                        >
                          <Pencil size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Editar portaria' : `Cadastro manual · ${portariaLabel}`} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Nome do condutor *</label>
              <input className="input" value={draft.nome} onChange={(event) => setDraft({ ...draft, nome: event.target.value })} />
            </div>
            <div>
              <label className="label">CPF</label>
              <input className="input" inputMode="numeric" value={draft.cpf || ''} onChange={(event) => setDraft({ ...draft, cpf: soDigitos(event.target.value) || null })} placeholder="Somente números" />
            </div>
            <div>
              <label className="label">Status</label>
              <input className="input" value={draft.status || ''} onChange={(event) => setDraft({ ...draft, status: event.target.value || null })} placeholder="Ex.: LIBERADO" />
            </div>
            <div>
              <label className="label">Aprovação</label>
              <input className="input" value={draft.aprovacao || ''} onChange={(event) => setDraft({ ...draft, aprovacao: event.target.value || null })} placeholder="Ex.: AGUARDANDO" />
            </div>
            <div>
              <label className="label">Local</label>
              <input className="input" value={draft.local || ''} onChange={(event) => setDraft({ ...draft, local: event.target.value || null })} />
            </div>
            <div>
              <label className="label">Cargo</label>
              <input className="input" value={draft.cargo || ''} onChange={(event) => setDraft({ ...draft, cargo: event.target.value || null })} />
            </div>
            <div>
              <label className="label">Agência</label>
              <input className="input" value={draft.agencia || ''} onChange={(event) => setDraft({ ...draft, agencia: event.target.value || null })} />
            </div>
            <div>
              <label className="label">Transportadora</label>
              <input className="input" value={draft.transportadora || ''} onChange={(event) => setDraft({ ...draft, transportadora: event.target.value || null })} />
            </div>
            <div>
              <label className="label">Data de envio</label>
              <input className="input" value={draft.data_envio || ''} onChange={(event) => setDraft({ ...draft, data_envio: event.target.value || null })} placeholder="DD/MM ou DD/MM/AAAA" />
            </div>
            <div>
              <label className="label">Observações</label>
              <input className="input" value={draft.observacoes || ''} onChange={(event) => setDraft({ ...draft, observacoes: event.target.value || null })} />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <label className="label">Associar ao cadastro de um condutor</label>
            <input
              className="input mb-2"
              value={condutorBusca}
              onChange={(event) => setCondutorBusca(event.target.value)}
              placeholder="Buscar condutor por nome ou CPF..."
            />
            <select
              className="input"
              value={draft.condutor_id || ''}
              onChange={(event) => {
                setVinculoManual(true);
                setDraft({ ...draft, condutor_id: event.target.value || null });
              }}
            >
              <option value="">Salvar sem vínculo</option>
              {condutoresFiltrados.map((condutor) => (
                <option key={condutor.id} value={condutor.id}>
                  {condutor.nome_completo} · {condutor.cpf || 'Sem CPF'}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-500">
              {condutoresFiltrados.length === 0
                ? 'Nenhum condutor encontrado. Tente outro nome ou CPF.'
                : `Selecione a pessoa correta entre os resultados${condutoresFiltrados.length === 100 ? ' (mostrando até 100)' : ''}.`}
            </p>
          </div>
          <p className="text-xs text-slate-500">
            O vínculo automático usa CPF ou nome completo único. Se não encontrar, você pode associar manualmente pelo nome ou CPF acima.
          </p>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button className="btn-secondary" onClick={() => setFormOpen(false)}><X size={15} /> Cancelar</button>
            <button className="btn-primary" onClick={salvarCadastro} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title={`Importar planilha · ${portariaLabel}`} size="xl">
        <div className="space-y-4">
          <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-3 text-sm text-cyan-900">
            O layout é identificado pelos cabeçalhos. O sistema importa somente dados operacionais; RG, nascimento e dados dos pais não são armazenados. Quem não estiver no arquivo atualizado será preservado.
          </div>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm font-medium text-slate-700 hover:border-cyan-400 hover:bg-cyan-50">
            <Upload size={17} /> {fileName || 'Selecionar arquivo Excel ou CSV'}
            <input className="hidden" type="file" accept=".xlsx,.xls,.csv,.txt" onChange={handleFile} />
          </label>
          <div>
            <label className="label">Ou cole os dados da planilha</label>
            <textarea
              className="input min-h-32 font-mono text-xs"
              value={importText}
              onChange={(event) => { setImportText(event.target.value); setImportResult(null); }}
              placeholder="Cole aqui as linhas copiadas do Excel, incluindo o cabeçalho."
            />
          </div>
          {importText.trim() && (
            <div className="rounded-xl border border-slate-200">
              <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">
                Prévia: {parsed.rows.length} linha(s) reconhecida(s) de {parsed.total}
                {duplicadosArquivo > 0 && (
                  <span className="ml-2 font-normal text-amber-700">
                    · {duplicadosArquivo} repetida(s) no arquivo (serão ignoradas)
                  </span>
                )}
              </div>
              {parsed.errors.length > 0 && <div className="px-3 py-2 text-xs text-amber-700">{parsed.errors[0]}</div>}
              <div className="max-h-56 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Nome</th>
                      <th className="px-3 py-2 text-left">CPF</th>
                      <th className="px-3 py-2 text-left">Situação</th>
                      <th className="px-3 py-2 text-left">Vínculo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsed.rows.slice(0, 8).map((row, index) => {
                      const match = localizarCondutor(row.nome, row.cpf || '');
                      return (
                        <tr key={`${row.cpf}-${index}`}>
                          <td className="px-3 py-2">{row.nome}</td>
                          <td className="px-3 py-2 font-mono">{row.cpf || '—'}</td>
                          <td className="px-3 py-2">{row.aprovacao || row.status || '—'}</td>
                          <td className="px-3 py-2">{match.condutor ? match.condutor.nome_completo : match.ambiguo ? 'Ambíguo' : 'Sem vínculo'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {importResult && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <p><strong>{importResult.inseridos}</strong> novos · <strong>{importResult.atualizados}</strong> atualizados · <strong>{importResult.vinculados}</strong> vinculados · <strong>{importResult.semVinculo}</strong> sem vínculo{importResult.duplicados > 0 && <> · <strong>{importResult.duplicados}</strong> linha(s) repetida(s) no arquivo (ignoradas)</>}</p>
              {importResult.errors.length > 0 && (
                <div className="max-h-24 overflow-auto text-xs text-amber-800">
                  {importResult.errors.slice(0, 8).map((error, index) => <p key={index}>{error}</p>)}
                  {importResult.errors.length > 8 && <p>Mais {importResult.errors.length - 8} aviso(s).</p>}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button className="btn-secondary" onClick={() => setImportOpen(false)}><X size={15} /> Fechar</button>
            <button className="btn-primary" onClick={importar} disabled={!importText.trim() || importing}>
              {importing ? 'Importando...' : 'Importar registros'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
