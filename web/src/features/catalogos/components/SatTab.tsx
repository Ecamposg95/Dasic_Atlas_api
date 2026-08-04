/**
 * SatTab — Navegador de catálogos SAT (solo lectura).
 *
 * Catálogos con búsqueda (typeahead):
 *   - clave-prod-serv  (q ≥ 2 chars)
 *   - clave-unidad     (q ≥ 1 char)
 *
 * Catálogos pequeños (devuelven lista completa):
 *   - forma-pago, metodo-pago, uso-cfdi, regimen-fiscal,
 *     objeto-imp, moneda, tipo-comprobante
 *
 * Convención de shapes (de app/schemas/sat.py):
 *   Catálogos simples:  { codigo, descripcion, activo, ...extras }
 *   SatClaveUnidad:     { codigo, nombre, descripcion?, simbolo?, activo }
 */

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DataTable,
  DataTableBody,
  DataTableEmpty,
  DataTableHead,
  DataTableRow,
} from '@/components/ui/data-table';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SatSimple = {
  codigo: string;
  descripcion: string;
  activo: boolean;
};

type SatClaveUnidad = {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  simbolo: string | null;
  activo: boolean;
};

type SatRegimenFiscal = SatSimple & {
  aplica_persona_fisica: boolean;
  aplica_persona_moral: boolean;
};

// ---------------------------------------------------------------------------
// Catalog definitions
// ---------------------------------------------------------------------------

type CatalogKey =
  | 'clave-prod-serv'
  | 'clave-unidad'
  | 'forma-pago'
  | 'metodo-pago'
  | 'uso-cfdi'
  | 'regimen-fiscal'
  | 'objeto-imp'
  | 'moneda'
  | 'tipo-comprobante';

type CatalogDef = {
  key: CatalogKey;
  label: string;
  typeahead: boolean;       // true → requiere búsqueda, false → carga todo
  minQ?: number;            // mínimo de chars para disparar búsqueda
};

const CATALOGS: CatalogDef[] = [
  { key: 'clave-prod-serv',   label: 'Clave Prod/Serv (c_ClaveProdServ)', typeahead: true,  minQ: 2 },
  { key: 'clave-unidad',      label: 'Clave Unidad (c_ClaveUnidad)',       typeahead: true,  minQ: 1 },
  { key: 'forma-pago',        label: 'Forma de Pago',                      typeahead: false },
  { key: 'metodo-pago',       label: 'Método de Pago',                     typeahead: false },
  { key: 'uso-cfdi',          label: 'Uso CFDI',                           typeahead: false },
  { key: 'regimen-fiscal',    label: 'Régimen Fiscal',                     typeahead: false },
  { key: 'objeto-imp',        label: 'Objeto de Impuesto',                 typeahead: false },
  { key: 'moneda',            label: 'Moneda',                             typeahead: false },
  { key: 'tipo-comprobante',  label: 'Tipo de Comprobante',                typeahead: false },
];

const SELECT_CLS =
  'h-10 rounded-md border border-border-strong bg-card px-2 text-sm';

// ---------------------------------------------------------------------------
// Debounce helper
// ---------------------------------------------------------------------------

