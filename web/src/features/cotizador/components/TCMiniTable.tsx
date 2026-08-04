// web/src/features/cotizador/components/TCMiniTable.tsx
import { useEffect } from 'react';
import { RefreshCw, ArrowUp } from 'lucide-react';
import { useCotizador } from '../store';
import { resolveDirectionalTcs } from '../lib/calc';
import { useFX, useFXRefresh } from '../hooks/useFX';
import { toast } from '@/lib/toast';
import type { ApiError } from '@/lib/api';

function fmt4(n: number) {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function fmtDelta(n: number) {
  const abs = Math.abs(n);
  return abs.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function TCMiniTable() {
  const tc = useCotizador((s) => s.tc);
  const tcMnAUsd = useCotizador((s) => s.tc_mn_a_usd);
  const tcUsdAMn = useCotizador((s) => s.tc_usd_a_mn);
  const toleranciaTc = useCotizador((s) => s.tolerancia_tc);
  const setToleranciaTc = useCotizador((s) => s.setToleranciaTc);
  const moneda = useCotizador((s) => s.moneda);
  const cart = useCotizador((s) => s.cart);
  const setTc = useCotizador((s) => s.setTc);

  const { data: fx } = useFX();
  const refresh = useFXRefresh();

  // Single source of truth: los mismos valores que CartRow/TotalsBar usan
  // para convertir líneas. Si los direccionales no se override-aron en
  // la cot, salen DOF±tolerancia_tc.
  const tcs = resolveDirectionalTcs(tc, tcMnAUsd, tcUsdAMn, toleranciaTc);
  // Modelo unificado: una sola tasa de venta = DOF + tolerancia (× a MXN, ÷ a USD).
  const deltaVenta = tcs.tc_usd_a_mn - tc;   // = +tolerancia_tc

  // La tasa de venta "aplica" cuando hay líneas en divisa distinta a la cotización.
  const hayLineasOtraMoneda = cart.some((i) => i.productCurrency && i.productCurrency !== moneda);
  const aplicaVenta = hayLineasOtraMoneda;
  const tcNecesario = moneda === 'USD' || hayLineasOtraMoneda;

  const tcInvalido = !Number.isFinite(tc) || tc <= 0;

  // Auto-rellenar el TC desde Banxico cuando la cotización requiere conversión
  // (USD, o líneas en otra moneda) y el TC sigue en un valor implausible
  // (default 1 o cualquier valor < 5; USD/MXN nunca está por debajo). Evita que
  // se cotice a ×2 por dejar el TC sin capturar. No pisa un TC ya válido.
  useEffect(() => {
    if (!tcNecesario) return;
    const rate = Number(fx?.usd_mxn);
    if (Number.isFinite(rate) && rate > 0 && (!Number.isFinite(tc) || tc < 5)) {
      setTc(rate);
    }
  }, [tcNecesario, fx, tc, setTc]);

  async function onRefresh() {
    try {
      const r = await refresh.mutateAsync();
      const nuevoTc = Number(r.usd_mxn);
      if (Number.isFinite(nuevoTc) && nuevoTc > 0) {
        setTc(nuevoTc);
        toast({
          kind: 'success',
          title: 'TC actualizado',
          description: `${r.fuente}: $${nuevoTc.toFixed(4)} (${r.fecha})`,
        });
      }
    } catch (e) {
      const err = e as ApiError;
      toast({ kind: 'error', title: 'No se pudo refrescar', description: err.detail });
    }
  }

  const containerClass = tcNecesario ? '' : 'opacity-60';
  const activeColClass = 'border-accent-glow/60 bg-background text-foreground';
  const idleColClass = 'border-border bg-surface-2 text-muted-foreground';
  const deltaBadge =
    'inline-flex items-center gap-0.5 text-[10px] font-bold px-1 py-px rounded ' +
    'bg-emerald-950/50 border border-emerald-700/50 text-emerald-300';

  return (
    <div className={`mt-1 space-y-1 ${containerClass}`}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onRefresh}
          disabled={refresh.isPending || !fx}
          className="text-[10px] flex items-center gap-1 text-muted-foreground hover:text-accent-glow transition disabled:opacity-50"
          title="Refrescar TC oficial desde Banxico"
        >
          <RefreshCw className={`h-2.5 w-2.5 ${refresh.isPending ? 'animate-spin' : ''}`} />
          <span>
            {fx
              ? `${fx.fuente} · ${fx.fecha}`
              : 'Cargando TC…'}
          </span>
        </button>
        <label
          className="text-[10px] flex items-center gap-1 text-muted-foreground"
          title="Tolerancia simétrica del spread DOF±X. Rango 0.1 a 1.0 (step 0.1). Aplica solo cuando una línea está en divisa distinta a la cotización."
        >
          <span>Tolerancia ±</span>
          <input
            type="number"
            min="0.1"
            max="1.0"
            step="0.1"
            value={toleranciaTc}
            onChange={(e) => setToleranciaTc(parseFloat(e.target.value) || 1)}
            className="w-12 h-5 px-1 text-[11px] font-mono tabular-nums rounded border border-border-strong bg-card text-foreground focus:outline-none focus:border-accent-glow"
          />
        </label>
      </div>

      <div
        className="grid grid-cols-2 gap-1"
        title={`Una sola tasa de venta = DOF + ${toleranciaTc} peso${toleranciaTc === 1 ? '' : 's'}, usada en ambas direcciones (× para USD→MN, ÷ para MN→USD). Aplica solo cuando una línea está en divisa distinta a la cotización. Protege a Dasic de variación cambiaria. La OC al proveedor usa el DOF puro (sin spread).`}
      >
        {/* DOF — costo / OC al proveedor */}
        <div className={`rounded border px-1.5 py-1 ${idleColClass}`}>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">DOF · Banxico</div>
          <div className="font-mono text-[11px] tabular-nums">
            {tcInvalido ? '—' : `$${fmt4(tc)}`}
          </div>
        </div>
        {/* TC VENTA = DOF + tolerancia — usado en ambas direcciones */}
        <div
          className={`rounded border px-1.5 py-1 ${aplicaVenta ? activeColClass : idleColClass}`}
          title="× para USD→MN · ÷ para MN→USD"
        >
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">TC venta · × MXN ÷ USD</div>
          <div className="flex items-center gap-1">
            <span className="font-mono text-[11px] tabular-nums">
              {tcInvalido ? '—' : `$${fmt4(tcs.tc_usd_a_mn)}`}
            </span>
            {!tcInvalido && (
              <span className={deltaBadge}>
                <ArrowUp className="h-2 w-2" />
                {fmtDelta(deltaVenta)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
