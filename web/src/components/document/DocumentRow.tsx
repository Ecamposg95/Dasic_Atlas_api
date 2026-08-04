import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { MoreVertical, Pen, Trash2, ChevronDown, ChevronUp, Ghost, Wrench, MessageSquare, GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Input } from '@/components/ui/input';
import { StockBadge } from '@/features/cotizador/components/StockBadge';
import { EntregaChip } from '@/features/cotizador/components/EntregaChip';
import { MargenChip } from '@/features/cotizador/components/MargenChip';
import type { DocRowVM, DocRowCaps, DocRowCallbacks } from './types';

function fmt(n: number) {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(n: number) {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

/**
 * Tope efectivo del input de cantidad. Con `vm.entregas` presente (línea de
 * orden en el editor de remisiones) el tope es lo pendiente por entregar,
 * salvo que caps.permitirExceso lo levante; sin entregas aplica el qtyMax
 * clásico (comportamiento actual intacto).
 */
function qtyLimitOf(vm: DocRowVM, caps: DocRowCaps): number | null {
  if (vm.entregas && !caps.permitirExceso) return vm.entregas.pendiente;
  return vm.qtyMax ?? null;
}

/** Cifras compactas Cotizado/Entregado/Pendiente (patrón del "de {qtyMax}"). */
function EntregasMeta({ e }: { e: NonNullable<DocRowVM['entregas']> }) {
  return (
    <div className="text-[10px] text-muted-foreground/70 leading-tight whitespace-nowrap">
      <span title="Cotizado">C&nbsp;{fmtQty(e.cotizado)}</span>
      {' · '}
      <span className="text-emerald-400" title="Entregado">E&nbsp;{fmtQty(e.entregado)}</span>
      {' · '}
      <span className="text-amber-300" title="Pendiente">P&nbsp;{fmtQty(e.pendiente)}</span>
    </div>
  );
}

/** Wiring opcional de drag-and-drop, inyectado por SortableDocumentRow. */
type DragWiring = {
  setNodeRef: (el: HTMLElement | null) => void;
  style: CSSProperties;
  handle: ReactNode; // botón/icono con attributes+listeners ya aplicados
};

export function DocumentRow({
  vm,
  caps,
  cb,
  justAdded,
  drag,
}: {
  vm: DocRowVM;
  caps: DocRowCaps;
  cb: DocRowCallbacks;
  justAdded: boolean;
  drag?: DragWiring;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (justAdded && rowRef.current) {
      const el = rowRef.current;
      el.classList.add('cot-row-in');
      const t = setTimeout(() => el.classList.remove('cot-row-in'), 400);
      return () => clearTimeout(t);
    }
  }, [justAdded]);

  const esFantasma = vm.tipo === 'producto_fantasma';
  const esServicio = vm.tipo === 'servicio_catalogo';
  const excluida = caps.seleccionable === true && vm.incluida === false;
  const qtyLimit = qtyLimitOf(vm, caps);

  const rowClass = `${
    esServicio
      ? 'bg-emerald-950/30 border-l-4 border-l-emerald-500 hover:bg-emerald-950/45'
      : esFantasma
        ? 'bg-amber-950/30 border-l-4 border-l-amber-500 hover:bg-amber-950/45'
        : 'hover:bg-surface-2/60'
  }${excluida ? ' opacity-40' : ''}`;
  const skuClass = esServicio
    ? 'text-emerald-300'
    : esFantasma
      ? 'text-amber-300'
      : 'text-accent-glow';

  return (
    <tr
      ref={(el) => {
        rowRef.current = el;
        drag?.setNodeRef(el);
      }}
      style={drag?.style}
      className={`border-b border-border transition cursor-pointer ${rowClass}`}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('input, select, button, textarea, a')) return;
        cb.onToggleExpand(vm.uid);
      }}
    >
      {/* Incluir (solo caps.seleccionable) */}
      {caps.seleccionable && (
        <td className="p-2.5 align-top text-center w-8">
          <input
            type="checkbox"
            checked={vm.incluida !== false}
            onChange={() => cb.onToggleIncluir?.(vm.uid)}
            className="h-4 w-4 accent-accent-glow cursor-pointer align-middle"
            aria-label="Incluir línea en la remisión"
          />
        </td>
      )}

      {/* SKU / Descripción */}
      <td className="p-2.5 align-top max-w-md">
        <div className="flex items-center gap-1.5 flex-wrap">
          {drag?.handle}
          {esFantasma && (
            <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-amber-950 px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <Ghost className="h-2.5 w-2.5" /> Fantasma
            </span>
          )}
          {esServicio && (
            <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500 text-emerald-950 px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <Wrench className="h-2.5 w-2.5" /> Servicio
            </span>
          )}
          <span className={`font-mono text-xs font-bold ${skuClass}`}>{vm.sku}</span>
          {vm.productCurrency !== vm.monedaDocumento && (
            <span
              className="text-[10px] font-bold border border-amber-700/50 bg-amber-900/20 text-amber-300 px-1.5 py-0.5 rounded"
              title={`Línea en ${vm.productCurrency} convertida a ${vm.monedaDocumento}${vm.toleranciaTc != null ? ` con TC del Banxico ±${vm.toleranciaTc} de tolerancia` : ''}`}
            >
              {vm.productCurrency} → {vm.monedaDocumento}
            </span>
          )}
          {vm.esOverride && !esFantasma && !esServicio && (
            <span className="text-[10px] font-bold bg-violet-900/30 text-violet-300 px-1.5 py-0.5 rounded uppercase">
              <Pen className="inline h-2.5 w-2.5 mr-0.5" /> Editado
            </span>
          )}
          {!esFantasma && !esServicio && vm.stockMax != null && (
            <StockBadge stock={vm.stockMax} qty={vm.qty} />
          )}
        </div>
        <div className="text-[13px] text-muted-foreground mt-0.5">{vm.nom}</div>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {caps.showEntrega && (
            <EntregaChip min={vm.entrega_min} max={vm.entrega_max} unidad={vm.entrega_unidad} />
          )}
          {caps.showUtilidad && <MargenChip utilidad={vm.utilidad} />}
          {vm.tieneNota && (
            <button
              type="button"
              title="Nota de línea"
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('cot:open-nota', { detail: { uid: vm.uid } }));
              }}
              className="text-accent-glow hover:opacity-80"
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </button>
          )}
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            {vm.expanded ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
            {vm.expanded ? 'Cerrar' : 'Detalles'}
          </span>
        </div>
      </td>

      {/* Cantidad */}
      <td className="p-2.5 align-top text-center w-20">
        <Input
          type="number"
          min={caps.decimalQty ? '0.001' : '1'}
          step={caps.decimalQty ? '0.001' : undefined}
          max={qtyLimit ?? undefined}
          value={vm.qty}
          disabled={!caps.editableQty}
          onChange={(e) => {
            const min = caps.decimalQty ? 0.001 : 1;
            const raw = caps.decimalQty ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
            const v = Math.max(min, raw || min);
            const capped = qtyLimit != null ? Math.min(v, qtyLimit) : v;
            cb.onQty(vm.uid, capped);
          }}
          className="h-7 text-center text-xs px-1"
        />
        {vm.entregas ? (
          <EntregasMeta e={vm.entregas} />
        ) : (
          vm.qtyMax != null && <div className="text-[10px] text-muted-foreground/70">de {vm.qtyMax}</div>
        )}
      </td>

      {/* Unidad */}
      {caps.showUnidad && (
        <td className="p-2.5 align-top text-center w-24">
          <select
            value={vm.unidad ?? ''}
            disabled={!caps.editableQty}
            onChange={(e) => cb.onUnidad?.(vm.uid, e.target.value)}
            className="h-7 text-[11px] rounded border border-border bg-card px-1 w-full"
          >
            <option value="">—</option>
            {vm.unidad && !(caps.unidadOptions ?? []).includes(vm.unidad) && (
              <option value={vm.unidad}>{vm.unidad}</option>
            )}
            {(caps.unidadOptions ?? []).map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </td>
      )}

      {/* Costo */}
      {caps.showCosto && (
        <td className="p-2.5 align-top text-right font-mono w-28">
          <div className="text-[10px] text-muted-foreground leading-tight">
            <span className="text-muted-foreground">Orig</span> {vm.productCurrency} ${fmt(vm.costOrigen)}
          </div>
          <div
            className="text-[13px] text-muted-foreground leading-tight"
            title="Precio unitario = costo convertido al TC de venta (DOF + tolerancia) × (1 + utilidad). El IMPORTE es este PU × cantidad. El costo OC real al proveedor (DOF puro) está en el detalle."
          >
            ${fmt(vm.costoOc)}
            <span className="ml-1 text-[9px] uppercase tracking-wider text-muted-foreground">PU</span>
          </div>
        </td>
      )}

      {/* Utilidad */}
      {caps.showUtilidad && (
        <td className="p-2.5 align-top text-center w-16">
          <Input
            type="number"
            min="0"
            max="99"
            value={vm.utilidad}
            onChange={(e) =>
              cb.onUtilidad?.(vm.uid, Math.min(99, Math.max(0, parseFloat(e.target.value) || 0)))
            }
            className="h-7 text-center text-xs px-1"
          />
        </td>
      )}

      {/* Descuento */}
      {caps.showDescuento && (
        <td className="p-2.5 align-top text-center w-16">
          <Input
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={vm.descuento}
            onChange={(e) =>
              cb.onDescuento?.(vm.uid, Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))
            }
            className="h-7 text-center text-xs px-1"
          />
        </td>
      )}

      {/* Entrega */}
      {caps.showEntrega && (
        <td className="p-2.5 align-top text-center w-40">
          <div className="flex items-center gap-1">
            <Input
              type="number"
              placeholder="min"
              value={vm.entrega_min ?? ''}
              onChange={(e) =>
                cb.onEntrega?.(vm.uid, {
                  entrega_min: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value) || 0),
                })
              }
              className="h-7 text-center text-xs px-1 w-12"
            />
            <span className="text-muted-foreground text-xs">–</span>
            <Input
              type="number"
              placeholder="max"
              value={vm.entrega_max ?? ''}
              onChange={(e) =>
                cb.onEntrega?.(vm.uid, {
                  entrega_max: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value) || 0),
                })
              }
              className="h-7 text-center text-xs px-1 w-12"
            />
            <select
              value={vm.entrega_unidad ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                const u = v === 'dias' || v === 'semanas' ? v : null;
                cb.onEntrega?.(vm.uid, {
                  entrega_unidad: u,
                  ...(u == null ? { entrega_min: null, entrega_max: null } : {}),
                });
              }}
              className="h-7 text-[11px] rounded border border-border bg-card px-1"
            >
              <option value="">—</option>
              <option value="dias">días</option>
              <option value="semanas">sem.</option>
            </select>
          </div>
        </td>
      )}

      {/* Importe */}
      {caps.showImporte && (
        <td className="p-2.5 align-top text-right font-mono w-28">
          {caps.editablePrecio ? (
            <>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={vm.precioUnitario ?? 0}
                onChange={(e) => cb.onPrecio?.(vm.uid, Math.max(0, parseFloat(e.target.value) || 0))}
                className="h-7 text-right text-xs px-1"
              />
              <div className="text-[11px] text-muted-foreground mt-0.5">${fmt(vm.importe)}</div>
            </>
          ) : (
            <span className="font-bold text-[13px]">${fmt(vm.importe)}</span>
          )}
        </td>
      )}

      {/* Acciones */}
      <td className="p-2.5 align-top text-center w-8 relative">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="w-7 h-7 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-surface-2/60 transition"
          aria-label="Acciones de la línea"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-1 top-8 z-20 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[150px] text-left">
              {cb.onEdit && (
                <button
                  type="button"
                  onClick={() => {
                    cb.onEdit?.(vm.uid);
                    setMenuOpen(false);
                  }}
                  className="w-full text-left text-[11px] px-2 py-1.5 hover:bg-surface-2/60 text-foreground flex items-center gap-2"
                >
                  <Pen className="h-3 w-3" /> Editar línea
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  cb.onRemove(vm.uid);
                  setMenuOpen(false);
                }}
                className="w-full text-left text-[11px] px-2 py-1.5 hover:bg-rose-900/30 text-rose-400 flex items-center gap-2"
              >
                <Trash2 className="h-3 w-3" /> Eliminar
              </button>
            </div>
          </>
        )}
      </td>
    </tr>
  );
}

