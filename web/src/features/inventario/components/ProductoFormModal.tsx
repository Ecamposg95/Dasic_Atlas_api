import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { SatCombobox } from '@/components/ui/sat-combobox';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { Marca, Moneda, Producto, ProductoCreate, ProductoUpdate, Proveedor } from '../types';

type Props = {
  producto?: Producto;
  marcas: Marca[];
  proveedores: Proveedor[];
  onClose: () => void;
};

const SELECT_CLS = 'w-full h-10 rounded-md border border-border-strong bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-glow/40';

export function ProductoFormModal({ producto, marcas, proveedores, onClose }: Props) {
  const isEdit = producto != null;

  // Form state — seeded from producto when editing
  const [sku, setSku] = useState(producto?.sku ?? '');
  const [skuComercial, setSkuComercial] = useState(producto?.sku_comercial ?? '');
  const [nombre, setNombre] = useState(producto?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? '');
  const [marcaId, setMarcaId] = useState<string>(producto?.marca_id?.toString() ?? '');
  const [categoria, setCategoria] = useState(producto?.categoria ?? '');
  const [unidad, setUnidad] = useState(producto?.unidad ?? 'PZA');
  const [stockActual, setStockActual] = useState(String(producto?.stock_actual ?? 0));
  const [stockMinimo, setStockMinimo] = useState(String(producto?.stock_minimo ?? 0));
  const [monedaCompra, setMonedaCompra] = useState<Moneda>(producto?.moneda_compra ?? 'MXN');
  const [costoCompra, setCostoCompra] = useState(String(producto?.costo_compra ?? ''));
  const [precioPublico, setPrecioPublico] = useState(String(producto?.precio_publico ?? ''));
  const [precioMayorista, setPrecioMayorista] = useState(String(producto?.precio_mayorista ?? 0));
  const [precioDistribuidor, setPrecioDistribuidor] = useState(String(producto?.precio_distribuidor ?? 0));
  const [provPrincipalId, setProvPrincipalId] = useState<string>(
    producto?.proveedor_principal_id?.toString() ?? '',
  );
  const [provAlternoId, setProvAlternoId] = useState<string>(
    producto?.proveedor_alterno_id?.toString() ?? '',
  );
  const [tiempoEntrega, setTiempoEntrega] = useState(String(producto?.tiempo_entrega_dias ?? 0));
  const [esServicio, setEsServicio] = useState(producto?.es_servicio ?? false);
  const [claveProdServ, setClaveProdServ] = useState(producto?.clave_prod_serv ?? '');
  const [claveUnidadSat, setClaveUnidadSat] = useState(producto?.clave_unidad_sat ?? '');
  const [err, setErr] = useState<string | null>(null);

  const qc = useQueryClient();

  const mut = useMutation<Producto, { status?: number; detail?: string }, ProductoCreate | ProductoUpdate>({
    mutationFn: (payload) =>
      isEdit
        ? api.put<Producto>(`/api/productos/${producto!.id}`, payload)
        : api.post<Producto>('/api/productos/', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] });
      toast({ kind: 'success', title: isEdit ? 'Producto actualizado' : 'Producto creado' });
      onClose();
    },
    onError: (e) => {
      if (e.status === 401) {
        window.location.href = '/spa/login';
        return;
      }
      if (e.status === 403) {
        toast({ kind: 'error', title: 'Solo admin', description: 'Se requiere rol administrador para esta acción.' });
        return;
      }
      toast({ kind: 'error', title: isEdit ? 'No se pudo actualizar' : 'No se pudo crear', description: e.detail });
    },
  });

  function onSubmit() {
    setErr(null);

    if (!nombre.trim()) {
      setErr('El nombre del producto es obligatorio.');
      return;
    }
    const costo = parseFloat(costoCompra);
    if (!Number.isFinite(costo) || costo < 0) {
      setErr('El costo de compra debe ser un número válido (≥ 0).');
      return;
    }
    if (monedaCompra !== 'MXN' && monedaCompra !== 'USD') {
      setErr('La moneda debe ser MXN o USD.');
      return;
    }

    const payload: ProductoCreate | ProductoUpdate = {
      sku: sku.trim() || null,
      sku_comercial: skuComercial.trim() || null,
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      marca_id: marcaId ? parseInt(marcaId, 10) : null,
      categoria: categoria.trim() || null,
      unidad: unidad.trim() || 'PZA',
      stock_actual: parseInt(stockActual, 10) || 0,
      stock_minimo: parseInt(stockMinimo, 10) || 0,
      moneda_compra: monedaCompra,
      costo_compra: costo,
      precio_publico: precioPublico ? parseFloat(precioPublico) : null,
      precio_mayorista: parseFloat(precioMayorista) || 0,
      precio_distribuidor: parseFloat(precioDistribuidor) || 0,
      proveedor_principal_id: provPrincipalId ? parseInt(provPrincipalId, 10) : null,
      proveedor_alterno_id: provAlternoId ? parseInt(provAlternoId, 10) : null,
      tiempo_entrega_dias: parseInt(tiempoEntrega, 10) || 0,
      es_servicio: esServicio,
      clave_prod_serv: claveProdServ.trim() || null,
      clave_unidad_sat: claveUnidadSat.trim() || null,
    };

    mut.mutate(payload);
  }

  return (
    <Modal
      title={isEdit ? `Editar — ${producto!.nombre}` : 'Nuevo producto'}
      onClose={onClose}
      size="lg"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {/* Identificación */}
        <section>
          <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Identificación</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="SKU interno">
              <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU-001" />
            </FormField>
            <FormField label="SKU comercial">
              <Input value={skuComercial} onChange={(e) => setSkuComercial(e.target.value)} placeholder="SKU-COM-001" />
            </FormField>
          </div>
        </section>

        <section>
          <div className="grid grid-cols-1 gap-3">
            <FormField label="Nombre" required>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del producto" />
            </FormField>
            <FormField label="Descripción">
              <Textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={2}
                placeholder="Descripción opcional…"
              />
            </FormField>
          </div>
        </section>

        {/* Clasificación */}
        <section>
          <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Clasificación</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <FormField label="Marca">
              <select value={marcaId} onChange={(e) => setMarcaId(e.target.value)} className={SELECT_CLS}>
                <option value="">— Sin marca —</option>
                {marcas.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Categoría">
              <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ej. Lubricantes" />
            </FormField>
            <FormField label="Unidad">
              <Input value={unidad} onChange={(e) => setUnidad(e.target.value)} placeholder="PZA" />
            </FormField>
          </div>
          {/* SAT (CFDI 4.0) — opcionales hasta facturar */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Clave producto/servicio SAT">
              <SatCombobox value={claveProdServ} onChange={setClaveProdServ} endpoint="/api/sat/clave-prod-serv" minChars={2} maxLength={8} placeholder="Buscar o escribir (ej. 31181701)" className="font-mono" />
            </FormField>
            <FormField label="Clave unidad SAT">
              <SatCombobox value={claveUnidadSat} onChange={setClaveUnidadSat} endpoint="/api/sat/clave-unidad" minChars={1} maxLength={10} placeholder="Buscar unidad (ej. H87)" className="font-mono" />
            </FormField>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              id="es_servicio"
              type="checkbox"
              checked={esServicio}
              onChange={(e) => setEsServicio(e.target.checked)}
              className="rounded border-border-strong bg-card"
            />
            <label htmlFor="es_servicio" className="text-sm text-foreground cursor-pointer">
              Es servicio (no gestiona stock)
            </label>
          </div>
        </section>

        {/* Stock */}
        <section>
          <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Stock</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Stock actual">
              <Input
                type="number"
                value={stockActual}
                onChange={(e) => setStockActual(e.target.value)}
                min="0"
              />
            </FormField>
            <FormField label="Stock mínimo">
              <Input
                type="number"
                value={stockMinimo}
                onChange={(e) => setStockMinimo(e.target.value)}
                min="0"
              />
            </FormField>
          </div>
        </section>

        {/* Costos */}
        <section>
          <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Costos y precios</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Costo de compra" required>
              <Input
                type="number"
                step="0.01"
                value={costoCompra}
                onChange={(e) => setCostoCompra(e.target.value)}
                placeholder="0.00"
              />
            </FormField>
            <FormField label="Moneda compra">
              <select value={monedaCompra} onChange={(e) => setMonedaCompra(e.target.value as Moneda)} className={SELECT_CLS}>
                <option value="MXN">MXN</option>
                <option value="USD">USD</option>
              </select>
            </FormField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            <FormField label="Precio público">
              <Input
                type="number"
                step="0.01"
                value={precioPublico}
                onChange={(e) => setPrecioPublico(e.target.value)}
                placeholder="—"
              />
            </FormField>
            <FormField label="Precio mayorista">
              <Input
                type="number"
                step="0.01"
                value={precioMayorista}
                onChange={(e) => setPrecioMayorista(e.target.value)}
                placeholder="0.00"
              />
            </FormField>
            <FormField label="Precio distribuidor">
              <Input
                type="number"
                step="0.01"
                value={precioDistribuidor}
                onChange={(e) => setPrecioDistribuidor(e.target.value)}
                placeholder="0.00"
              />
            </FormField>
          </div>
        </section>

        {/* Proveedores / logística */}
        <section>
          <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Proveedores y logística</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Proveedor principal">
              <select value={provPrincipalId} onChange={(e) => setProvPrincipalId(e.target.value)} className={SELECT_CLS}>
                <option value="">— Sin asignar —</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre_empresa}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Proveedor alterno">
              <select value={provAlternoId} onChange={(e) => setProvAlternoId(e.target.value)} className={SELECT_CLS}>
                <option value="">— Sin asignar —</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre_empresa}</option>
                ))}
              </select>
            </FormField>
          </div>
          <FormField label="Tiempo de entrega (días)" className="mt-3">
            <Input
              type="number"
              value={tiempoEntrega}
              onChange={(e) => setTiempoEntrega(e.target.value)}
              min="0"
              className="max-w-[160px]"
            />
          </FormField>
        </section>

        {err && (
          <div className="text-xs bg-rose-100 border border-rose-300 text-rose-700 dark:bg-rose-900/30 dark:border-rose-700/50 dark:text-rose-300 rounded p-2">
            {err}
          </div>
        )}
      </div>

      <ModalFooter>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={mut.isPending}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={mut.isPending}>
          {mut.isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear producto'}
        </Button>
      </ModalFooter>
      </form>
    </Modal>
  );
}
