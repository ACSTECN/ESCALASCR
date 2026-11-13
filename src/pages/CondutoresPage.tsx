import { useEffect, useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Search, Phone, Upload, FileText, CheckSquare, Square, X, Download } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { dbCondutores, dbCidades, dbHubs, dbRotasFixas } from '@/lib/db';
import { toCSV, downloadFile } from '@/utils';
import type { Condutor, Cidade, Hub, RotaFixa } from '@/types';
import { useAuthStore } from '@/store/auth';
import { canWrite } from '@/store/auth';
import * as XLSX from 'xlsx';

// Lê o arquivo respeitando a codificação real. CSV gerado pelo Excel em português
// costuma vir em Windows-1252; ler como UTF-8 produziria acentos corrompidos.
const decodificarBuffer = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
};

// Status do condutor. "desistencia" é marcado manualmente pela operação e nunca
// é sobrescrito pela importação da base (na planilha ele aparece como Ativo).
const STATUS_CONDUTOR_OPCOES = [
  { value: 'ativo', label: 'Ativo' },
  { value: 'inativo', label: 'Inativo' },
  { value: 'desistencia', label: 'Desistência' },
];

const statusCondutorLabel = (status: string) =>
  STATUS_CONDUTOR_OPCOES.find((o) => o.value === status)?.label || status;

const statusCondutorVariant = (status: string): 'success' | 'danger' | 'gray' =>
  status === 'ativo' ? 'success' : status === 'desistencia' ? 'danger' : 'gray';

