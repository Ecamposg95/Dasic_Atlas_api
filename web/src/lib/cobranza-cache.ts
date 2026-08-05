import type { QueryClient } from '@tanstack/react-query';

/**
 * Invalida todo lo que cambia cuando se aplica un pago de un cliente.
 *
 * Existe porque el saldo de un cliente se lee desde dos módulos que no se
 * conocen entre sí —la ficha de la empresa (`clientes`) y el tablero de
 * cobranza (`cxc`)— y cada uno invalidaba solo sus propias claves. El
 * resultado eran dos bugs espejo: registrar un pago desde la ficha dejaba el
 * aging viejo, y registrarlo desde cobranza dejaba el saldo viejo en la
 * pestaña de al lado. Con `staleTime: 30_000` y `refetchOnWindowFocus: false`
 * (ver `queryClient.ts`), ninguna de las dos se corregía sola.
 *
 * Cualquier flujo nuevo que mueva saldo debe llamar aquí en vez de enumerar
 * claves a mano: es justo esa enumeración la que se desincronizó.
 */
export function invalidarCobranza(qc: QueryClient, clienteId?: number) {
  // Vistas del cliente concreto. Sin `clienteId` se invalida el prefijo, que
  // cubre a todos — más caro, pero nunca incorrecto.
  if (clienteId != null) {
    void qc.invalidateQueries({ queryKey: ['cxc-cliente', clienteId] });
    void qc.invalidateQueries({ queryKey: ['estado-cuenta', clienteId] });
    void qc.invalidateQueries({ queryKey: ['empresa', clienteId] });
  } else {
    void qc.invalidateQueries({ queryKey: ['cxc-cliente'] });
    void qc.invalidateQueries({ queryKey: ['estado-cuenta'] });
    void qc.invalidateQueries({ queryKey: ['empresa'] });
  }

  // Agregados del tablero de cobranza: cambian con cualquier pago.
  void qc.invalidateQueries({ queryKey: ['cxc-resumen'] });
  void qc.invalidateQueries({ queryKey: ['cxc-vencimientos'] });
  void qc.invalidateQueries({ queryKey: ['cxc-aging'] });
  void qc.invalidateQueries({ queryKey: ['cxc-top-deudores'] });

  // El listado de clientes muestra saldo por fila.
  void qc.invalidateQueries({ queryKey: ['clientes'] });
}
