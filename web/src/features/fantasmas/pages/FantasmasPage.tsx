import { useEffect, useMemo, useRef, useState } from 'react';
import { confirm } from '@/lib/confirm';
import { fechaLocalISO } from '@/lib/fechas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, ChevronRight, Eye, Pen, ArrowUp, X, Ghost, FileSpreadsheet, Brush, Truck,
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { SatCombobox } from '@/components/ui/sat-combobox';
import {
  DataTable, DataTableBody, DataTableEmpty, DataTableHead, DataTableRow,
} from '@/components/ui/data-table';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useFantasmas } from '../hooks/useFantasmas';
import { useProveedores } from '../hooks/useProveedores';
import { PromoverModal } from '../components/PromoverModal';
import type {
  EstadoFantasma, Fantasma, FantasmaDetalle, FantasmaUpdatePayload, Moneda,
} from '../types';

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

const ESTADOS: { key: EstadoFantasma; label: string; variant: 'amber' | 'sky' | 'emerald' | 'violet' | 'slate' }[] = [
  { key: 'PENDIENTE', label: 'Pendientes', variant: 'amber' },
  { key: 'EN_OC', label: 'En OC', variant: 'sky' },
  { key: 'RECIBIDO', label: 'Recibidos', variant: 'emerald' },
  { key: 'PROMOVIDO', label: 'Promovidos', variant: 'violet' },
  { key: 'DESCARTADO', label: 'Descartados', variant: 'slate' },
];

