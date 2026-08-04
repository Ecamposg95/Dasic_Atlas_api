import { useEffect, useMemo, useState } from 'react';
import { confirm } from '@/lib/confirm';
import { Tags, Trash2, BarChart2 } from 'lucide-react';
import { usePrecios, useComparativaPrecios, useCrearPrecio, useEliminarPrecio, PRECIOS_PAGE_SIZE } from '../hooks/usePrecios';
import { Pagination } from '@/components/ui/pagination';
import { useProductos } from '@/features/inventario/hooks/useProductos';
import { useProveedores } from '@/features/inventario/hooks/useProveedores';
import { toast } from '@/lib/toast';
import { useIsAdmin } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import {
  DataTable,
  DataTableHead,
  DataTableBody,
  DataTableRow,
  DataTableEmpty,
} from '@/components/ui/data-table';
import { PrecioFormModal } from '../components/PrecioFormModal';
import { ComparadorRapido } from '../components/ComparadorRapido';
import type { PrecioProveedorCreate } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtPrecio(precio: number, moneda: string): string {
  return `${moneda} $${precio.toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtFecha(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// ---------------------------------------------------------------------------
// Panel comparativa (barras Tailwind)
// ---------------------------------------------------------------------------

function ComparativaPanel({ productoId }: { productoId: number }) {
  const { data, isLoading } = useComparativaPrecios(productoId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    );
  }

  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Sin precios registrados para este producto.
      </p>
    );
  }

  const maxPrecio = Math.max(...items.map((i) => i.precio));

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const pct = maxPrecio > 0 ? (item.precio / maxPrecio) * 100 : 0;
        const isMenor = item.precio === items[0].precio;
        return (
          <div key={item.proveedor_id}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-foreground truncate max-w-[60%]">
                {item.proveedor_nombre ?? `Prov. ${item.proveedor_id}`}
              </span>
              <span
                className={`text-xs font-medium tabular-nums ${
                  isMenor
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-foreground'
                }`}
              >
                {fmtPrecio(item.precio, item.moneda)}
              </span>
            </div>
            <div className="w-full bg-surface-2 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  isMenor ? 'bg-emerald-500' : 'bg-muted-foreground'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export function PreciosPage() {
  const isAdmin = useIsAdmin();

  const [showModal, setShowModal] = useState(false);
  const [filtroProducto, setFiltroProducto] = useState<string>('');
  const [filtroProveedor, setFiltroProveedor] = useState<string>('');
  const [comparaProductoId, setComparaProductoId] = useState<number | null>(null);

  const { data: productosData } = useProductos(1, '', 500);
  const { data: proveedoresData } = useProveedores();

  const productos = productosData ?? [];
  const proveedores = proveedoresData ?? [];

  const [page, setPage] = useState(1);

  const filtros = useMemo(
    () => ({
      producto_id: filtroProducto ? Number(filtroProducto) : null,
      proveedor_id: filtroProveedor ? Number(filtroProveedor) : null,
    }),
    [filtroProducto, filtroProveedor],
  );

  // Resetear a la primera página cuando cambian los filtros
  useEffect(() => {
    setPage(1);
  }, [filtroProducto, filtroProveedor]);

  const { data: preciosData, isLoading, isPlaceholderData } = usePrecios(page, filtros);
  const crear = useCrearPrecio();
  const eliminar = useEliminarPrecio();

  const items = preciosData?.items ?? [];
  const total = preciosData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PRECIOS_PAGE_SIZE));

  function handleSave(data: PrecioProveedorCreate) {
    crear.mutate(data, {
      onSuccess: () => {
        toast({ kind: 'success', title: 'Precio registrado' });
        setShowModal(false);
      },
      onError: (err) => {
        const detail = (err as { detail?: string }).detail ?? 'Error al registrar precio';
        toast({ kind: 'error', title: detail });
      },
    });
  }

  async function handleDelete(id: number, label: string) {
    if (!(await confirm({ mensaje: `¿Eliminar el precio "${label}"? Esta acción no se puede deshacer.`, tono: 'danger' }))) return;
    eliminar.mutate(id, {
      onSuccess: () => toast({ kind: 'success', title: 'Precio eliminado' }),
      onError: (err) => {
        const status = (err as { status?: number }).status;
        if (status === 403) {
          toast({ kind: 'error', title: 'Sin permiso' });
        } else {
          const detail = (err as { detail?: string }).detail ?? 'Error al eliminar precio';
          toast({ kind: 'error', title: detail });
        }
      },
    });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
      {/* Header */}
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Tags className="h-6 w-6 text-accent-glow" />
            Precios proveedores
            {!isLoading && (
              <span className="text-muted-foreground text-sm font-normal">
                ({total} {total === 1 ? 'precio' : 'precios'})
              </span>
            )}
          </span>
        }
        actions={
          <Button size="sm" onClick={() => setShowModal(true)}>
            + Registrar precio
          </Button>
        }
      />

      {/* Comparador rápido (restaurado del Jinja viejo) */}
      <ComparadorRapido />

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Columna principal */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap gap-3">
            <Select
              className="w-full sm:w-auto sm:max-w-[220px]"
              value={filtroProducto}
              onChange={(e) => {
                setFiltroProducto(e.target.value);
                setComparaProductoId(e.target.value ? Number(e.target.value) : null);
              }}
            >
              <option value="">Todos los productos</option>
              {productos.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.nombre}
                </option>
              ))}
            </Select>
            <Select
              className="w-full sm:w-auto sm:max-w-[220px]"
              value={filtroProveedor}
              onChange={(e) => setFiltroProveedor(e.target.value)}
            >
              <option value="">Todos los proveedores</option>
              {proveedores.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.nombre_empresa}
                </option>
              ))}
            </Select>
          </div>

          {/* Tabla */}
          <DataTable>
            <DataTableHead>
              <tr>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Producto</th>
                <th className="px-4 py-3 text-left">Proveedor</th>
                <th className="px-4 py-3 text-right">Precio</th>
                <th className="px-4 py-3 text-left">Notas</th>
                {isAdmin && <th className="px-4 py-3 text-right">Acciones</th>}
              </tr>
            </DataTableHead>
            <DataTableBody>
              {isLoading ? (
                <SkeletonRows rows={5} cols={isAdmin ? 6 : 5} />
              ) : items.length === 0 ? (
                <DataTableEmpty colSpan={isAdmin ? 6 : 5}>
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Tags className="h-10 w-10 opacity-30" />
                    <p>Sin precios registrados para estos filtros</p>
                  </div>
                </DataTableEmpty>
              ) : (
                items.map((item) => {
                  const label =
                    item.producto_nombre ??
                    item.descripcion_busqueda ??
                    `ID ${item.id}`;
                  return (
                    <DataTableRow key={item.id}>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {fmtFecha(item.fecha_vigencia_desde ?? item.creado_en)}
                      </td>
                      <td className="px-4 py-3 text-foreground text-sm">
                        <div className="font-medium">{label}</div>
                        {item.sku_libre && (
                          <div className="text-muted-foreground text-xs">
                            {item.sku_libre}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-foreground text-sm">
                        {item.proveedor_nombre ?? `Prov. ${item.proveedor_id}`}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                        {fmtPrecio(item.precio, item.moneda)}
                        {item.moneda === 'USD' && (
                          <Badge variant="cyan" className="ml-2 text-xs">USD</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {item.notas ?? '—'}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            title="Eliminar precio"
                            disabled={
                              eliminar.isPending && eliminar.variables === item.id
                            }
                            onClick={() => handleDelete(item.id, label)}
                            className="text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950 hover:text-rose-700 dark:hover:text-rose-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      )}
                    </DataTableRow>
                  );
                })
              )}
            </DataTableBody>
          </DataTable>

          {/* Paginación */}
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            isLoading={isPlaceholderData}
          />
        </div>

        {/* Panel comparativa lateral */}
        {comparaProductoId && (
          <aside className="w-full lg:w-72 flex-shrink-0">
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart2 className="h-4 w-4 text-accent-glow" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Comparativa por proveedor
                  </h3>
                </div>
                <ComparativaPanel productoId={comparaProductoId} />
              </CardContent>
            </Card>
          </aside>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <PrecioFormModal
          productos={productos.map((p) => ({
            id: p.id,
            nombre: p.nombre,
            sku: p.sku ?? null,
          }))}
          proveedores={proveedores.map((p) => ({
            id: p.id,
            nombre_empresa: p.nombre_empresa,
          }))}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
          busy={crear.isPending}
        />
      )}
    </div>
  );
}
