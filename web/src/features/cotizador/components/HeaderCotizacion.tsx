import { useEffect, useState } from 'react';
import { User, Coins, ArrowRightLeft, CalendarPlus, CalendarClock, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { ClientPicker } from './ClientPicker';
import { Input } from '@/components/ui/input';
import { fechaLocalISO, fechaLocalISOMas } from '@/lib/fechas';
import { useCotizador } from '../store';
import { useConfig } from '../hooks/useConfig';
import { TCMiniTable } from './TCMiniTable';
import { UltimaCotHint } from './UltimaCotHint';

export function HeaderCotizacion() {
  const moneda = useCotizador((s) => s.moneda);
  const setMoneda = useCotizador((s) => s.setMoneda);
  const tc = useCotizador((s) => s.tc);
  const setTc = useCotizador((s) => s.setTc);
  const cart = useCotizador((s) => s.cart);
  const fechaCreacion = useCotizador((s) => s.fecha_creacion);
  const setFechaCreacion = useCotizador((s) => s.setFechaCreacion);
  const fechaVencimiento = useCotizador((s) => s.fecha_vencimiento);
  const setFechaVencimiento = useCotizador((s) => s.setFechaVencimiento);
  const editingId = useCotizador((s) => s.editingId);
  const clienteId = useCotizador((s) => s.cliente_id);
  const { config } = useConfig();

  // Defaults para cotización nueva: hoy + vigencia (config.quote_validity_days).
  useEffect(() => {
    if (editingId != null) return;
    if (fechaCreacion == null) {
      setFechaCreacion(fechaLocalISO());
    }
    if (fechaVencimiento == null) {
      setFechaVencimiento(fechaLocalISOMas(config.quote_validity_days || 15));
    }
  }, [editingId, fechaCreacion, fechaVencimiento, config.quote_validity_days, setFechaCreacion, setFechaVencimiento]);

  // Regla Jinja `actualizarVisibilidadTC`: el TC se atenúa visualmente
  // cuando NO se necesita (cot MXN sin líneas USD) pero NUNCA se bloquea
  // — una cot MXN puede tener productos USD en cualquier momento y va a
  // requerir el TC. El spread direccional (DOF±1 del modelo Excel V_03)
  // se aplica automáticamente en el backend; el usuario solo ve este TC.
  const hayLineasOtraMoneda = cart.some((i) => i.productCurrency && i.productCurrency !== moneda);
  const tcNecesario = moneda === 'USD' || hayLineasOtraMoneda;

  // Densidad: cuando el TC NO aplica (cot MXN pura) el TC + su tabla quedan tras
  // "Opciones avanzadas". Cuando SÍ aplica (USD / multidivisa) salen inline a la
  // vista, en la línea del cliente y debajo — sin esconderse tras avanzadas.
  const [avanzadasOpen, setAvanzadasOpen] = useState(false);

  // Banner aviso: hay líneas en el cart pero todavía no hay cliente.
  // No bloquea — solo advierte para que el comercial sepa que la cot no
  // se podrá guardar hasta seleccionar cliente.
  const showClienteBanner = clienteId == null && cart.length > 0;

  // Input del TC reutilizable: se renderiza inline (en la línea del cliente)
  // cuando el TC es necesario, o dentro de "Opciones avanzadas" cuando no.
  // Son ramas mutuamente excluyentes → se monta una sola vez.
  const tcInput = (
    <Input
      type="number"
      step="0.01"
      min="0"
      value={tc}
      onChange={(e) => setTc(parseFloat(e.target.value) || 0)}
      className="h-8 text-xs text-right font-mono w-full"
      title="Tipo de cambio MXN/USD. Se respeta siempre, regardless de la moneda de la cotización — una cot MXN puede tener productos USD."
    />
  );

  return (
    <>
      {showClienteBanner && (
        <div className="mb-2 px-3 py-2 rounded-md bg-amber-900/20 border border-amber-700/50 text-amber-200 text-xs flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Selecciona un cliente para que esta cotización pueda guardarse.</span>
        </div>
      )}
    <div className="bg-card border border-border rounded-xl p-3 space-y-2">
      {/* LÍNEA 1: campos empacados en una fila; Cliente crece para llenar el
          ancho, el resto (Moneda/TC/fechas) van al tamaño de su contenido.
          En < sm (plan móvil F1) apilan a ancho completo con orden fijo:
          Cliente → (Moneda | TC) → (F. creación | F. vencimiento); los pares
          van en wrappers `grid grid-cols-2 sm:contents` que desaparecen del
          layout en sm+ (display: contents), dejando el desktop intacto. */}
      <div className="flex flex-wrap items-start gap-3">
        {/* Cliente (crece) — ClientPicker incluye el sub-selector "Atiende a". */}
        <div className="w-full min-w-0 sm:flex-1 sm:min-w-[260px]">
          <label className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground mb-1 flex items-center gap-1.5">
            <User className="h-3 w-3" />
            Cliente
          </label>
          <ClientPicker />
          <UltimaCotHint clienteId={clienteId} />
        </div>

        {/* Moneda + TC: dos columnas en < sm; en sm+ el wrapper se disuelve. */}
        <div className="grid grid-cols-2 gap-3 w-full sm:contents">
        {/* Moneda */}
        <div className="w-full sm:w-[110px] sm:shrink-0">
          <label className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground mb-1 flex items-center gap-1.5">
            <Coins className="h-3 w-3" />
            Moneda
          </label>
          <select
            value={moneda}
            onChange={(e) => setMoneda(e.target.value as 'MXN' | 'USD')}
            className="w-full h-8 rounded-md border border-border-strong bg-card px-2 text-xs focus:border-accent-glow focus:ring-2 focus:ring-accent-glow/40 outline-none"
          >
            <option value="MXN">MXN</option>
            <option value="USD">USD</option>
          </select>
          {/* El toggle de avanzadas solo aparece en cot MXN pura. */}
          {!tcNecesario && (
            <button
              type="button"
              onClick={() => setAvanzadasOpen((v) => !v)}
              aria-expanded={avanzadasOpen}
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1 whitespace-nowrap min-h-[40px] sm:min-h-0"
            >
              {avanzadasOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Avanzadas
            </button>
          )}
        </div>

        {/* TC inline cuando aplica — junto a Moneda, en la misma línea. */}
        {tcNecesario && (
          <div className="w-full sm:w-[120px] sm:shrink-0">
            <label className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground mb-1 flex items-center gap-1.5">
              <ArrowRightLeft className="h-3 w-3" />
              TC
            </label>
            {tcInput}
          </div>
        )}
        </div>

        {/* Fechas: dos columnas en < sm; en sm+ el wrapper se disuelve. */}
        <div className="grid grid-cols-2 gap-3 w-full sm:contents">
        <div className="w-full sm:w-[150px] sm:shrink-0">
          <label className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground mb-1 flex items-center gap-1.5">
            <CalendarPlus className="h-3 w-3" />
            F. creación
          </label>
          <Input
            type="date"
            value={fechaCreacion ?? ''}
            onChange={(e) => setFechaCreacion(e.target.value || null)}
            className="h-8 text-xs w-full"
          />
        </div>

        <div className="w-full sm:w-[150px] sm:shrink-0">
          <label className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground mb-1 flex items-center gap-1.5">
            <CalendarClock className="h-3 w-3" />
            F. vencimiento
          </label>
          <Input
            type="date"
            value={fechaVencimiento ?? ''}
            onChange={(e) => setFechaVencimiento(e.target.value || null)}
            className="h-8 text-xs w-full"
          />
        </div>
        </div>

        <div className="text-[11px] text-muted-foreground self-stretch flex items-end pb-1 whitespace-nowrap">
          Vigencia: {config.quote_validity_days} días
        </div>
      </div>

      {/* LÍNEA 2: la tabla TC (DOF / MN→USD / USD→MN / tolerancia) a lo ancho,
          a la vista cuando el TC aplica. */}
      {tcNecesario && <TCMiniTable />}

      {/* Cot MXN pura: TC + tabla detrás de "Opciones avanzadas" (colapsado). */}
      {!tcNecesario && avanzadasOpen && (
        <div className="flex flex-wrap items-start gap-3">
          <div className="w-full sm:w-[120px] sm:shrink-0 opacity-60">
            <label className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground mb-1 flex items-center gap-1.5">
              <ArrowRightLeft className="h-3 w-3" />
              TC
              <span className="text-muted-foreground normal-case tracking-normal font-normal text-[10px]">
                (no req.)
              </span>
            </label>
            {tcInput}
          </div>
          <div className="w-full min-w-0 sm:flex-1 sm:min-w-[280px]">
            <TCMiniTable />
          </div>
        </div>
      )}
    </div>
    </>
  );
}