/**
 * Versión sortable de la fila (solo cotizador desktop). useSortable es un hook,
 * por eso vive en un subcomponente: DocumentCartTable solo lo monta dentro de
 * un SortableContext y solo cuando sortable=true. La remisión nunca lo usa.
 */
export function SortableDocumentRow(props: {
  vm: DocRowVM;
  caps: DocRowCaps;
  cb: DocRowCallbacks;
  justAdded: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.vm.uid,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 30, opacity: 0.85 } : {}),
  };
  const handle = (
    <button
      type="button"
      title="Arrastra para reordenar"
      onClick={(e) => e.stopPropagation()}
      className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  );
  return <DocumentRow {...props} drag={{ setNodeRef, style, handle }} />;
}

export function DocumentRowCard({
  vm,
  caps,
  cb,
  expandedRenderer,
}: {
  vm: DocRowVM;
  caps: DocRowCaps;
  cb: DocRowCallbacks;
  expandedRenderer?: (uid: string, variant?: 'row' | 'card') => ReactNode;
}) {
  const esFantasma = vm.tipo === 'producto_fantasma';
  const esServicio = vm.tipo === 'servicio_catalogo';
  const excluida = caps.seleccionable === true && vm.incluida === false;
  const qtyLimit = qtyLimitOf(vm, caps);
  return (
    <div className={`rounded-xl border border-border bg-card p-3 space-y-2${excluida ? ' opacity-40' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        {caps.seleccionable && (
          <input
            type="checkbox"
            checked={vm.incluida !== false}
            onChange={() => cb.onToggleIncluir?.(vm.uid)}
            className="h-4 w-4 mt-0.5 shrink-0 accent-accent-glow cursor-pointer"
            aria-label="Incluir línea en la remisión"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {esFantasma && (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-amber-950 px-1.5 py-0.5 rounded">Fantasma</span>
            )}
            {esServicio && (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500 text-emerald-950 px-1.5 py-0.5 rounded">Servicio</span>
            )}
            <span className="font-mono text-xs font-bold text-accent-glow">{vm.sku}</span>
            {vm.productCurrency !== vm.monedaDocumento && (
              <span className="text-[10px] font-bold border border-amber-700/50 bg-amber-900/20 text-amber-300 px-1.5 py-0.5 rounded">
                {vm.productCurrency} → {vm.monedaDocumento}
              </span>
            )}
          </div>
          <div className="text-[13px] text-muted-foreground mt-0.5">{vm.nom}</div>
        </div>
        <button type="button" onClick={() => cb.onRemove(vm.uid)} className="text-rose-400 text-[11px] shrink-0 hover:underline">
          Eliminar
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-muted-foreground">Cant</span>
          <input
            type="number"
            min={caps.decimalQty ? 0.001 : 1}
            step={caps.decimalQty ? 0.001 : undefined}
            max={qtyLimit ?? undefined}
            value={vm.qty}
            disabled={!caps.editableQty}
            onChange={(e) => {
              const min = caps.decimalQty ? 0.001 : 1;
              const raw = caps.decimalQty ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
              const v = Math.max(min, raw || min);
              cb.onQty(vm.uid, qtyLimit != null ? Math.min(v, qtyLimit) : v);
            }}
            className="h-7 w-16 text-center text-xs px-1 rounded border border-border bg-card"
          />
          {!vm.entregas && vm.qtyMax != null && (
            <span className="text-[10px] text-muted-foreground/70">de {vm.qtyMax}</span>
          )}
        </label>
        {vm.entregas && <EntregasMeta e={vm.entregas} />}
        {caps.showUnidad && (
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Unidad</span>
            <select
              value={vm.unidad ?? ''}
              disabled={!caps.editableQty}
              onChange={(e) => cb.onUnidad?.(vm.uid, e.target.value)}
              className="h-7 text-[11px] rounded border border-border bg-card px-1"
            >
              <option value="">—</option>
              {vm.unidad && !(caps.unidadOptions ?? []).includes(vm.unidad) && (
                <option value={vm.unidad}>{vm.unidad}</option>
              )}
              {(caps.unidadOptions ?? []).map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </label>
        )}
        {caps.showImporte && caps.editablePrecio && (
          <label className="flex items-center gap-1 ml-auto text-xs">
            <span className="text-muted-foreground">P.U.</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={vm.precioUnitario ?? 0}
              onChange={(e) => cb.onPrecio?.(vm.uid, Math.max(0, parseFloat(e.target.value) || 0))}
              className="h-7 w-24 text-right text-xs px-1 rounded border border-border bg-card"
            />
          </label>
        )}
        {caps.showImporte && !caps.editablePrecio && (
          <span className="font-mono font-bold ml-auto">
            ${vm.importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
      </div>

      {caps.showCosto && (
        <div className="text-[11px] text-muted-foreground">
          PU:{' '}
          <span className="font-mono">
            ${vm.costoOc.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="ml-2">
            Orig {vm.productCurrency} ${vm.costOrigen.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      )}

      {caps.showUtilidad && (
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground w-20">Util %</span>
          <input
            type="number"
            min={0}
            max={99}
            value={vm.utilidad}
            onChange={(e) => cb.onUtilidad?.(vm.uid, Math.min(99, Math.max(0, parseFloat(e.target.value) || 0)))}
            className="h-7 w-20 text-center text-xs px-1 rounded border border-border bg-card"
          />
        </label>
      )}

      {caps.showDescuento && (
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground w-20">Desc %</span>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={vm.descuento}
            onChange={(e) => cb.onDescuento?.(vm.uid, Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
            className="h-7 w-20 text-center text-xs px-1 rounded border border-border bg-card"
          />
        </label>
      )}

      {caps.showEntrega && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground w-20">Entrega</span>
          <input
            type="number"
            placeholder="min"
            value={vm.entrega_min ?? ''}
            onChange={(e) =>
              cb.onEntrega?.(vm.uid, { entrega_min: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value) || 0) })
            }
            className="h-7 w-14 text-center text-xs px-1 rounded border border-border bg-card"
          />
          <span className="text-muted-foreground">–</span>
          <input
            type="number"
            placeholder="max"
            value={vm.entrega_max ?? ''}
            onChange={(e) =>
              cb.onEntrega?.(vm.uid, { entrega_max: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value) || 0) })
            }
            className="h-7 w-14 text-center text-xs px-1 rounded border border-border bg-card"
          />
          <select
            value={vm.entrega_unidad ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              const u = v === 'dias' || v === 'semanas' ? v : null;
              cb.onEntrega?.(vm.uid, { entrega_unidad: u, ...(u == null ? { entrega_min: null, entrega_max: null } : {}) });
            }}
            className="h-7 text-[11px] rounded border border-border bg-card px-1"
          >
            <option value="">—</option>
            <option value="dias">días</option>
            <option value="semanas">sem.</option>
          </select>
        </div>
      )}

      {cb.onEdit && (
        <div className="flex items-center justify-end">
          <button type="button" onClick={() => cb.onEdit?.(vm.uid)} className="text-[11px] text-accent-glow hover:underline">
            Editar línea
          </button>
        </div>
      )}

      {expandedRenderer && (
        <>
          <button
            type="button"
            onClick={() => cb.onToggleExpand(vm.uid)}
            aria-expanded={vm.expanded}
            className="text-[11px] text-accent-glow flex items-center gap-1"
          >
            {vm.expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {vm.expanded ? 'Cerrar detalles' : 'Detalles'}
          </button>
          {vm.expanded && (
            <div className="mt-2 border-t border-border pt-2">{expandedRenderer(vm.uid, 'card')}</div>
          )}
        </>
      )}
    </div>
  );
}
