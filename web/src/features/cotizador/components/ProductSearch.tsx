// Wrapper delgado sobre el panel compartido `components/document/ProductSearchPanel`
// (Ola 1-A del editor híbrido de remisiones). Toda la UI vive en el panel;
// aquí solo se conecta el store del cotizador vía los default handlers.
// El contrato público (`ProductSearch` + `ProductSearchHandlers`) se conserva
// intacto para que CotizadorPage y RemisionProductSearch no cambien.
import { ProductSearchPanel } from '@/components/document/ProductSearchPanel';
import { fetchAutoUtilidad } from '../hooks/useAutoUtilidad';
import { useCotizador } from '../store';
import type { Producto, Servicio } from '../types';
import type { FantasmaPrevio } from '../hooks/useFantasmasSearch';

export type ProductSearchHandlers = {
  onPickProducto: (p: Producto, qty: number) => void | Promise<void>;
  onPickServicio: (s: Servicio, qty: number) => void;
  onPickFantasma: (f: FantasmaPrevio, qty: number) => void;
  onOpenAddFantasma: (initial: { initialSku?: string; initialDescripcion?: string }) => void;
};

export function ProductSearch({ handlers }: { handlers?: ProductSearchHandlers } = {}) {
  const defaultHandlers: ProductSearchHandlers = {
    onPickProducto: async (p, qty) => {
      const cliente_id = useCotizador.getState().cliente_id;
      const util = await fetchAutoUtilidad(cliente_id, p.id);
      useCotizador.getState().addProducto(p, qty, util ?? undefined);
    },
    onPickServicio: (svc, qty) => useCotizador.getState().addServicio(svc, qty),
    onPickFantasma: (f, qty) =>
      useCotizador.getState().addLineaAdhoc({
        descripcion: f.descripcion,
        sku_libre: f.sku_libre || undefined,
        costo: Number(f.costo_referencia) || 0,
        moneda: (f.moneda || 'MXN').toUpperCase() === 'USD' ? 'USD' : 'MXN',
        proveedor_sugerido_id: f.proveedor_sugerido_id,
        utilidad: 30,
        qty,
      }),
    onOpenAddFantasma: (initial) =>
      window.dispatchEvent(new CustomEvent('cot:open-add-fantasma', { detail: initial })),
  };
  const h = handlers ?? defaultHandlers;
  return (
    <ProductSearchPanel
      onAddProducto={h.onPickProducto}
      onAddServicio={h.onPickServicio}
      onAddFantasma={h.onPickFantasma}
      onOpenAddFantasma={h.onOpenAddFantasma}
    />
  );
}