function useDebounced(value: string, delay = 350): string {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return d;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SatTab() {
  const [selectedKey, setSelectedKey] = useState<CatalogKey>('forma-pago');
  const [q, setQ] = useState('');
  const qDebounced = useDebounced(q);
  const prevKey = useRef(selectedKey);

  // Reset search when catalog changes
  useEffect(() => {
    if (prevKey.current !== selectedKey) {
      setQ('');
      prevKey.current = selectedKey;
    }
  }, [selectedKey]);

  const catalog = CATALOGS.find((c) => c.key === selectedKey)!;

  // Build query key + fn
  const shouldFetch = catalog.typeahead
    ? qDebounced.length >= (catalog.minQ ?? 1)
    : true;

  const { data = [], isLoading, error } = useQuery<unknown[]>({
    queryKey: ['sat', selectedKey, catalog.typeahead ? qDebounced : 'all'],
    queryFn: () => {
      const path = catalog.typeahead
        ? `/api/sat/${selectedKey}?q=${encodeURIComponent(qDebounced)}&limit=50`
        : `/api/sat/${selectedKey}`;
      return api.get<unknown[]>(path);
    },
    enabled: shouldFetch,
    staleTime: 300_000, // catálogos SAT no cambian durante la sesión
  });

  const hasError = Boolean(error);

  // Render rows depending on catalog type
  function renderRows() {
    if (isLoading) {
      return <DataTableEmpty colSpan={3}>Cargando catálogo SAT…</DataTableEmpty>;
    }
    if (hasError) {
      return <DataTableEmpty colSpan={3}>Error al cargar catálogo. Intente de nuevo.</DataTableEmpty>;
    }
    if (!shouldFetch) {
      return (
        <DataTableEmpty colSpan={3}>
          Escribe al menos {catalog.minQ} carácter(es) para buscar.
        </DataTableEmpty>
      );
    }
    if (data.length === 0) {
      return <DataTableEmpty colSpan={3}>Sin resultados para "{qDebounced}"</DataTableEmpty>;
    }

    if (selectedKey === 'clave-unidad') {
      return (data as SatClaveUnidad[]).map((r) => (
        <DataTableRow key={r.codigo}>
          <td className="p-3 font-mono text-xs">{r.codigo}</td>
          <td className="p-3 text-sm">
            {r.nombre}
            {r.simbolo && <span className="ml-1.5 text-xs text-muted-foreground">({r.simbolo})</span>}
            {r.descripcion && (
              <div className="text-xs text-muted-foreground mt-0.5">{r.descripcion}</div>
            )}
          </td>
          <td className="p-3 text-center">
            <Badge variant={r.activo ? 'emerald' : 'slate'}>{r.activo ? 'Activo' : 'Inactivo'}</Badge>
          </td>
        </DataTableRow>
      ));
    }

    if (selectedKey === 'regimen-fiscal') {
      return (data as SatRegimenFiscal[]).map((r) => (
        <DataTableRow key={r.codigo}>
          <td className="p-3 font-mono text-xs">{r.codigo}</td>
          <td className="p-3 text-sm">
            {r.descripcion}
            <div className="flex gap-1.5 mt-0.5 flex-wrap">
              {r.aplica_persona_fisica && (
                <span className="text-[10px] bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 px-1.5 py-0.5 rounded">Física</span>
              )}
              {r.aplica_persona_moral && (
                <span className="text-[10px] bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded">Moral</span>
              )}
            </div>
          </td>
          <td className="p-3 text-center">
            <Badge variant={r.activo ? 'emerald' : 'slate'}>{r.activo ? 'Activo' : 'Inactivo'}</Badge>
          </td>
        </DataTableRow>
      ));
    }

    // Generic (all other catalogs with codigo + descripcion)
    return (data as SatSimple[]).map((r) => (
      <DataTableRow key={r.codigo}>
        <td className="p-3 font-mono text-xs">{r.codigo}</td>
        <td className="p-3 text-sm">{r.descripcion}</td>
        <td className="p-3 text-center">
          <Badge variant={r.activo ? 'emerald' : 'slate'}>{r.activo ? 'Activo' : 'Inactivo'}</Badge>
        </td>
      </DataTableRow>
    ));
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value as CatalogKey)}
          className={SELECT_CLS + ' min-w-[220px]'}
        >
          {CATALOGS.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>

        {catalog.typeahead && (
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Buscar en ${catalog.label}…`}
              className="pl-8"
            />
          </div>
        )}

        {!catalog.typeahead && (
          <span className="text-xs text-muted-foreground">Lista completa · {data.length} registros</span>
        )}

        {catalog.typeahead && shouldFetch && (
          <span className="text-xs text-muted-foreground">{data.length} resultado(s)</span>
        )}
      </div>

      {/* Table */}
      <DataTable>
        <DataTableHead>
          <tr>
            <th className="p-3 text-left w-32">Código</th>
            <th className="p-3 text-left">Descripción</th>
            <th className="p-3 text-center w-24">Estatus</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {renderRows()}
        </DataTableBody>
      </DataTable>

      <p className="text-xs text-muted-foreground">
        Catálogos SAT (CFDI 4.0) — solo lectura. Los datos son canon del SAT y no se editan desde la aplicación.
      </p>
    </div>
  );
}
