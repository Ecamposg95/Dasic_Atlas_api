// Modal "Nueva OC manual" — MVP fantasma-only.
//
// Permite capturar una orden de compra a un proveedor sin pasar por una
// cotización origen. Las líneas son fantasma (sku_libre + descripcion_libre)
// porque el selector de productos del catálogo se difiere a una versión
// posterior. El backend (`POST /api/compras/`) acepta líneas mixtas
// producto/fantasma, así que extender después es seguro sin cambios al server.
//
// Permisos: visible solo para admin / gerente comercial (ver ComprasPage).

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from '@/lib/toast';
import type { ApiError } from '@/lib/api';
import { useProveedores } from '../hooks/useProveedores';
import { useCrearOC, type CrearOCLineaPayload } from '../hooks/useCrearOC';
import type { Moneda } from '../types';

type Linea = {
  sku: string;
  descripcion: string;
  cantidad: string;        // string en el form, parseado al submit
  costo_unitario: string;
  moneda_origen: Moneda;
};

function lineaVacia(monedaOC: Moneda): Linea {
  return {
    sku: '',
    descripcion: '',
    cantidad: '1',
    costo_unitario: '0',
    moneda_origen: monedaOC,
  };
}

type Props = {
  onClose: () => void;
};

export function OrdenCompraFormModal({ onClose }: Props) {
  const { data: proveedores, isLoading: cargandoProveedores } = useProveedores();
  const crearMut = useCrearOC();

  const [proveedorId, setProveedorId] = useState<number | ''>('');
  const [moneda, setMoneda] = useState<Moneda>('MXN');
  const [tipoCambio, setTipoCambio] = useState<string>('20.00');
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia('MXN')]);
  const [formErr, setFormErr] = useState<string | null>(null);

  const totalEstimado = useMemo(() => {
    const tc = Number(tipoCambio) || 1;
    return lineas.reduce((acc, l) => {
      const c = Number(l.costo_unitario) || 0;
      const q = Number(l.cantidad) || 0;
      let costoOC = c;
      const og = l.moneda_origen;
      if (og !== moneda) {
        if (og === 'USD' && moneda === 'MXN') costoOC = c * tc;
        else if (og === 'MXN' && moneda === 'USD') costoOC = c / (tc || 1);
      }
      return acc + costoOC * q;
    }, 0);
  }, [lineas, moneda, tipoCambio]);

  function updateLinea(idx: number, patch: Partial<Linea>) {
    setLineas((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function addLinea() {
    setLineas((ls) => [...ls, lineaVacia(moneda)]);
  }

  function removeLinea(idx: number) {
    setLineas((ls) => (ls.length <= 1 ? ls : ls.filter((_, i) => i !== idx)));
  }

  function onSubmit() {
    setFormErr(null);

    if (!proveedorId) {
      setFormErr('Selecciona un proveedor.');
      return;
    }
    if (lineas.length === 0) {
      setFormErr('Agrega al menos un renglón.');
      return;
    }

    const tc = Number(tipoCambio);
    if (!Number.isFinite(tc) || tc <= 0) {
      setFormErr('Tipo de cambio inválido.');
      return;
    }

    const detalles: CrearOCLineaPayload[] = [];
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      const descripcion = l.descripcion.trim();
      const cantidad = Number(l.cantidad);
      const costo = Number(l.costo_unitario);

      if (!descripcion) {
        setFormErr(`Renglón ${i + 1}: la descripción es obligatoria.`);
        return;
      }
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        setFormErr(`Renglón ${i + 1}: la cantidad debe ser mayor a 0.`);
        return;
      }
      if (!Number.isFinite(costo) || costo < 0) {
        setFormErr(`Renglón ${i + 1}: el costo unitario debe ser ≥ 0.`);
        return;
      }
      detalles.push({
        producto_id: null,
        sku_libre: l.sku.trim() || null,
        descripcion_libre: descripcion,
        cantidad,
        costo_unitario: costo,
        moneda_origen: l.moneda_origen,
      });
    }

    crearMut.mutate(
      {
        proveedor_id: Number(proveedorId),
        cotizacion_id: null,
        moneda,
        tipo_cambio: tc,
        detalles,
      },
      {
        onSuccess: (oc) => {
          toast({
            kind: 'success',
            title: 'OC creada',
            description: `Folio ${oc.folio ?? `#${oc.id}`} en estatus borrador.`,
          });
          onClose();
        },
        onError: (e: ApiError) => {
          if (e.status === 401) {
            window.location.href = '/spa/login';
            return;
          }
          if (e.status === 403) {
            setFormErr('Sin permiso: requiere rol admin o asistente.');
            return;
          }
          setFormErr(e.detail ?? 'No se pudo crear la OC.');
        },
      },
    );
  }

  const fmtMoneda = (n: number) =>
    `${moneda === 'USD' ? 'US$' : '$'}${Number(n || 0).toLocaleString('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <Modal title="Nueva orden de compra" onClose={onClose} size="xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <p className="text-xs text-muted-foreground">
          MVP: líneas libres (fantasma) — captura SKU/descripción a mano. La OC
          se crea en estatus <span className="font-medium">borrador</span> y no
          afecta stock ni cuentas por pagar hasta que se reciba.
        </p>

        {/* Cabecera */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <FormField label="Proveedor" required>
            <Select
              value={proveedorId === '' ? '' : String(proveedorId)}
              onChange={(e) => {
                const v = e.target.value;
                setProveedorId(v === '' ? '' : Number(v));
              }}
              disabled={cargandoProveedores || crearMut.isPending}
            >
              <option value="">— Elige proveedor —</option>
              {(proveedores ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre_empresa}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Moneda OC">
            <Select
              value={moneda}
              onChange={(e) => setMoneda(e.target.value as Moneda)}
              disabled={crearMut.isPending}
            >
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
            </Select>
          </FormField>

          <FormField label="Tipo de cambio" required>
            <Input
              type="number"
              step="0.0001"
              min="0.0001"
              value={tipoCambio}
              onChange={(e) => setTipoCambio(e.target.value)}
              disabled={crearMut.isPending}
              className="font-mono text-right"
            />
          </FormField>
        </div>

        {/* Líneas */}
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-surface-2 text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left w-32">SKU (P/N)</th>
                <th className="px-2 py-2 text-left">Descripción *</th>
                <th className="px-2 py-2 text-right w-20">Cantidad</th>
                <th className="px-2 py-2 text-right w-28">Costo unit.</th>
                <th className="px-2 py-2 text-left w-20">Moneda</th>
                <th className="px-2 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, idx) => (
                <tr
                  key={idx}
                  className="border-t border-border"
                >
                  <td className="p-1">
                    <Input
                      value={l.sku}
                      onChange={(e) => updateLinea(idx, { sku: e.target.value })}
                      placeholder="P/N"
                      className="h-8 text-xs font-mono"
                      disabled={crearMut.isPending}
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      value={l.descripcion}
                      onChange={(e) => updateLinea(idx, { descripcion: e.target.value })}
                      placeholder="Descripción del artículo"
                      className="h-8 text-xs"
                      disabled={crearMut.isPending}
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={l.cantidad}
                      onChange={(e) => updateLinea(idx, { cantidad: e.target.value })}
                      className="h-8 text-xs text-right font-mono"
                      disabled={crearMut.isPending}
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={l.costo_unitario}
                      onChange={(e) => updateLinea(idx, { costo_unitario: e.target.value })}
                      className="h-8 text-xs text-right font-mono"
                      disabled={crearMut.isPending}
                    />
                  </td>
                  <td className="p-1">
                    <Select
                      value={l.moneda_origen}
                      onChange={(e) =>
                        updateLinea(idx, { moneda_origen: e.target.value as Moneda })
                      }
                      className="h-8 text-xs"
                      disabled={crearMut.isPending}
                    >
                      <option value="MXN">MXN</option>
                      <option value="USD">USD</option>
                    </Select>
                  </td>
                  <td className="p-1 text-center">
                    <button
                      type="button"
                      onClick={() => removeLinea(idx)}
                      disabled={crearMut.isPending || lineas.length <= 1}
                      className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 disabled:opacity-30"
                      title={lineas.length <= 1 ? 'Debe haber al menos una línea' : 'Quitar línea'}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface-2">
              <tr>
                <td colSpan={3} className="px-2 py-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addLinea}
                    disabled={crearMut.isPending}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Añadir línea
                  </Button>
                </td>
                <td colSpan={2} className="px-2 py-2 text-right font-bold text-foreground">
                  Total estimado:{' '}
                  <span className="font-mono text-accent-deep dark:text-accent-glow">
                    {fmtMoneda(totalEstimado)}
                  </span>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {formErr && (
          <div className="text-xs bg-rose-100 border border-rose-300 text-rose-700 dark:bg-rose-900/30 dark:border-rose-700/50 dark:text-rose-300 rounded p-2">
            {formErr}
          </div>
        )}
      </div>

      <ModalFooter>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={crearMut.isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={crearMut.isPending}>
          {crearMut.isPending ? 'Guardando…' : 'Crear OC (borrador)'}
        </Button>
      </ModalFooter>
      </form>
    </Modal>
  );
}
