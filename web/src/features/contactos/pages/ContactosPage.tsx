import { useEffect, useRef, useState } from 'react';
import { confirm } from '@/lib/confirm';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Contact, Search, Plus, Pencil, Trash2, FileText, History } from 'lucide-react';
import { DataTable, DataTableHead, DataTableBody, DataTableRow, DataTableEmpty } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { QueryError } from '@/components/ui/query-error';
import { toast } from '@/lib/toast';
import { useClientes } from '@/features/clientes/hooks/useClientes';
import { useEliminarContacto } from '../hooks/useContactoMutations';
import { useContactosGlobal } from '../hooks/useContactosGlobal';
import { ContactoFormModal } from '../components/ContactoFormModal';
import { ContactoHistorialDrawer } from '../components/ContactoHistorialDrawer';
import type { ContactoGlobal } from '../types';

const PAGE_SIZE = 50;

// Debounce helper
function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// Orden por columnas — mismo mecanismo que ClientesPage. El backend de
// contactos acepta params sort/dir (server-side sobre el conjunto filtrado
// completo, no solo la página): header clickeable + flecha ↑↓.
type SortCol = 'nombre' | 'empresa' | 'cargo';
type SortDir = 'asc' | 'desc';

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return dir === 'asc'
    ? <ChevronUp className="inline h-3 w-3 ml-0.5" />
    : <ChevronDown className="inline h-3 w-3 ml-0.5" />;
}