export function CondutoresPage() {
  const user = useAuthStore((s) => s.user);
  const canEdit = canWrite(user?.perfil);

  const [condutores, setCondutores] = useState<Condutor[]>([]);
  const [cidades, setCidades] = useState<Cidade[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [rotas, setRotas] = useState<RotaFixa[]>([]);
  const [search, setSearch] = useState('');
  const [filtroCidade, setFiltroCidade] = useState('');
  const [filtroHub, setFiltroHub] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Condutor | null>(null);
  const [form, setForm] = useState({
    nome_completo: '',
    cpf: '',
    telefone: '',
    cidade_id: '',
    hub_id: '',
    rota_fixa_id: '',
    status: 'ativo',
    observacoes: '',
  });

  const [deleteTarget, setDeleteTarget] = useState<Condutor | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Seleção múltipla
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  // Importação em lote
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importCidade, setImportCidade] = useState('');
  const [importHub, setImportHub] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    total: number;
    imported: number;
    updated: number;
    ignorados: number;
    preservados: number;
    errors: string[];
  } | null>(null);
  const [importMapping, setImportMapping] = useState({
    nome: '',
    cpf: '',
    telefone: '',
    celular: '',
    cliente: '',
    tipo: '',
    consulta: '',
    ativo: '',
    situacaoCadastro: '',
  });

  const loadData = async () => {
    setLoading(true);
    const [c, cid, h, r] = await Promise.all([
      dbCondutores.list(search),
      dbCidades.listAtivas(),
      dbHubs.listAtivos(),
      dbRotasFixas.listAtivas(),
    ]);
    setCondutores((c.data as Condutor[]) || []);
    setCidades((cid.data as Cidade[]) || []);
    setHubs((h.data as Hub[]) || []);
    setRotas((r.data as RotaFixa[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [search]);

  const hubsFiltro = filtroCidade ? hubs.filter((h) => h.cidade_id === filtroCidade) : hubs;

  const condutoresFiltrados = useMemo(() => {
    return condutores.filter((c) => {
      if (filtroCidade && c.cidade_id !== filtroCidade) return false;
      if (filtroHub && c.hub_id !== filtroHub) return false;
      if (filtroStatus && c.status !== filtroStatus) return false;
      return true;
    });
  }, [condutores, filtroCidade, filtroHub, filtroStatus]);

  const exportarCondutores = () => {
    const cidadeMap = new Map(cidades.map((c) => [c.id, c.nome]));
    const hubMap = new Map(hubs.map((h) => [h.id, h.sigla]));
    const rotaMap = new Map(rotas.map((r) => [r.id, r.sigla]));
    const linhas = condutoresFiltrados.map((c) => ({
      'Nome': c.nome_completo,
      'Rota': c.rota_fixa?.sigla || rotaMap.get(c.rota_fixa_id || '') || '',
      'CPF': c.cpf || '',
      'Telefone': c.telefone || '',
      'Cidade': cidadeMap.get(c.cidade_id || '') || '',
      'HUB': hubMap.get(c.hub_id || '') || '',
      'Status': statusCondutorLabel(c.status),
      'Observações': c.observacoes || '',
    }));
    downloadFile(toCSV(linhas), `condutores_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const openModal = (cd?: Condutor) => {
    setEditing(cd || null);
    setForm(
      cd
        ? {
            nome_completo: cd.nome_completo,
            cpf: cd.cpf || '',
            telefone: cd.telefone || '',
            cidade_id: cd.cidade_id || '',
            hub_id: cd.hub_id || '',
            rota_fixa_id: cd.rota_fixa_id || '',
            status: cd.status,
            observacoes: cd.observacoes || '',
          }
        : { nome_completo: '', cpf: '', telefone: '', cidade_id: '', hub_id: '', rota_fixa_id: '', status: 'ativo', observacoes: '' }
    );
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.nome_completo.trim()) return;
    const onlyDigits = (s: string) => s.replace(/\D/g, '');
    const payload = {
      ...form,
      nome_completo: form.nome_completo.trim(),
      cpf: onlyDigits(form.cpf) || null,
      telefone: form.telefone.trim() || null,
      cidade_id: form.cidade_id || null,
      hub_id: form.hub_id || null,
      rota_fixa_id: form.rota_fixa_id || null,
      observacoes: form.observacoes.trim() || null,
    };
    if (editing) {
      const { error } = await dbCondutores.update(editing.id, payload);
      if (error) {
        alert(`Não foi possível salvar: ${error.message}`);
        return;
      }
    } else {
      const { error } = await dbCondutores.create(payload);
      if (error) {
        alert(`Não foi possível salvar: ${error.message}`);
        return;
      }
    }
    setModalOpen(false);
    loadData();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await dbCondutores.remove(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    loadData();
  };

  const toggleSelect = (id: string, index?: number, shiftKey = false) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);

      if (shiftKey && lastSelectedIndex !== null && index !== undefined) {
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        for (let i = start; i <= end; i++) {
          next.add(condutoresFiltrados[i].id);
        }
        return next;
      }

      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

    if (index !== undefined) {
      setLastSelectedIndex(index);
    }
  };

  const selectAll = () => {
    if (condutoresFiltrados.length > 0 && condutoresFiltrados.every((c) => selectedIds.has(c.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(condutoresFiltrados.map((c) => c.id)));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setLastSelectedIndex(null);
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await dbCondutores.remove(id);
    }
    setDeleting(false);
    setConfirmDeleteAll(false);
    exitSelectionMode();
    loadData();
  };

  const normalizarNome = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const nomePrimeiroSegundo = (value: string) =>
    normalizarNome(value)
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .join(' ');

  const parseDelimitedLine = (line: string, delimiter: string) => {
    if (delimiter === '\t') return line.split('\t').map((part) => part.trim());

    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
        continue;
      }

      current += char;
    }

    result.push(current.trim());
    return result;
  };

  const parseImportSource = (text: string) => {
    const vazio = {
      rows: [] as string[][],
      dataRows: [] as string[][],
      headers: [] as string[],
      hasHeader: false,
      autoMapping: {
        nome: '',
        cpf: '',
        telefone: '',
        celular: '',
        cliente: '',
        tipo: '',
        consulta: '',
        ativo: '',
        situacaoCadastro: '',
      },
    };

    let linhas = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
    if (linhas.length === 0) return vazio;

    // Excel pode gravar "sep=;" na primeira linha para declarar o separador.
    let delimitadorDeclarado = '';
    const separadorDeclarado = linhas[0].match(/^sep=(.)\s*$/i);
    if (separadorDeclarado) {
      delimitadorDeclarado = separadorDeclarado[1];
      linhas = linhas.slice(1).filter((l) => l.trim());
      if (linhas.length === 0) return vazio;
    }

    // Conta ocorrências em várias linhas: usar só a primeira linha erra quando
    // há campos com vírgula ou ponto e vírgula no meio.
    const detectarDelimitador = (amostra: string[]) => {
      const candidatos = ['\t', ';', ',', '|'];
      let melhor = '\t';
      let melhorTotal = 0;
      candidatos.forEach((candidato) => {
        const total = amostra.reduce(
          (acc, linha) => acc + (linha.split(candidato).length - 1),
          0
        );
        if (total > melhorTotal) {
          melhorTotal = total;
          melhor = candidato;
        }
      });
      return melhorTotal > 0 ? melhor : '\t';
    };

    const delimiter = delimitadorDeclarado || detectarDelimitador(linhas.slice(0, 5));
    const rows = linhas.map((linha) => parseDelimitedLine(linha, delimiter));
    const normalizarCabecalho = (s: string) => normalizarNome(s).replace(/[^a-z0-9]/g, '');
    const aliases: Record<string, string[]> = {
      nome: ['nome', 'nomecompleto', 'motorista', 'condutor', 'entregador'],
      cpf: ['cpf', 'cpfcnpj', 'documento'],
      telefone: ['telefone', 'fone', 'telefonecelular', 'contato', 'whatsapp'],
      celular: ['celular', 'movel'],
      cliente: ['cliente', 'empresa', 'transportadora'],
      tipo: ['tipo', 'cargo', 'funcao', 'vinculo'],
      consulta: ['consulta', 'validade', 'vencimento'],
      ativo: ['ativo', 'status'],
      situacaoCadastro: ['situacaocadastro', 'situacao'],
    };

    const firstRow = rows[0] || [];
    const normalizedHeaders = firstRow.map((value) => normalizarCabecalho(value));
    const hasHeader = normalizedHeaders.some((header) =>
      Object.values(aliases).some((group) => group.some((alias) => header.includes(alias)))
    );
    const findHeaderIndex = (key: keyof typeof aliases) =>
      normalizedHeaders.findIndex((header) =>
        aliases[key].some((alias) => header.includes(alias))
      );

    const defaultExcelMapping = {
      nome: '0',
      cpf: firstRow.length > 1 ? '1' : '',
      telefone: firstRow.length > 2 ? '2' : '',
      celular: '',
      cliente: '',
      tipo: '',
      consulta: '',
      ativo: '',
      situacaoCadastro: '',
    };

    const headerMapping = Object.fromEntries(
      (Object.keys(aliases) as Array<keyof typeof aliases>).map((key) => {
        const index = findHeaderIndex(key);
        return [key, index >= 0 ? String(index) : ''];
      })
    );

    return {
      rows,
      dataRows: hasHeader ? rows.slice(1) : rows,
      headers: hasHeader
        ? firstRow
        : (rows[0] || []).map((_, index) => `Coluna ${String.fromCharCode(65 + index)}`),
      hasHeader,
      autoMapping: (hasHeader ? headerMapping : defaultExcelMapping) as typeof importMapping,
    };
  };

  const importPreview = useMemo(() => parseImportSource(importText), [importText]);

  useEffect(() => {
    setImportMapping(importPreview.autoMapping);
    setImportResult(null);
  }, [importPreview.autoMapping]);

  const parseImportText = () => {
    const linhas = importPreview.dataRows;
    const registros: Array<{
      nome: string;
      cpf: string;
      telefone: string;
      status: string;
      observacoes: string;
      hubId: string;
      cliente: string;
    }> = [];
    const errors: string[] = [];
    const soDigitos = (s: string) => s.replace(/\D/g, '');
    const limparTelefone = (s: string) => {
      const digits = soDigitos(s);
      return digits.length === 10 || digits.length === 11 ? digits : '';
    };

    const getByMap = (row: string[], key: keyof typeof importMapping) => {
      const value = importMapping[key];
      if (value === '') return '';
      const index = Number(value);
      return Number.isNaN(index) ? '' : row[index] || '';
    };

    // A coluna "Ativo" costuma vir sempre "Ativo"; o status real está em
    // "Situação Cadastro" (ex.: Doc. Pendente / Cadastro não realizado).
    const resolverStatus = (situacao: string, ativo: string) => {
      const situacaoNormalizada = normalizarNome(situacao);
      if (situacaoNormalizada) {
        if (situacaoNormalizada.includes('inativo')) return 'inativo';
        if (situacaoNormalizada.includes('ativo')) return 'ativo';
        return 'inativo';
      }
      return normalizarNome(ativo).includes('inativo') ? 'inativo' : 'ativo';
    };

    const siglaPorHub = new Map<string, Hub>();
    hubs.forEach((hub) => {
      const chave = normalizarNome(hub.sigla || '').replace(/[^a-z0-9]/g, '');
      if (chave) siglaPorHub.set(chave, hub);
    });

    // Na base da Magalog a sigla do HUB vai no fim da coluna Cliente.
    const detectarHubId = (cliente: string) => {
      const tokens = normalizarNome(cliente).split(/[^a-z0-9]+/).filter(Boolean);
      for (let i = tokens.length - 1; i >= Math.max(0, tokens.length - 4); i--) {
        const hub = siglaPorHub.get(tokens[i]);
        if (hub) return hub.id;
      }
      return '';
    };

    let ignorados = 0;

    linhas.forEach((partes, index) => {
      const linhaAtual = index + 1;

      const cliente = getByMap(partes, 'cliente').trim();
      const tipo = getByMap(partes, 'tipo').trim();

      // Regra do projeto: funcionário não motorista não entra na base de entregadores.
      if (normalizarNome(tipo).includes('nao motorista')) {
        ignorados++;
        return;
      }

      const nome = (getByMap(partes, 'nome') || partes[0] || '').trim();
      const cpfBruto = soDigitos(getByMap(partes, 'cpf'));
      const cpf = cpfBruto.length === 11 ? cpfBruto : '';
      const telefone =
        limparTelefone(getByMap(partes, 'telefone')) || limparTelefone(getByMap(partes, 'celular'));
      const status = resolverStatus(getByMap(partes, 'situacaoCadastro'), getByMap(partes, 'ativo'));

      const observacoes = [
        cliente ? `Cliente: ${cliente}` : '',
        tipo ? `Tipo: ${tipo}` : '',
        getByMap(partes, 'consulta') ? `Consulta: ${getByMap(partes, 'consulta')}` : '',
        getByMap(partes, 'situacaoCadastro')
          ? `Situação cadastro: ${getByMap(partes, 'situacaoCadastro')}`
          : '',
      ]
        .filter(Boolean)
        .join(' | ');

      if (!nome) {
        errors.push(`Linha ${linhaAtual}: nome não identificado.`);
        return;
      }

      registros.push({
        nome,
        cpf,
        telefone,
        status,
        observacoes,
        hubId: detectarHubId(cliente) || importHub,
        cliente,
      });
    });

    return { total: importPreview.rows.length, registros, errors, ignorados };
  };

  const importParsed = useMemo(
    () => parseImportText(),
    [importPreview, importMapping, importHub, hubs]
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const extensao = (file.name.split('.').pop() || '').toLowerCase();
    setImportResult(null);

    try {
      if (extensao === 'xlsx' || extensao === 'xls') {
        // Excel binário: o SheetJS já entrega o texto pronto, sem erro de acento.
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          defval: '',
          raw: false,
          blankrows: false,
        });
        const texto = rows
          .map((linha) =>
            (linha || [])
              .map((celula) => String(celula ?? '').replace(/[\t\r\n]+/g, ' ').trim())
              .join('\t')
          )
          .join('\n');
        setImportText(texto);
      } else {
        const buffer = await file.arrayBuffer();
        setImportText(decodificarBuffer(buffer));
      }
    } catch {
      setImportResult({
        total: 0,
        imported: 0,
        updated: 0,
        ignorados: 0,
        preservados: 0,
        errors: ['Não foi possível ler o arquivo. Tente salvar como .xlsx ou colar os dados na caixa abaixo.'],
      });
    }

    e.target.value = '';
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    setImportResult(null);

    const parsed = importParsed;
    if (parsed.registros.length === 0) {
      setImportResult({
        total: parsed.total,
        imported: 0,
        updated: 0,
        ignorados: parsed.ignorados,
        preservados: 0,
        errors: parsed.errors.length > 0
          ? parsed.errors
          : ['Nenhum registro válido encontrado. Você pode colar a planilha inteira do Excel.'],
      });
      setImporting(false);
      return;
    }

    const { data: existentesData } = await dbCondutores.list();
    const existentes = (existentesData as Condutor[]) || [];
    const existentesMap = new Map<string, Condutor>();
    const existentesPorNome = new Map<string, Condutor>();
    const existentesPorCpf = new Map<string, Condutor>();
    const existentesPorNomeCurto = new Map<string, Condutor[]>();

    const registrarCondutor = (cd: Condutor) => {
      const nomeNormalizado = normalizarNome(cd.nome_completo || '');
      const cpfNormalizado = (cd.cpf || '').replace(/\D/g, '');
      const nomeCurto = nomePrimeiroSegundo(cd.nome_completo || '');

      existentesMap.set(`${nomeNormalizado}::${cpfNormalizado}`, cd);
      if (nomeNormalizado) existentesPorNome.set(nomeNormalizado, cd);
      if (cpfNormalizado) existentesPorCpf.set(cpfNormalizado, cd);
      if (nomeCurto) {
        const lista = existentesPorNomeCurto.get(nomeCurto) || [];
        if (!lista.some((item) => item.id === cd.id)) {
          lista.push(cd);
          existentesPorNomeCurto.set(nomeCurto, lista);
        }
      }
    };

    existentes.forEach(registrarCondutor);

    let imported = 0;
    let updated = 0;
    let preservados = 0;
    const errors = [...parsed.errors];

    for (const item of parsed.registros) {
      const key = `${normalizarNome(item.nome)}::${item.cpf}`;
      const nomeNormalizado = normalizarNome(item.nome);
      const nomeCurto = nomePrimeiroSegundo(item.nome);

      let existente = existentesMap.get(key);

      if (!existente && item.cpf) {
        existente = existentesPorCpf.get(item.cpf);
      }

      if (!existente) {
        existente = existentesPorNome.get(nomeNormalizado);
      }

      if (!existente && nomeCurto) {
        const candidatos = (existentesPorNomeCurto.get(nomeCurto) || []).filter(Boolean);
        if (candidatos.length === 1) {
          existente = candidatos[0];
        } else if (candidatos.length > 1) {
          errors.push(`${item.nome}: duplicidade potencial por primeiro e segundo nome. Revise manualmente.`);
          continue;
        }
      }

      if (existente) {
        const updateData: Partial<Condutor> = {};

        if (item.cpf && !existente.cpf) updateData.cpf = item.cpf;
        if (item.telefone && !existente.telefone) updateData.telefone = item.telefone;
        if (importCidade && !existente.cidade_id) updateData.cidade_id = importCidade;
        if (item.hubId && !existente.hub_id) updateData.hub_id = item.hubId;
        if (item.observacoes && !existente.observacoes) updateData.observacoes = item.observacoes;

        // Desistência é decisão da operação: a planilha mostra "Ativo", mas o
        // status definido no sistema é mantido e não é reativado.
        const desistente = existente.status === 'desistencia';
        if (desistente) {
          if (item.status === 'ativo') preservados++;
        } else if (existente.status !== item.status) {
          updateData.status = item.status;
        }

        if (Object.keys(updateData).length > 0) {
          const { data: atualizado, error } = await dbCondutores.update(existente.id, updateData);
          if (error) {
            errors.push(`${item.nome}: ${error.message}`);
            continue;
          }
          registrarCondutor({ ...existente, ...(atualizado as Condutor), ...updateData });
          updated++;
        }
        continue;
      }

      const { data: criado, error } = await dbCondutores.create({
        nome_completo: item.nome,
        cpf: item.cpf || null,
        telefone: item.telefone || null,
        cidade_id: importCidade || null,
        hub_id: item.hubId || null,
        status: item.status || 'ativo',
        observacoes: item.observacoes || null,
      });

      if (error) {
        errors.push(`${item.nome}: ${error.message}`);
        continue;
      }

      if (criado) {
        registrarCondutor(criado as Condutor);
        imported++;
      }
    }

    setImportResult({
      total: parsed.total,
      imported,
      updated,
      ignorados: parsed.ignorados,
      preservados,
      errors,
    });
    setImportText('');
    loadData();
    setImporting(false);
  };

  const hubsByCidade = form.cidade_id ? hubs.filter((h) => h.cidade_id === form.cidade_id) : hubs;
  const hubsImportByCidade = importCidade ? hubs.filter((h) => h.cidade_id === importCidade) : hubs;

  return (
    <div>
      <PageHeader
        title="Condutores"
        description="Cadastro e gestão de condutores"
        actions={
          <>
            <button className="btn-secondary" onClick={exportarCondutores}>
              <Download size={16} /> Exportar
            </button>
            {canEdit && (
              <>
                <button
                  className="btn-secondary"
                  onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
                >
                  {selectionMode ? <X size={16} /> : <CheckSquare size={16} />}
                  {selectionMode ? 'Cancelar' : 'Selecionar'}
                </button>
                <button className="btn-secondary" onClick={() => setImportOpen(true)}>
                  <Upload size={16} /> Importar base
                </button>
                <button className="btn-primary" onClick={() => openModal()}>
                  <Plus size={16} /> Novo Condutor
                </button>
              </>
            )}
          </>
        }
      />

      {/* Busca + Filtros */}
      <div className="card p-4 mb-5">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            className="input pl-10"
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="label">Cidade</label>
            <select
              className="input"
              value={filtroCidade}
              onChange={(e) => { setFiltroCidade(e.target.value); setFiltroHub(''); }}
            >
              <option value="">Todas as cidades</option>
              {cidades.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="label">HUB</label>
            <select
              className="input"
              value={filtroHub}
              onChange={(e) => setFiltroHub(e.target.value)}
            >
              <option value="">Todos os HUBs</option>
              {hubsFiltro.map((h) => <option key={h.id} value={h.id}>{h.sigla}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select
              className="input"
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
            >
              <option value="">Todos os status</option>
              {STATUS_CONDUTOR_OPCOES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
        {(filtroCidade || filtroHub || filtroStatus) && (
          <button
            className="text-xs text-blue-600 hover:underline mt-2"
            onClick={() => { setFiltroCidade(''); setFiltroHub(''); setFiltroStatus(''); }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Lista */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Carregando...</div>
        ) : condutoresFiltrados.length === 0 ? (
          <EmptyState title="Nenhum condutor" description="Cadastre o primeiro condutor" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                <tr>
                  {selectionMode && (
                    <th className="px-3 py-3 w-10">
                      <button onClick={selectAll} title="Selecionar todos">
                        {condutoresFiltrados.length > 0 && condutoresFiltrados.every((c) => selectedIds.has(c.id)) ? (
                          <CheckSquare size={18} className="text-brand-600" />
                        ) : (
                          <Square size={18} className="text-slate-400" />
                        )}
                      </button>
                    </th>
                  )}
                  <th className="text-left px-5 py-3">Condutor</th>
                  <th className="text-left px-5 py-3">CPF</th>
                  <th className="text-left px-5 py-3">Telefone</th>
                  <th className="text-left px-5 py-3">Cidade</th>
                  <th className="text-left px-5 py-3">HUB</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-right px-5 py-3">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {condutoresFiltrados.map((cd, index) => (
                  <tr
                    key={cd.id}
                    className={`hover:bg-slate-50 ${selectedIds.has(cd.id) ? 'bg-blue-50' : ''} ${selectionMode ? 'cursor-pointer' : ''}`}
                    onClick={selectionMode ? (e) => toggleSelect(cd.id, index, e.shiftKey) : undefined}
                  >
                    {selectionMode && (
                      <td className="px-3 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelect(cd.id, index, e.shiftKey);
                          }}
                        >
                          {selectedIds.has(cd.id) ? (
                            <CheckSquare size={18} className="text-brand-600" />
                          ) : (
                            <Square size={18} className="text-slate-400" />
                          )}
                        </button>
                      </td>
                    )}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold text-sm">
                          {cd.nome_completo.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-slate-800 flex items-center gap-2">
                            {cd.nome_completo}
                            {cd.rota_fixa?.sigla && (
                              <span className="badge bg-cyan-100 text-cyan-800" title="Rota fixa">
                                {cd.rota_fixa.sigla}
                              </span>
                            )}
                            {cd.is_demo && <Badge variant="warning">DEMO</Badge>}
                          </div>
                          {cd.observacoes && <div className="text-xs text-slate-500">{cd.observacoes}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600 font-mono text-xs">{cd.cpf ? cd.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '—'}</td>
                    <td className="px-5 py-3 text-slate-600 flex items-center gap-1">
                      <Phone size={13} /> {cd.telefone || '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{cd.cidade?.nome || '—'}</td>
                    <td className="px-5 py-3 text-slate-600">{cd.hub?.sigla || '—'}</td>
                    <td className="px-5 py-3">
                      <Badge variant={statusCondutorVariant(cd.status)}>{statusCondutorLabel(cd.status)}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <>
                            <button className="btn-ghost p-1.5" onClick={(e) => { e.stopPropagation(); openModal(cd); }}>
                              <Pencil size={16} />
                            </button>
                            <button className="btn-ghost p-1.5 text-red-500" onClick={(e) => { e.stopPropagation(); setDeleteTarget(cd); }}>
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Condutor' : 'Novo Condutor'}>
        <div className="space-y-4">
          <div>
            <label className="label">Nome completo</label>
            <input
              className="input"
              value={form.nome_completo}
              onChange={(e) => setForm({ ...form, nome_completo: e.target.value })}
              placeholder="Nome do condutor"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">CPF</label>
              <input
                className="input"
                value={form.cpf}
                onChange={(e) => setForm({ ...form, cpf: e.target.value.replace(/\D/g, '') })}
                placeholder="000.000.000-00"
                maxLength={11}
              />
            </div>
            <div>
              <label className="label">Telefone</label>
              <input
                className="input"
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                placeholder="(11) 99999-9999"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Cidade</label>
              <select
                className="input"
                value={form.cidade_id}
                onChange={(e) => setForm({ ...form, cidade_id: e.target.value, hub_id: '' })}
              >
                <option value="">Selecione...</option>
                {cidades.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">HUB principal</label>
              <select
                className="input"
                value={form.hub_id}
                onChange={(e) => setForm({ ...form, hub_id: e.target.value })}
              >
                <option value="">Selecione...</option>
                {hubsByCidade.map((h) => (
                  <option key={h.id} value={h.id}>{h.sigla}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Status</label>
              <select
                className="input"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
                <option value="desistencia">Desistência</option>
              </select>
            </div>
            <div>
              <label className="label">Rota fixa</label>
              <select
                className="input"
                value={form.rota_fixa_id}
                onChange={(e) => setForm({ ...form, rota_fixa_id: e.target.value })}
              >
                <option value="">Sem rota fixa</option>
                {rotas.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.sigla}{r.nome ? ` — ${r.nome}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Observações</label>
            <textarea
              className="input"
              rows={2}
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              placeholder="Observações..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" onClick={save}>Salvar</button>
          </div>
        </div>
      </Modal>

      {/* Modal Importação em Lote */}
      <Modal open={importOpen} onClose={() => { setImportOpen(false); setImportResult(null); setImportText(''); }} title="Importar base de entregadores" size="lg">
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            <p className="font-medium mb-1">Como usar:</p>
            <p>Suba a planilha em <strong>.xlsx</strong>, <strong>.csv</strong> ou <strong>.txt</strong>, ou cole os dados na caixa abaixo. A codificação do arquivo é tratada automaticamente, então acentos não vêm mais corrompidos.</p>
            <p className="mt-1">O sistema identifica as colunas sozinho e mostra uma <strong>prévia</strong> do que será importado. Se algo vier errado, ajuste o mapeamento abaixo antes de importar.</p>
            <p className="mt-1">O status é lido da coluna <strong>Situação Cadastro</strong>: "Ativo" fica ativo; "Doc. Pendente" e "Cadastro não realizado" ficam inativos. Tipo <strong>FUNCIONÁRIO NÃO MOTORISTA</strong> é ignorado.</p>
            <p className="mt-1">Quem estiver marcado como <strong>Desistência</strong> no sistema <strong>não é reativado</strong> pela planilha, mesmo que nela apareça como Ativo.</p>
            <p className="mt-1">O HUB de cada linha é identificado pela sigla no fim da coluna <strong>Cliente</strong>.</p>
            <p className="mt-1">Duplicidade é verificada por <strong>CPF</strong>, <strong>nome completo</strong> e também por <strong>primeiro + segundo nome</strong>. Só o nome é obrigatório.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Cidade (opcional)</label>
              <select className="input" value={importCidade} onChange={(e) => { setImportCidade(e.target.value); setImportHub(''); }}>
                <option value="">Todas</option>
                {cidades.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="label">HUB padrão (opcional)</label>
              <select className="input" value={importHub} onChange={(e) => setImportHub(e.target.value)}>
                <option value="">Usar o da planilha</option>
                {hubsImportByCidade.map((h) => <option key={h.id} value={h.id}>{h.sigla}</option>)}
              </select>
              <p className="text-xs text-slate-500 mt-1">Só é usado quando a planilha não indicar o HUB da linha.</p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Lista de condutores</label>
              <label className="flex items-center gap-1 text-xs text-blue-600 cursor-pointer hover:underline">
                <FileText size={14} />
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                Subir planilha (.xlsx, .csv ou .txt)
              </label>
            </div>
            <textarea
              className="input font-mono text-xs"
              rows={8}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={`Cliente\tNome\tCPF\tSenha\tTelefone\tCelular\tTipo\tConsulta\tAtivo\t\tSituação Cadastro\nGFL - CR LOGISTICS ENTREGAS RAPIDAS LTDA HCPQ\tJOAO DA SILVA\t12345678900\t123456\t(11)90000-0000\t(11)98888-7777\tAGREGADO\t25/05/2027\tAtivo\t\tAtivo`}
            />
          </div>

          {importPreview.headers.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
              <div>
                <p className="text-sm font-medium text-slate-700">Mapeamento das colunas</p>
                <p className="text-xs text-slate-500">
                  Se a leitura automática vier errada, escolha manualmente as colunas antes de importar.
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ['nome', 'Nome'],
                  ['cpf', 'CPF'],
                  ['telefone', 'Telefone'],
                  ['celular', 'Celular (alternativo)'],
                  ['cliente', 'Cliente'],
                  ['tipo', 'Tipo'],
                  ['consulta', 'Consulta'],
                  ['ativo', 'Ativo'],
                  ['situacaoCadastro', 'Situação Cadastro'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="label">{label}</label>
                    <select
                      className="input"
                      value={importMapping[key as keyof typeof importMapping]}
                      onChange={(e) =>
                        setImportMapping((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                    >
                      <option value="">Ignorar</option>
                      {importPreview.headers.map((header, index) => (
                        <option key={`${key}-${index}`} value={String(index)}>
                          {header || `Coluna ${index + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {importParsed.registros.length > 0 && (
            <div className="rounded-xl border border-slate-200 p-3 space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="font-medium text-slate-700">Prévia do que será importado</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {importPreview.rows.length} linha(s) lida(s)
                </span>
                <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                  {importParsed.registros.length} pronta(s)
                </span>
                <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  {importParsed.registros.filter((r) => r.status === 'inativo').length} inativa(s)
                </span>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {importParsed.registros.filter((r) => !r.hubId).length} sem HUB
                </span>
                {importParsed.ignorados > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {importParsed.ignorados} ignorada(s) (não motorista)
                  </span>
                )}
                {importParsed.errors.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                    {importParsed.errors.length} com problema
                  </span>
                )}
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">Nome</th>
                      <th className="text-left font-medium px-3 py-2">CPF</th>
                      <th className="text-left font-medium px-3 py-2">Telefone</th>
                      <th className="text-left font-medium px-3 py-2">HUB</th>
                      <th className="text-left font-medium px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importParsed.registros.slice(0, 8).map((registro, index) => (
                      <tr key={`${registro.nome}-${index}`} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-slate-700">{registro.nome}</td>
                        <td className="px-3 py-1.5 font-mono text-slate-500">{registro.cpf || '—'}</td>
                        <td className="px-3 py-1.5 font-mono text-slate-500">{registro.telefone || '—'}</td>
                        <td className="px-3 py-1.5 text-slate-500">
                          {hubs.find((h) => h.id === registro.hubId)?.sigla || '—'}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={registro.status === 'ativo' ? 'text-green-700' : 'text-amber-700'}>
                            {registro.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importParsed.registros.length > 8 && (
                <p className="text-xs text-slate-500">
                  Mostrando as 8 primeiras linhas de {importParsed.registros.length}. Todas serão importadas.
                </p>
              )}
            </div>
          )}

          {importResult && (
            <div className={`p-3 rounded-lg text-sm ${(importResult.imported > 0 || importResult.updated > 0 || importResult.preservados > 0) ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {(importResult.imported > 0 || importResult.updated > 0 || importResult.preservados > 0) ? (
                <div className="space-y-1">
                  <p>✅ {importResult.imported} condutor(es) novo(s) importado(s)</p>
                  <p>🔄 {importResult.updated} condutor(es) já existentes atualizado(s)</p>
                  {importResult.ignorados > 0 && (
                    <p>⏭️ {importResult.ignorados} linha(s) ignorada(s) (não motorista)</p>
                  )}
                  {importResult.preservados > 0 && (
                    <p>🚫 {importResult.preservados} mantido(s) como Desistência (não reativado(s))</p>
                  )}
                  <p className="text-xs">Total lido: {importResult.total}</p>
                </div>
              ) : null}
              {importResult.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  {importResult.errors.map((e, i) => <p key={i}>❌ {e}</p>)}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={() => { setImportOpen(false); setImportResult(null); setImportText(''); }}>
              {importResult && (importResult.imported > 0 || importResult.updated > 0 || importResult.preservados > 0) ? 'Fechar' : 'Cancelar'}
            </button>
            {(!importResult || (importResult.imported === 0 && importResult.updated === 0 && importResult.preservados === 0)) && (
              <button className="btn-primary" onClick={handleImport} disabled={!importText.trim() || importing}>
                {importing ? 'Importando...' : 'Importar'}
              </button>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Excluir condutor"
        message={`Cuidado: deseja excluir ${deleteTarget?.nome_completo}? Essa exclusão é manual e definitiva.`}
        confirmLabel="Excluir"
        loading={deleting}
      />

      <ConfirmDialog
        open={confirmDeleteAll}
        onClose={() => setConfirmDeleteAll(false)}
        onConfirm={deleteSelected}
        title="Excluir condutores"
        message={`Cuidado: deseja excluir ${selectedIds.size} condutor(es) selecionado(s)? Essa exclusão é manual e definitiva.`}
        confirmLabel="Excluir todos"
        loading={deleting}
      />

      {selectionMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white rounded-2xl shadow-2xl border border-slate-200 px-5 py-3 flex items-center gap-4">
          <button
            className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-brand-600"
            onClick={selectAll}
          >
            {condutoresFiltrados.length > 0 && condutoresFiltrados.every((c) => selectedIds.has(c.id)) ? (
              <CheckSquare size={18} className="text-brand-600" />
            ) : (
              <Square size={18} />
            )}
            Selecionar todos
          </button>
          <button
            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700"
            onClick={() => setSelectedIds(new Set())}
          >
            Limpar seleção
          </button>
          <span className="text-sm text-slate-500">
            {selectedIds.size} condutor(es) selecionado(s)
          </span>
          <span className="text-xs text-slate-400 hidden md:inline">
            Dica: clique nas linhas ou use Shift para selecionar um intervalo.
          </span>
          <button
            className="btn-danger flex items-center gap-1 disabled:opacity-50"
            onClick={() => setConfirmDeleteAll(true)}
            disabled={selectedIds.size === 0}
          >
            <Trash2 size={16} /> Excluir
          </button>
        </div>
      )}
    </div>
  );
}
