import { useEffect, useMemo, useRef, useState } from 'react';
import { confirm } from '@/lib/confirm';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ClipboardList, Package, Pencil, Plus, Sliders, Trash2, Upload, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DataTable,
  DataTableBody,
  DataTableEmpty,
  DataTableHead,
  DataTableRow,
} from '@/components/ui/data-table';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useIsAdmin } from '@/lib/permissions';
import { useImportProductos, useProductos } from '../hooks/useProductos';
import { useMarcas } from '../hooks/useMarcas';
import { useProveedores } from '../hooks/useProveedores';
import { AjusteStockModal } from '../components/AjusteStockModal';
import { KardexModal } from '../components/KardexModal';
import { ProductoFormModal } from '../components/ProductoFormModal';
import type { Producto } from '../types';

// Banner de feedback de import. Mismo contrato que la versión Jinja:
// text (resumen), type ('success'|'error'), hint (subtítulo), errores[] (lista
// granular por fila, máx 50 visibles + contador "+N más").
type ImportFeedback = {
  text: string;
  type: 'success' | 'error';
  hint?: string;
  errores: string[];
};

const PAGE_SIZE = 50;
const SELECT_CLS = 'h-10 rounded-md border border-border-strong bg-card px-2 text-sm';

// Debounce helper
function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function fmtMoney(n: number | undefined | null, moneda?: string) {
  if (n == null) return '—';
  return `${moneda ?? ''} $${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}

function stockBadge(p: Producto) {
  if (p.es_servicio) return <Badge variant="slate">Servicio</Badge>;
  if (p.stock_actual < p.stock_minimo) {
    return <Badge variant="rose">{p.stock_actual}</Badge>;
  }
  if (p.stock_actual === p.stock_minimo) {
    return <Badge variant="amber">{p.stock_actual}</Badge>;
  }
  return <Badge variant="emerald">{p.stock_actual}</Badge>;
}

export function InventarioPage() {
  const [filtroQ, setFiltroQ] = useState('');
  const [filtroMarca, setFiltroMarca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [soloBajoStock, setSoloBajoStock] = useState(false);
  const [page, setPage] = useState(1);

  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalEditar, setModalEditar] = useState<Producto | null>(null);
  const [modalAjuste, setModalAjuste] = useState<Producto | null>(null);
  const [modalKardex, setModalKardex] = useState<Producto | null>(null);

  // Import Excel/CSV: ref al <input type=file> oculto + estado del banner.
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [importFeedback, setImportFeedback] = useState<ImportFeedback | null>(null);
  const [expandErrores, setExpandErrores] = useState(false);
  const importMut = useImportProductos();

  const filtroQDebounced = useDebounced(filtroQ);

  // Reset page when server-side q changes
  const prevQ = useRef(filtroQDebounced);
  useEffect(() => {
    if (prevQ.current !== filtroQDebounced) {
      setPage(1);
      prevQ.current = filtroQDebounced;
    }
  }, [filtroQDebounced]);

  // Los filtros client-side reducen la página actual → volver a página 1 al cambiarlos
  // (evita quedar en una página alta que tras el filtro queda vacía).
  useEffect(() => { setPage(1); }, [filtroMarca, filtroCategoria, soloBajoStock]);

  const { data: productos = [], isLoading, isPlaceholderData, error } = useProductos(page, filtroQDebounced);
  const { data: marcas = [] } = useMarcas();
  const { data: proveedores = [] } = useProveedores();
  const isAdmin = useIsAdmin();

  const qc = useQueryClient();

  // 401 → login
  useEffect(() => {
    const status = (error as { status?: number } | undefined)?.status;
    if (status === 401) window.location.href = '/spa/login';
  }, [error]);

  // Categorías únicas derivadas del listado
  const categorias = useMemo(() => {
    const cats = new Set<string>();
    productos.forEach((p) => { if (p.categoria) cats.add(p.categoria); });
    return Array.from(cats).sort();
  }, [productos]);

  // Filtros client-side residuales (marca_id, categoria, bajo stock)
  // q ya va al servidor; estos filtros restringen la página actual
  const filtrados = useMemo(() => {
    return productos.filter((p) => {
      if (filtroMarca && String(p.marca_id) !== filtroMarca) return false;
      if (filtroCategoria && p.categoria !== filtroCategoria) return false;
      if (soloBajoStock && (p.es_servicio || p.stock_actual >= p.stock_minimo)) return false;
      return true;
    });
  }, [productos, filtroMarca, filtroCategoria, soloBajoStock]);

  // Delete mutation
  const deleteMut = useMutation<void, { status?: number; detail?: string }, number>({
    mutationFn: (id) => api.delete<void>(`/api/productos/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] });
      toast({ kind: 'success', title: 'Producto eliminado' });
    },
    onError: (e) => {
      if (e.status === 401) { window.location.href = '/spa/login'; return; }
      if (e.status === 403) {
        toast({ kind: 'error', title: 'Solo admin', description: 'Se requiere rol administrador para eliminar.' });
        return;
      }
      toast({ kind: 'error', title: 'No se pudo eliminar', description: e.detail });
    },
  });

  async function onDelete(p: Producto) {
    if (!(await confirm({ mensaje: `¿Eliminar "${p.nombre}"? Esta acción no se puede deshacer.`, tono: 'danger' }))) return;
    deleteMut.mutate(p.id);
  }

  function clearFiltros() {
    setFiltroQ('');
    setFiltroMarca('');
    setFiltroCategoria('');
    setSoloBajoStock(false);
  }

  // Click en "Importar Excel" → abre el file picker oculto.
  function triggerImport() {
    setImportFeedback(null);
    importInputRef.current?.click();
  }

  // Cuando el usuario selecciona un archivo: lanza la mutation y monta el
  // banner de feedback. Reset del input al final para permitir re-subir el
  // mismo archivo (el browser no dispara change si el value no cambió).
  function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setExpandErrores(false);
    setImportFeedback(null);
    importMut.mutate(file, {
      onSuccess: (data) => {
        const omitidos = data.omitidos ?? 0;
        const resumen = `Importación lista: ${data.creados} creados, ${data.actualizados} actualizados${omitidos ? `, ${omitidos} omitidos` : ''}.`;
        const errores = Array.isArray(data.errores) ? data.errores : [];
        const tieneErrores = errores.length > 0;
        setImportFeedback({
          text: resumen,
          type: tieneErrores ? 'error' : 'success',
          hint: tieneErrores
            ? 'Stock se aplicó como REPLACE auditable (kardex en /inventario timeline).'
            : 'Importación completa, sin errores. Stock auditado en kardex.',
          errores,
        });
      },
      onError: (err) => {
        if (err.status === 401) { window.location.href = '/spa/login'; return; }
        setImportFeedback({
          text: err.mensaje,
          type: 'error',
          hint: err.columnas_compatibles && err.columnas_compatibles.length
            ? `Plantilla base: ${err.columnas_compatibles.join(', ')}`
            : 'Usa CSV UTF-8 o XLSX como formato de carga.',
          errores: [],
        });
      },
      onSettled: () => {
        if (importInputRef.current) importInputRef.current.value = '';
      },
    });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Package className="h-5 w-5 text-cyan-400" /> Inventario
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{filtrados.length} producto(s)</span>
          <Button size="sm" onClick={() => setModalNuevo(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo producto
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={triggerImport}
            disabled={importMut.isPending}
          >
            <Upload className="h-4 w-4 mr-1" />
            {importMut.isPending ? 'Importando…' : 'Importar Excel'}
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={onImportFile}
          />
        </div>
      </header>

      {/* Banner de feedback del import. Verde si OK, rojo si hubo error o
          errores granulares por fila. Permite expandir la lista de errores. */}
      {importFeedback && (
        <div
          className={
            'rounded-xl border px-4 py-3 text-sm ' +
            (importFeedback.type === 'error'
              ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200'
              : 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200')
          }
        >
          <div className="flex items-start justify-between gap-3">
            <p className="flex-1 font-medium">{importFeedback.text}</p>
            <button
              type="button"
              onClick={() => { setImportFeedback(null); setExpandErrores(false); }}
              aria-label="Cerrar aviso"
              className="text-muted-foreground hover:text-foreground transition shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {importFeedback.hint && (
            <p className="mt-1 text-xs text-muted-foreground">{importFeedback.hint}</p>
          )}
          {importFeedback.errores.length > 0 && (
            <div className="mt-2 border-t border-rose-300/40 dark:border-rose-500/20 pt-2">
              <button
                type="button"
                onClick={() => setExpandErrores((v) => !v)}
                className="text-[11px] text-rose-700 dark:text-rose-200 hover:text-rose-900 dark:hover:text-white font-bold uppercase tracking-wide flex items-center gap-1"
              >
                {expandErrores ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Ver {importFeedback.errores.length} error(es) por fila
              </button>
              {expandErrores && (
                <ul className="mt-2 space-y-1 text-[11px] font-mono">
                  {importFeedback.errores.slice(0, 50).map((err, i) => (
                    <li key={i} className="text-rose-700 dark:text-rose-200">{err}</li>
                  ))}
                  {importFeedback.errores.length > 50 && (
                    <li className="text-muted-foreground italic">
                      (+{importFeedback.errores.length - 50} errores adicionales no mostrados)
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-card border border-border rounded-xl p-3 flex flex-wrap items-center gap-2">
        <Input
          value={filtroQ}
          onChange={(e) => setFiltroQ(e.target.value)}
          placeholder="Buscar SKU, nombre, marca…"
          className="flex-1 w-full sm:w-auto sm:min-w-[200px]"
        />
        <select
          value={filtroMarca}
          onChange={(e) => setFiltroMarca(e.target.value)}
          className={SELECT_CLS}
        >
          <option value="">Todas las marcas</option>
          {marcas.map((m) => (
            <option key={m.id} value={String(m.id)}>{m.nombre}</option>
          ))}
        </select>
        <select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          className={SELECT_CLS}
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={soloBajoStock}
            onChange={(e) => setSoloBajoStock(e.target.checked)}
            className="rounded border-border-strong bg-card"
          />
          Solo bajo stock
        </label>
        <Button variant="ghost" size="sm" onClick={clearFiltros}>
          Limpiar
        </Button>
      </div>

      {/* Tabla */}
      <DataTable>
        <DataTableHead>
          <tr>
            <th className="p-3 text-left">SKU</th>
            <th className="p-3 text-left">SKU comercial</th>
            <th className="p-3 text-left">Nombre</th>
            <th className="p-3 text-left">Marca</th>
            <th className="p-3 text-left">Categoría</th>
            <th className="p-3 text-left">SAT</th>
            <th className="p-3 text-right">Stock</th>
            {isAdmin && <th className="p-3 text-right">Costo</th>}
            <th className="p-3 text-right">Precio público</th>
            <th className="p-3 text-right">Acciones</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {isLoading && (
            <DataTableEmpty colSpan={isAdmin ? 10 : 9}>
              Cargando inventario…
            </DataTableEmpty>
          )}
          {!isLoading && filtrados.length === 0 && (
            <DataTableEmpty colSpan={isAdmin ? 10 : 9}>
              <Package className="h-8 w-8 mx-auto text-muted-foreground/70 mb-2" />
              Sin productos que coincidan con los filtros
            </DataTableEmpty>
          )}
          {filtrados.map((p) => (
            <DataTableRow key={p.id}>
              <td className="p-3 font-mono text-xs text-muted-foreground">{p.sku ?? '—'}</td>
              <td className="p-3 font-mono text-xs text-muted-foreground">{p.sku_comercial ?? '—'}</td>
              <td className="p-3 max-w-xs">
                <div className="truncate text-foreground font-medium" title={p.nombre}>
                  {p.nombre}
                </div>
              </td>
              <td className="p-3 text-xs text-foreground">{p.marca ?? '—'}</td>
              <td className="p-3 text-xs text-foreground">{p.categoria ?? '—'}</td>
              <td className="p-3 text-xs font-mono">
                {p.clave_prod_serv ? (
                  <span className="text-foreground">
                    {p.clave_prod_serv}
                    {p.clave_unidad_sat && (
                      <span className="block text-[10px] text-muted-foreground">{p.clave_unidad_sat}</span>
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground/70">—</span>
                )}
              </td>
              <td className="p-3 text-right">{stockBadge(p)}</td>
              {isAdmin && (
                <td className="p-3 text-right font-mono text-xs text-foreground">
                  {fmtMoney(p.costo_compra, p.moneda_compra)}
                </td>
              )}
              <td className="p-3 text-right font-mono text-xs text-foreground">
                {fmtMoney(p.precio_publico)}
              </td>
              <td className="p-3 text-right whitespace-nowrap">
                <button
                  onClick={() => setModalEditar(p)}
                  title="Editar"
                  className="text-muted-foreground hover:text-foreground px-1"
                >
                  <Pencil className="h-4 w-4 inline" />
                </button>
                {!p.es_servicio && (
                  <button
                    onClick={() => setModalAjuste(p)}
                    title="Ajustar stock"
                    className="text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300 px-1"
                  >
                    <Sliders className="h-4 w-4 inline" />
                  </button>
                )}
                <button
                  onClick={() => setModalKardex(p)}
                  title="Kardex"
                  className="text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 px-1"
                >
                  <ClipboardList className="h-4 w-4 inline" />
                </button>
                {isAdmin && (
                  <button
                    onClick={() => onDelete(p)}
                    title="Eliminar"
                    className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 px-1"
                    disabled={deleteMut.isPending}
                  >
                    <Trash2 className="h-4 w-4 inline" />
                  </button>
                )}
              </td>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>

      {/* Paginación */}
      {(page > 1 || productos.length === PAGE_SIZE) && (
        <div className={`flex items-center justify-between text-sm text-muted-foreground ${isPlaceholderData ? 'opacity-50' : ''}`}>
          <Button variant="outline" size="sm" disabled={page <= 1 || isPlaceholderData} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
          </Button>
          <span>Página {page}{productos.length === PAGE_SIZE ? ' — hay más registros' : ''}</span>
          <Button variant="outline" size="sm" disabled={productos.length < PAGE_SIZE || isPlaceholderData} onClick={() => setPage((p) => p + 1)}>
            Siguiente <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Modal nuevo producto */}
      {modalNuevo && (
        <ProductoFormModal
          marcas={marcas}
          proveedores={proveedores}
          onClose={() => setModalNuevo(false)}
        />
      )}

      {/* Modal editar producto */}
      {modalEditar && (
        <ProductoFormModal
          producto={modalEditar}
          marcas={marcas}
          proveedores={proveedores}
          onClose={() => setModalEditar(null)}
        />
      )}

      {/* Modal ajuste de stock */}
      {modalAjuste && (
        <AjusteStockModal
          producto={modalAjuste}
          onClose={() => setModalAjuste(null)}
        />
      )}

      {/* Modal kardex de movimientos */}
      {modalKardex && (
        <KardexModal
          producto={modalKardex}
          onClose={() => setModalKardex(null)}
        />
      )}
    </div>
  );
}