export function ContactosPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [empresaId, setEmpresaId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ContactoGlobal | null>(null);
  const [histContacto, setHistContacto] = useState<ContactoGlobal | null>(null);
  const [sort, setSort] = useState<SortCol | ''>('');
  const [dir, setDir] = useState<SortDir>('asc');

  const qDebounced = useDebounced(q);

  function toggleSort(col: SortCol) {
    if (sort === col) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(col);
      setDir('asc');
    }
    setPage(1);
  }

  // Reset page when filters change
  const prevFilters = useRef({ q: qDebounced, empresaId });
  useEffect(() => {
    if (prevFilters.current.q !== qDebounced || prevFilters.current.empresaId !== empresaId) {
      setPage(1);
      prevFilters.current = { q: qDebounced, empresaId };
    }
  }, [qDebounced, empresaId]);

  const { data, isLoading, isPlaceholderData, isError, error, refetch } = useContactosGlobal(
    qDebounced,
    empresaId,
    page,
    sort || null,
    dir,
  );
  // Empresas para el selector del filtro: carga 500 para llenar el dropdown completo
  const { data: empresas } = useClientes({ page: 1, q: '', pageSize: 500 });
  const contactos = data?.items ?? [];

  function onCotizar(c: ContactoGlobal) {
    navigate(`/spa/cotizador?cliente=${c.cliente_id}&contacto=${c.id}`);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Contact className="h-5 w-5 text-accent-glow" /> Contactos
          </span>
        }
        actions={
          <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo contacto
          </Button>
        }
      />

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 w-full sm:w-auto sm:min-w-[220px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, email o cargo…" className="pl-7" />
        </div>
        <select
          value={empresaId ?? ''}
          onChange={(e) => setEmpresaId(e.target.value ? parseInt(e.target.value, 10) : null)}
          className="w-full sm:w-auto h-9 text-sm rounded border border-border-strong bg-card px-2"
        >
          <option value="">Todas las empresas</option>
          {(empresas ?? []).map((c) => (<option key={c.id} value={c.id}>{c.nombre_empresa}</option>))}
        </select>
      </div>

      <DataTable maxBodyHeight="calc(100vh - 22rem)">
        <DataTableHead sticky>
          <tr>
            <th
              className="p-2 text-left cursor-pointer select-none hover:text-foreground"
              onClick={() => toggleSort('nombre')}
            >
              Contacto <SortIndicator active={sort === 'nombre'} dir={dir} />
            </th>
            <th
              className="p-2 text-left cursor-pointer select-none hover:text-foreground"
              onClick={() => toggleSort('empresa')}
            >
              Empresa <SortIndicator active={sort === 'empresa'} dir={dir} />
            </th>
            <th
              className="p-2 text-left cursor-pointer select-none hover:text-foreground"
              onClick={() => toggleSort('cargo')}
            >
              Cargo <SortIndicator active={sort === 'cargo'} dir={dir} />
            </th>
            <th className="p-2 text-left">Email</th>
            <th className="p-2 text-left">Teléfono</th>
            <th className="p-2 text-center w-40">Acciones</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {isLoading ? (
            <DataTableEmpty colSpan={6}>Cargando…</DataTableEmpty>
          ) : isError ? (
            <QueryError error={error} onRetry={() => void refetch()} asRow colSpan={6} />
          ) : contactos.length === 0 ? (
            <DataTableEmpty colSpan={6}>Sin contactos</DataTableEmpty>
          ) : (
            contactos.map((c) => (
              <DataTableRow key={c.id}>
                <td className="p-2">
                  <span className="font-medium text-foreground">{c.nombre}</span>
                  {c.es_principal && <Badge variant="cyan" className="ml-1">Principal</Badge>}
                </td>
                <td className="p-2">
                  <button type="button" onClick={() => setEmpresaId(c.cliente_id)} className="text-accent-glow hover:underline">{c.empresa_nombre}</button>
                </td>
                <td className="p-2 text-muted-foreground">{c.cargo || '—'}</td>
                <td className="p-2 text-muted-foreground truncate max-w-[160px]" title={c.email || ''}>{c.email || '—'}</td>
                <td className="p-2 text-muted-foreground">{c.telefono || '—'}</td>
                <td className="p-2">
                  <div className="flex items-center justify-center gap-1">
                    <button type="button" title="Cotizar" onClick={() => onCotizar(c)} className="p-1.5 rounded hover:bg-surface-2/60 text-accent-glow"><FileText className="h-4 w-4" /></button>
                    <button type="button" title="Historial" onClick={() => setHistContacto(c)} className="p-1.5 rounded hover:bg-surface-2/60 text-muted-foreground"><History className="h-4 w-4" /></button>
                    <button type="button" title="Editar" onClick={() => { setEditing(c); setFormOpen(true); }} className="p-1.5 rounded hover:bg-surface-2/60 text-muted-foreground"><Pencil className="h-4 w-4" /></button>
                    <DeleteContactoButton contacto={c} />
                  </div>
                </td>
              </DataTableRow>
            ))
          )}
        </DataTableBody>
      </DataTable>

      {/* Paginación */}
      {(page > 1 || contactos.length === PAGE_SIZE) && (
        <div className={`flex items-center justify-between text-sm text-muted-foreground ${isPlaceholderData ? 'opacity-50' : ''}`}>
          <Button variant="outline" size="sm" disabled={page <= 1 || isPlaceholderData} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
          </Button>
          <span>Página {page}{contactos.length === PAGE_SIZE ? ' — hay más registros' : ''}</span>
          <Button variant="outline" size="sm" disabled={contactos.length < PAGE_SIZE || isPlaceholderData} onClick={() => setPage((p) => p + 1)}>
            Siguiente <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      <ContactoFormModal key={editing?.id ?? 'new'} open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
      <ContactoHistorialDrawer contacto={histContacto} onClose={() => setHistContacto(null)} />
    </div>
  );
}

function DeleteContactoButton({ contacto }: { contacto: ContactoGlobal }) {
  const eliminar = useEliminarContacto(contacto.cliente_id);
  return (
    <button
      type="button"
      title="Eliminar"
      onClick={async () => {
        if (!(await confirm({ mensaje: `¿Eliminar a ${contacto.nombre}?`, tono: 'danger' }))) return;
        eliminar.mutate(contacto.id, {
          onSuccess: () => toast({ kind: 'success', title: 'Contacto eliminado' }),
          onError: () => toast({ kind: 'error', title: 'No se pudo eliminar' }),
        });
      }}
      className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-500"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
