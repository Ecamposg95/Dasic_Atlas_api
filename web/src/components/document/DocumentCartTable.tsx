import { Fragment, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Tag, Hash, DollarSign, Percent, Truck, Calculator, Minus } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { DocumentRow, SortableDocumentRow, DocumentRowCard } from './DocumentRow';
import type { DocRowVM, DocRowCaps, DocRowCallbacks } from './types';

export function DocumentCartTable({
  rows,
  caps,
  cb,
  expandedRenderer,
  emptyHint,
  sortable = false,
  onReorder,
}: {
  rows: DocRowVM[];
  caps: DocRowCaps;
  cb: DocRowCallbacks;
  expandedRenderer?: (uid: string, variant?: 'row' | 'card') => ReactNode;
  emptyHint?: ReactNode;
  sortable?: boolean;
  onReorder?: (fromUid: string, toUid: string) => void;
}) {
  // Hooks de DnD siempre se llaman (regla de hooks); solo se usan si sortable.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const seenUids = useRef<Set<string>>(new Set());
  const justAdded = useMemo(() => {
    const added = new Set<string>();
    for (const r of rows) if (!seenUids.current.has(r.uid)) added.add(r.uid);
    return added;
  }, [rows]);
  useEffect(() => {
    const next = new Set<string>();
    rows.forEach((r) => next.add(r.uid));
    seenUids.current = next;
  }, [rows]);

  if (rows.length === 0) return <>{emptyHint ?? null}</>;

  const body = (
    <tbody>
      {rows.map((vm) => (
        <Fragment key={vm.uid}>
          {sortable ? (
            <SortableDocumentRow vm={vm} caps={caps} cb={cb} justAdded={justAdded.has(vm.uid)} />
          ) : (
            <DocumentRow vm={vm} caps={caps} cb={cb} justAdded={justAdded.has(vm.uid)} />
          )}
          {vm.expanded && expandedRenderer?.(vm.uid)}
        </Fragment>
      ))}
    </tbody>
  );

  const desktopTable = (
    <div className="hidden md:block bg-card border border-border rounded-xl overflow-x-auto">
      <table className="w-full text-[13px] min-w-[680px]">
          <thead className="bg-surface-2 text-[11px] text-muted-foreground uppercase tracking-[0.15em] sticky top-0 z-10">
            <tr>
              <th className="p-2.5 text-left">
                <span className="inline-flex items-center gap-1">
                  <Tag className="h-3 w-3" /> SKU / Descripción
                </span>
              </th>
              <th className="p-2.5 text-center w-20">
                <span className="inline-flex items-center gap-1">
                  <Hash className="h-3 w-3" /> Cant
                </span>
              </th>
              {caps.showCosto && (
                <th className="p-2.5 text-right w-28">
                  <span className="inline-flex items-center gap-1 justify-end">
                    <DollarSign className="h-3 w-3" /> Costo
                  </span>
                </th>
              )}
              {caps.showUtilidad && (
                <th className="p-2.5 text-center w-16">
                  <span className="inline-flex items-center gap-1">
                    <Percent className="h-3 w-3" /> Util
                  </span>
                </th>
              )}
              {caps.showDescuento && (
                <th className="p-2.5 text-center w-16">
                  <span className="inline-flex items-center gap-1">
                    <Minus className="h-3 w-3" /> Desc
                  </span>
                </th>
              )}
              {caps.showEntrega && (
                <th className="p-2.5 text-center w-40">
                  <span className="inline-flex items-center gap-1">
                    <Truck className="h-3 w-3" /> Entrega
                  </span>
                </th>
              )}
              {caps.showImporte && (
                <th className="p-2.5 text-right w-28">
                  <span className="inline-flex items-center gap-1 justify-end">
                    <Calculator className="h-3 w-3" /> Importe
                  </span>
                </th>
              )}
              <th className="p-2.5 text-center w-8"></th>
            </tr>
          </thead>
          {body}
      </table>
    </div>
  );

  return (
    <>
      {sortable ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => {
            const { active, over } = e;
            if (over && active.id !== over.id) onReorder?.(String(active.id), String(over.id));
          }}
        >
          <SortableContext items={rows.map((r) => r.uid)} strategy={verticalListSortingStrategy}>
            {desktopTable}
          </SortableContext>
        </DndContext>
      ) : (
        desktopTable
      )}
      <div className="md:hidden space-y-2">
        {rows.map((vm) => (
          <DocumentRowCard key={vm.uid} vm={vm} caps={caps} cb={cb} expandedRenderer={expandedRenderer} />
        ))}
      </div>
    </>
  );
}