function fmtMoney(n: number, m: string) {
  return `${m} $${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function FantasmasPage() {
  const [filtroQ, setFiltroQ] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoFantasma | ''>('PENDIENTE');
  const [filtroProveedor, setFiltroProveedor] = useState<string>('');
  const [filtroMoneda, setFiltroMoneda] = useState<Moneda | ''>('');
  const [page, setPage] = useState(1);
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());
  const [modalDetalle, setModalDetalle] = useState<number | null>(null);
  const [modalEditar, setModalEditar] = useState<Fantasma | null>(null);
  const [modalAsignar, setModalAsignar] = useState(false);
  const [promoverTarget, setPromoverTarget] = useState<Fantasma | null>(null);

  const filtroQDebounced = useDebounced(filtroQ);

  // Parse proveedor_id for server-side (null if sinAsignar or empty)
  const proveedorIdServer = filtroProveedor && filtroProveedor !== '__sin_asignar__'
    ? Number(filtroProveedor)
    : null;

  const { data: resp, isLoading, isPlaceholderData, error } = useFantasmas(
    page, filtroQDebounced, filtroEstado, proveedorIdServer,
  );
  const { data: proveedores } = useProveedores();
  const qc = useQueryClient();

  // 401 → login
  useEffect(() => {
    const status = (error as { status?: number } | undefined)?.status;
    if (status === 401) window.location.href = '/spa/login';
  }, [error]);

  const items = resp?.items ?? [];

  // Reset page when server-side filters change
  const prevFilters = useRef({ q: filtroQDebounced, estado: filtroEstado, proveedorId: proveedorIdServer });
  useEffect(() => {
    const prev = prevFilters.current;
    if (prev.q !== filtroQDebounced || prev.estado !== filtroEstado || prev.proveedorId !== proveedorIdServer) {
      setPage(1);
      prevFilters.current = { q: filtroQDebounced, estado: filtroEstado, proveedorId: proveedorIdServer };
    }
  }, [filtroQDebounced, filtroEstado, proveedorIdServer]);

  // KPIs — conteos sobre items de la página actual (relabeled "en esta página")
  const counts = useMemo(() => {
    const c: Record<EstadoFantasma, number> = {
      PENDIENTE: 0, EN_OC: 0, RECIBIDO: 0, PROMOVIDO: 0, DESCARTADO: 0,
    };
    items.forEach((f) => { if (c[f.estado] != null) c[f.estado]++; });
    return c;
  }, [items]);

  // Filtros client-side residuales (moneda, sinAsignar)
  const filtrados = useMemo(() => {
    return items.filter((f) => {
      if (filtroProveedor === '__sin_asignar__' && f.proveedor_sugerido_id != null) return false;
      if (filtroMoneda && f.moneda !== filtroMoneda) return false;
      return true;
    });
  }, [items, filtroProveedor, filtroMoneda]);

  // Bulk selection
  function toggleSel(id: number) {
    setSeleccionados((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (seleccionados.size === filtrados.length) setSeleccionados(new Set());
    else setSeleccionados(new Set(filtrados.map((f) => f.id)));
  }
  function clearSel() { setSeleccionados(new Set()); }

  // Mutations
  const descartarMut = useMutation<void, { status?: number; detail?: string }, number>({
    mutationFn: (id) => api.post<void>(`/api/fantasmas/${id}/descartar`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fantasmas'] });
      toast({ kind: 'success', title: 'Fantasma descartado' });
    },
    onError: (e) => {
      if (e.status === 403) toast({ kind: 'error', title: 'Solo admin', description: 'Necesitas rol administrador para descartar.' });
      else toast({ kind: 'error', title: 'No se pudo descartar', description: e.detail });
    },
  });

  const editarMut = useMutation<Fantasma, { status?: number; detail?: string }, { id: number; payload: FantasmaUpdatePayload }>({
    mutationFn: ({ id, payload }) => api.patch<Fantasma>(`/api/fantasmas/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fantasmas'] });
      toast({ kind: 'success', title: 'Actualizado' });
    },
    onError: (e) => toast({ kind: 'error', title: 'No se pudo actualizar', description: e.detail }),
  });

  function onPromover(f: Fantasma) {
    setPromoverTarget(f);
  }

  async function onDescartar(f: Fantasma) {
    if (await confirm({ mensaje: `¿Descartar "${f.descripcion}"?`, tono: 'danger' })) {
      descartarMut.mutate(f.id);
    }
  }

  async function onBulkDescartar() {
    if (!(await confirm({ mensaje: `¿Descartar ${seleccionados.size} fantasma(s)? Solo afecta PENDIENTE.`, tono: 'danger' }))) return;
    let ok = 0, skip = 0, fail = 0;
    for (const id of Array.from(seleccionados)) {
      try {
        await api.post(`/api/fantasmas/${id}/descartar`);
        ok++;
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status === 409) skip++; else fail++;
      }
    }
    qc.invalidateQueries({ queryKey: ['fantasmas'] });
    clearSel();
    toast({
      kind: ok > 0 ? 'success' : 'info',
      title: 'Descarte masivo',
      description: `OK: ${ok} · Omitidos: ${skip} · Fallidos: ${fail}`,
    });
  }

  function exportarCSV() {
    if (filtrados.length === 0) {
      toast({ kind: 'info', title: 'Sin datos para exportar' });
      return;
    }
    const rows = [['descripcion', 'sku', 'proveedor', 'veces', 'costo_referencia', 'moneda', 'estado', 'creado_en', 'ultimo_visto_en']];
    filtrados.forEach((f) => {
      rows.push([
        (f.descripcion || '').replace(/"/g, '""'),
        f.sku_libre || '',
        f.proveedor_sugerido_nombre || '',
        String(f.veces_solicitado),
        String(f.costo_referencia),
        f.moneda,
        f.estado,
        f.creado_en || '',
        f.ultimo_visto_en || '',
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fantasmas_${fechaLocalISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function badgeEstado(e: EstadoFantasma) {
    return <StatusBadge status={e} />;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Ghost className="h-5 w-5 text-violet-600 dark:text-violet-400" /> Productos Fantasma apilados
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportarCSV}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> CSV
            </Button>
            <span className="text-xs text-muted-foreground">{filtrados.length} fantasma(s)</span>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {ESTADOS.map((e) => {
          const tone: Record<typeof e.variant, string> = {
            amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',
            sky: 'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300',
            emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300',
            violet: 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300',
            slate: 'bg-surface-2 text-foreground',
          };
          return (
            <button
              key={e.key}
              type="button"
              onClick={() => setFiltroEstado(filtroEstado === e.key ? '' : e.key)}
              className={`p-3 rounded-lg border text-left transition ${
                filtroEstado === e.key
                  ? 'border-accent-glow ring-2 ring-accent-glow/40'
                  : 'border-border hover:border-border-strong'
              } ${tone[e.variant]}`}
            >
              <div className="text-[10px] uppercase font-bold opacity-80">{e.label}</div>
              <div className="text-2xl font-bold">{counts[e.key]}</div>
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="bg-card border border-border rounded-xl p-3 flex flex-wrap items-center gap-2">
        <Input
          value={filtroQ}
          onChange={(e) => setFiltroQ(e.target.value)}
          placeholder="Buscar descripción o SKU…"
          className="flex-1 w-full sm:w-auto sm:min-w-[200px]"
        />
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as EstadoFantasma | '')}
          className="h-10 rounded-md border border-border-strong bg-card px-2 text-sm"
        >
          <option value="">Todos estados</option>
          {ESTADOS.map((e) => (
            <option key={e.key} value={e.key}>{e.label}</option>
          ))}
        </select>
        <select
          value={filtroProveedor}
          onChange={(e) => setFiltroProveedor(e.target.value)}
          className="h-10 rounded-md border border-border-strong bg-card px-2 text-sm min-w-[160px]"
        >
          <option value="">Todos proveedores</option>
          <option value="__sin_asignar__">— Sin asignar</option>
          {(proveedores ?? []).map((p) => (
            <option key={p.id} value={String(p.id)}>{p.nombre_empresa}</option>
          ))}
        </select>
        <select
          value={filtroMoneda}
          onChange={(e) => setFiltroMoneda(e.target.value as Moneda | '')}
          className="h-10 rounded-md border border-border-strong bg-card px-2 text-sm"
        >
          <option value="">Cualquier moneda</option>
          <option value="MXN">MXN</option>
          <option value="USD">USD</option>
        </select>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setFiltroQ(''); setFiltroEstado('PENDIENTE'); setFiltroProveedor(''); setFiltroMoneda('');
          }}
        >
          <Brush className="h-4 w-4 mr-1" /> Limpiar
        </Button>
      </div>

      {/* Bulk bar */}
      {seleccionados.size > 0 && (
        <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-300 dark:border-violet-700/50 rounded-lg p-3 flex items-center gap-3 text-sm">
          <span className="font-medium text-violet-800 dark:text-violet-200">{seleccionados.size} seleccionado(s)</span>
          <button onClick={onBulkDescartar} className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 hover:underline text-xs">
            <X className="h-3 w-3 inline mr-0.5" /> Descartar
          </button>
          <button onClick={() => setModalAsignar(true)} className="text-accent-deep hover:text-accent-deep/80 dark:text-accent-glow dark:hover:text-accent-glow/80 hover:underline text-xs">
            <Truck className="h-3 w-3 inline mr-0.5" /> Asignar proveedor
          </button>
          <button onClick={clearSel} className="ml-auto text-muted-foreground hover:underline text-xs">Cancelar</button>
        </div>
      )}

      {/* Tabla */}
      <DataTable maxBodyHeight="calc(100vh - 22rem)">
        <DataTableHead sticky>
          <tr>
            <th className="px-3 py-2 w-8 text-center">
              <input
                type="checkbox"
                checked={seleccionados.size === filtrados.length && filtrados.length > 0}
                onChange={toggleAll}
              />
            </th>
            <th className="px-3 py-2 text-left">Descripción</th>
            <th className="px-3 py-2 text-left">SKU</th>
            <th className="px-3 py-2 text-left">Proveedor</th>
            <th className="px-3 py-2 text-right">Veces</th>
            <th className="px-3 py-2 text-right">Costo</th>
            <th className="px-3 py-2 text-center">Estado</th>
            <th className="px-3 py-2 text-left">Actividad</th>
            <th className="px-3 py-2 text-right">Acciones</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {isLoading && (
            <DataTableEmpty colSpan={9}>Cargando fantasmas…</DataTableEmpty>
          )}
          {!isLoading && filtrados.length === 0 && (
            <tr>
              <td colSpan={9}>
                <EmptyState icon={Ghost} title="Sin fantasmas que coincidan" />
              </td>
            </tr>
          )}
          {filtrados.map((f) => (
            <DataTableRow key={f.id}>
              <td className="px-3 py-2 text-center">
                <input
                  type="checkbox"
                  checked={seleccionados.has(f.id)}
                  onChange={() => toggleSel(f.id)}
                />
              </td>
              <td className="px-3 py-2 max-w-xs">
                <div className="truncate text-foreground" title={f.descripcion}>{f.descripcion}</div>
                {(f.marca || f.clave_prod_serv || f.clave_unidad_sat) && (
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    {f.marca && <span>{f.marca}</span>}
                    {f.clave_prod_serv && <span className="font-mono">SAT {f.clave_prod_serv}</span>}
                    {f.clave_unidad_sat && <span className="font-mono">Un {f.clave_unidad_sat}</span>}
                  </div>
                )}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{f.sku_libre || '—'}</td>
              <td className="px-3 py-2 text-xs">
                {f.proveedor_sugerido_nombre || <span className="text-muted-foreground/70">Sin asignar</span>}
              </td>
              <td className="px-3 py-2 text-right">
                <span className="inline-block min-w-[28px] px-1.5 py-0.5 rounded bg-surface-2 text-xs font-bold">
                  {f.veces_solicitado}
                </span>
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs">{fmtMoney(f.costo_referencia, f.moneda)}</td>
              <td className="px-3 py-2 text-center">{badgeEstado(f.estado)}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(f.ultimo_visto_en)}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <button onClick={() => setModalDetalle(f.id)} title="Ver detalle"
                        className="text-accent-deep hover:text-accent-deep/80 dark:text-accent-glow dark:hover:text-accent-glow/80 px-1">
                  <Eye className="h-4 w-4 inline" />
                </button>
                {(f.estado === 'PENDIENTE' || f.estado === 'EN_OC' || f.estado === 'RECIBIDO') && (
                  <button onClick={() => setModalEditar(f)} title="Editar"
                          className="text-muted-foreground hover:text-foreground px-1">
                    <Pen className="h-4 w-4 inline" />
                  </button>
                )}
                {f.estado === 'PENDIENTE' && (
                  <>
                    <button onClick={() => onPromover(f)} title="Promover a catálogo"
                            className="text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 px-1">
                      <ArrowUp className="h-4 w-4 inline" />
                    </button>
                    <button onClick={() => onDescartar(f)} title="Descartar"
                            className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 px-1">
                      <X className="h-4 w-4 inline" />
                    </button>
                  </>
                )}
              </td>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>

      {/* Modal detalle */}
      {modalDetalle != null && (
        <DetalleModal id={modalDetalle} onClose={() => setModalDetalle(null)} />
      )}

      {/* Modal editar */}
      {modalEditar && (
        <EditarModal
          fantasma={modalEditar}
          proveedores={proveedores ?? []}
          onClose={() => setModalEditar(null)}
          onSave={(payload) => {
            editarMut.mutate(
              { id: modalEditar.id, payload },
              { onSuccess: () => setModalEditar(null) },
            );
          }}
          busy={editarMut.isPending}
        />
      )}

      {/* Modal asignar proveedor bulk */}
      {modalAsignar && (
        <AsignarProveedorModal
          proveedores={proveedores ?? []}
          ids={Array.from(seleccionados)}
          onClose={() => setModalAsignar(false)}
          onDone={() => {
            setModalAsignar(false);
            clearSel();
            qc.invalidateQueries({ queryKey: ['fantasmas'] });
          }}
        />
      )}

      {promoverTarget && (
        <PromoverModal fantasma={promoverTarget} onClose={() => setPromoverTarget(null)} />
      )}

      {/* Paginación */}
      {(page > 1 || items.length === PAGE_SIZE) && (
        <div className={`flex items-center justify-between text-sm text-muted-foreground ${isPlaceholderData ? 'opacity-50' : ''}`}>
          <Button variant="outline" size="sm" disabled={page <= 1 || isPlaceholderData} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
          </Button>
          <span>Página {page}{items.length === PAGE_SIZE ? ' — hay más registros' : ''}</span>
          <Button variant="outline" size="sm" disabled={items.length < PAGE_SIZE || isPlaceholderData} onClick={() => setPage((p) => p + 1)}>
            Siguiente <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Modales ───────────────────────────────────────────────────────────────

function DetalleModal({ id, onClose }: { id: number; onClose: () => void }) {
  const [d, setD] = useState<FantasmaDetalle | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<FantasmaDetalle>(`/api/fantasmas/${id}`)
      .then(setD)
      .catch((e: { detail?: string }) => setErr(e.detail || 'No se pudo cargar'));
  }, [id]);

  return (
    <Modal title="Detalle fantasma" onClose={onClose} size="md">
      {err && <div className="text-rose-600 dark:text-rose-400 text-sm">{err}</div>}
      {!d && !err && <div className="text-muted-foreground text-sm">Cargando…</div>}
      {d && (
        <div className="text-sm space-y-2">
          <div><span className="text-muted-foreground">Descripción:</span> {d.descripcion}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div><span className="text-muted-foreground">SKU:</span> {d.sku_libre || '—'}</div>
            <div><span className="text-muted-foreground">Estado:</span> {d.estado}</div>
            <div><span className="text-muted-foreground">Costo ref:</span> {fmtMoney(d.costo_referencia, d.moneda)}</div>
            <div><span className="text-muted-foreground">Veces:</span> {d.veces_solicitado}</div>
            <div><span className="text-muted-foreground">Creado:</span> {fmtDate(d.creado_en)}</div>
            <div><span className="text-muted-foreground">Actividad:</span> {fmtDate(d.ultimo_visto_en)}</div>
          </div>
          <hr className="border-border" />
          <div>
            <div className="font-medium mb-1">Cotizaciones donde aparece ({d.cotizaciones.length}):</div>
            {d.cotizaciones.length === 0 ? (
              <div className="text-xs text-muted-foreground">No aparece en ninguna cotización activa.</div>
            ) : (
              <ul className="text-xs space-y-1">
                {d.cotizaciones.map((c) => (
                  <li key={c.id}>
                    <span className="font-mono text-accent-deep dark:text-accent-glow">{c.folio}</span>
                    <span className="text-muted-foreground"> ({c.estatus})</span>
                    <span className="text-muted-foreground"> ×{c.cantidad}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function EditarModal({
  fantasma, proveedores, onClose, onSave, busy,
}: {
  fantasma: Fantasma;
  proveedores: { id: number; nombre_empresa: string }[];
  onClose: () => void;
  onSave: (p: FantasmaUpdatePayload) => void;
  busy: boolean;
}) {
  const [desc, setDesc] = useState(fantasma.descripcion);
  const [sku, setSku] = useState(fantasma.sku_libre ?? '');
  const [costo, setCosto] = useState(String(fantasma.costo_referencia));
  const [moneda, setMoneda] = useState<Moneda>(fantasma.moneda);
  const [provId, setProvId] = useState<string>(fantasma.proveedor_sugerido_id?.toString() ?? '');
  const [marca, setMarca] = useState(fantasma.marca ?? '');
  const [claveProdServ, setClaveProdServ] = useState(fantasma.clave_prod_serv ?? '');
  const [claveUnidadSat, setClaveUnidadSat] = useState(fantasma.clave_unidad_sat ?? '');
  const [observaciones, setObservaciones] = useState(fantasma.observaciones ?? '');
  const [err, setErr] = useState<string | null>(null);

  function onSubmit() {
    setErr(null);
    if (!desc.trim()) { setErr('Descripción obligatoria.'); return; }
    const c = parseFloat(costo);
    if (!Number.isFinite(c) || c <= 0) { setErr('Costo debe ser > 0.'); return; }
    onSave({
      descripcion_original: desc.trim(),
      sku_libre: sku.trim() || undefined,
      costo_referencia: c,
      moneda_referencia: moneda,
      proveedor_sugerido_id: provId ? parseInt(provId, 10) : null,
      marca: marca.trim() || null,
      clave_prod_serv: claveProdServ.trim() || null,
      clave_unidad_sat: claveUnidadSat.trim() || null,
      observaciones: observaciones.trim() || null,
    });
  }

  return (
    <Modal title="Editar fantasma" onClose={onClose} size="md">
      <label className="block text-xs text-muted-foreground mb-1">Descripción</label>
      <textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        rows={3}
        className="w-full text-sm rounded border border-border-strong bg-card px-2 py-1.5 mb-3"
      />
      <label className="block text-xs text-muted-foreground mb-1">SKU</label>
      <Input value={sku} onChange={(e) => setSku(e.target.value)} className="mb-3" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Costo ref</label>
          <Input type="number" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Moneda</label>
          <select
            value={moneda}
            onChange={(e) => setMoneda(e.target.value as Moneda)}
            className="w-full h-10 rounded-md border border-border-strong bg-card px-2 text-sm"
          >
            <option value="MXN">MXN</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>
      <label className="block text-xs text-muted-foreground mb-1">Proveedor sugerido</label>
      <select
        value={provId}
        onChange={(e) => setProvId(e.target.value)}
        className="w-full h-10 rounded-md border border-border-strong bg-card px-2 text-sm mb-3"
      >
        <option value="">— Sin asignar —</option>
        {proveedores.map((p) => (
          <option key={p.id} value={p.id}>{p.nombre_empresa}</option>
        ))}
      </select>
      <label className="block text-xs text-muted-foreground mb-1">Marca</label>
      <Input value={marca} onChange={(e) => setMarca(e.target.value)} className="mb-3" placeholder="Marca del producto" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Clave prod/serv SAT</label>
          <SatCombobox value={claveProdServ} onChange={setClaveProdServ} endpoint="/api/sat/clave-prod-serv" minChars={2} maxLength={8} placeholder="Buscar o escribir (ej. 31181701)" className="font-mono" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Clave unidad SAT</label>
          <SatCombobox value={claveUnidadSat} onChange={setClaveUnidadSat} endpoint="/api/sat/clave-unidad" minChars={1} maxLength={10} placeholder="Buscar unidad (ej. H87)" className="font-mono" />
        </div>
      </div>
      <label className="block text-xs text-muted-foreground mb-1">Observaciones</label>
      <Input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className="mb-3" placeholder="Notas del fantasma" />
      {err && <div className="text-xs bg-rose-50 dark:bg-rose-900/30 border border-rose-300 dark:border-rose-700/50 rounded p-2 mb-3 text-rose-700 dark:text-rose-300">{err}</div>}
      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button size="sm" onClick={onSubmit} disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function AsignarProveedorModal({
  proveedores, ids, onClose, onDone,
}: {
  proveedores: { id: number; nombre_empresa: string }[];
  ids: number[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [provId, setProvId] = useState<string>('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (!provId) { toast({ kind: 'warning', title: 'Selecciona un proveedor' }); return; }
    setBusy(true);
    let ok = 0, fail = 0;
    for (const id of ids) {
      try {
        await api.patch(`/api/fantasmas/${id}`, { proveedor_sugerido_id: parseInt(provId, 10) });
        ok++;
      } catch {
        fail++;
      }
    }
    setBusy(false);
    toast({
      kind: ok > 0 ? 'success' : 'error',
      title: 'Asignación masiva',
      description: `OK: ${ok} · Fallidos: ${fail}`,
    });
    onDone();
  }

  return (
    <Modal title={`Asignar proveedor a ${ids.length} fantasma(s)`} onClose={onClose} size="md">
      <select
        value={provId}
        onChange={(e) => setProvId(e.target.value)}
        className="w-full h-10 rounded-md border border-border-strong bg-card px-2 text-sm mb-3"
      >
        <option value="">— Selecciona —</option>
        {proveedores.map((p) => (
          <option key={p.id} value={p.id}>{p.nombre_empresa}</option>
        ))}
      </select>
      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button size="sm" onClick={onSubmit} disabled={busy}>
          {busy ? 'Asignando…' : 'Asignar'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
