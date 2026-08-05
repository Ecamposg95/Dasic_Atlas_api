> [!warning] DOCUMENTO HISTÓRICO — NO APLICA
> Describe la UI **SSR con Jinja2 + Alpine.js + Tailwind CDN y paleta slate**, retirada en la migración a SPA del **2026-05-22**. Hoy la UI es React + Vite + Tailwind compilado + shadcn/ui, con el design system **CIRCUITO** (tokens semánticos HSL, acento esmeralda, sidebar negro) — ninguna clase `slate-*` ni patrón Alpine de aquí es la convención vigente.
> **Se conserva solo como referencia de decisiones de diseño previas.** Para los patrones actuales ir a `CLAUDE.md` (raíz), `docs/Atlas-ONE-Proyecto.md` (§3 design system) y el código en `web/src/components/ui/` + `web/src/index.css`.

---

# UI_PATTERNS.md — Guía de Estilos y Patrones de Interfaz
# DASIC Industrial ERP · CRM-first · Multi-tenant · SSR

> **Stack UI:** Tailwind CDN + Alpine.js + Jinja2 · Tema oscuro `slate` · Sin SPA · Sin prefijos `dark:`.
> Este documento es la referencia canónica de UI para el proyecto DASIC. Todo componente nuevo debe seguir estos patrones.

---

## 1. Paleta de Color

| Rol                   | Clase Tailwind                              | Uso en DASIC                                        |
|-----------------------|---------------------------------------------|-----------------------------------------------------|
| Primario              | `primary-400 / primary-500 / primary-600`   | Botones, foco, acciones CRM, links activos           |
| Fondo base            | `slate-950`                                 | Fondo de página, modales, sidebar                    |
| Fondo tarjeta         | `slate-900 / slate-900/30`                  | Cards, tablas, paneles de deal, KPIs                 |
| Fondo elevado         | `slate-800`                                 | Hover, secondary buttons, tooltip bg                 |
| Borde                 | `slate-700 / slate-800`                     | Bordes de cards, inputs, separadores, kanban lanes   |
| Texto principal       | `text-white`                                | Títulos, nombres de cuenta, valores                  |
| Texto secundario      | `text-slate-300 / text-slate-400`           | Labels, datos de contacto, subtítulos                |
| Texto muted           | `text-slate-500 / text-slate-600`           | Placeholders, notas al pie, empty states             |
| Éxito / Ganado / OK   | `text-emerald-400`                          | Deal WON, actividades completadas, stock OK          |
| Alerta / Pendiente    | `text-amber-400`                            | Deal en riesgo, tarea vencida, stock bajo            |
| Error / Perdido       | `text-rose-400 / text-rose-500`             | Deal LOST, error, sin stock, inactivo               |
| CRM Accent            | `text-violet-400 / bg-violet-500/10`        | Etiquetas de pipeline, categoría, tipo de actividad  |
| Info / Link           | `text-primary-300 / text-blue-400`          | Botones secundarios, links de detalle               |

> **Regla:** DASIC es siempre dark. **Nunca usar** `dark:bg-*`, `dark:text-*`, `dark:border-*`. No usar `style=""` inline; siempre clases Tailwind.

---

## 2. Componentes Base

### dax-card (tarjeta base)
```html
<div class="dax-card p-4 rounded-xl">
    <!-- Contenido -->
</div>
```
> `dax-card` = fondo `slate-900/80`, borde `slate-700/50`, `backdrop-blur` sutil.  
> Úsalo en: KPI cards, paneles de deal, tablas, forms, filtros.

### glass-card (variante glassmorphism para modales/headers)
```html
<div class="glass-card p-8 rounded-2xl border border-white/5 bg-slate-900/50">
```

---

### Inputs y Selects
```html
<input type="text"
    class="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs
           outline-none focus:border-primary-500 transition placeholder-slate-600">

<select class="bg-slate-900 border border-slate-700 rounded-lg text-white text-xs
               py-2 px-3 outline-none focus:border-primary-500 transition">
```

### Textarea (para notas de actividad / cuerpo de deal)
```html
<textarea rows="3"
    class="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white
           text-xs outline-none focus:border-primary-500 transition placeholder-slate-600 resize-none">
</textarea>
```

---

### Botón Primario (acción CRM: Crear Deal, Guardar, Mover Etapa)
```html
<button class="px-4 py-2 bg-gradient-to-r from-primary-600 to-primary-500
               hover:from-primary-500 hover:to-primary-400 text-white rounded-xl
               text-xs font-black uppercase tracking-widest shadow-lg
               shadow-primary-500/20 transition-all hover:scale-105 active:scale-95">
    Crear Deal
</button>
```

### Botón Secundario / Ghost
```html
<button class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs
               font-bold rounded-lg border border-slate-700 transition">
    Cancelar
</button>
```

### Botón Peligro (Marcar como Perdido, Eliminar)
```html
<button class="px-4 py-2 bg-rose-600/20 hover:bg-rose-500 border border-rose-500/50
               rounded-lg text-xs text-rose-300 hover:text-white font-black uppercase
               tracking-wider transition-all">
    Marcar Perdido
</button>
```

### Botón Éxito (Marcar Ganado, Completar Actividad)
```html
<button class="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-500 border border-emerald-500/50
               rounded-lg text-xs text-emerald-300 hover:text-white font-black uppercase
               tracking-wider transition-all">
    <i class="fas fa-check mr-1"></i> Ganado
</button>
```

### Botón Icon-only (Refresh, Editar inline)
```html
<button class="p-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-lg
               border border-slate-700 transition">
    <i class="fas fa-sync-alt"></i>
</button>
```

---

### Badge / Pill

```html
<!-- Etapa de Pipeline / Status -->
<span class="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20
             px-2 py-0.5 rounded font-bold uppercase">Ganado</span>

<span class="text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20
             px-2 py-0.5 rounded font-bold uppercase">Perdido</span>

<span class="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20
             px-2 py-0.5 rounded font-bold uppercase">En Negociación</span>

<!-- Tipo de actividad CRM -->
<span class="text-[10px] bg-violet-500/10 text-violet-400 border border-violet-500/20
             px-1.5 py-0.5 rounded font-bold uppercase">WhatsApp</span>

<span class="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20
             px-1.5 py-0.5 rounded font-bold uppercase">Llamada</span>

<!-- ID / Folio mono -->
<span class="text-[10px] font-mono bg-slate-950 text-slate-500 px-1.5 py-0.5
             rounded border border-slate-800 font-bold">DEAL-001</span>

<!-- Rol de usuario -->
<span class="text-[10px] bg-primary-500/10 text-primary-400 border border-primary-500/20
             px-1.5 py-0.5 rounded font-bold uppercase">Admin</span>
```

---

## 3. Tablas (Patrón HQ / Admin)

```html
<div class="dax-card rounded-xl overflow-hidden">
    <table class="min-w-full divide-y divide-slate-800">
        <thead class="bg-slate-900/80">
            <tr>
                <th class="px-4 py-4 text-left text-[10px] font-bold text-slate-400
                           uppercase tracking-wider">Cuenta</th>
                <th class="px-4 py-4 text-left text-[10px] font-bold text-slate-400
                           uppercase tracking-wider">Deal</th>
                <th class="px-4 py-4 text-left text-[10px] font-bold text-slate-400
                           uppercase tracking-wider">Etapa</th>
                <th class="px-4 py-4 text-left text-[10px] font-bold text-slate-400
                           uppercase tracking-wider">Valor Est.</th>
            </tr>
        </thead>
        <tbody id="table-body" class="divide-y divide-slate-800/50 text-sm
                                      text-slate-300 bg-slate-900/30">
            <tr class="hover:bg-slate-800/60 transition group">
                <td class="px-4 py-3 font-bold text-white group-hover:text-primary-400
                           transition">DASIC Monterrey</td>
                <td class="px-4 py-3">Línea de producción CNC</td>
                <td class="px-4 py-3">
                    <span class="text-[10px] bg-amber-500/10 text-amber-400 border
                                 border-amber-500/20 px-2 py-0.5 rounded font-bold uppercase">
                        Propuesta
                    </span>
                </td>
                <td class="px-4 py-3 text-emerald-400 font-bold">$450,000</td>
            </tr>
        </tbody>
    </table>
</div>
```

**Helper JS para valor de deal:**
```javascript
function dealValueClass(val) {
    if (!val || val <= 0) return 'text-slate-500';
    if (val >= 100000) return 'text-emerald-400 font-bold';
    return 'text-slate-300 font-bold';
}
function dealStatusClass(status) {
    const map = {
        'WON': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        'LOST': 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        'OPEN': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    };
    return map[status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
}
```

---

## 4. KPI Strip (Panel de métricas CRM)

```html
<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
    <div class="dax-card p-4 rounded-xl h-24 flex flex-col justify-between">
        <p class="text-[10px] uppercase font-black text-slate-400 tracking-widest">
            Deals Activos
        </p>
        <p id="kpi-deals" class="text-2xl font-black text-white">—</p>
    </div>
    <div class="dax-card p-4 rounded-xl h-24 flex flex-col justify-between">
        <p class="text-[10px] uppercase font-black text-slate-400 tracking-widest">
            Valor Pipeline
        </p>
        <p id="kpi-valor" class="text-2xl font-black text-emerald-400">—</p>
        <p class="text-[9px] text-slate-500">Estimado total</p>
    </div>
    <div class="dax-card p-4 rounded-xl h-24 flex flex-col justify-between">
        <p class="text-[10px] uppercase font-black text-slate-400 tracking-widest">
            Actividades Hoy
        </p>
        <p id="kpi-activities" class="text-2xl font-black text-amber-400">—</p>
    </div>
    <div class="dax-card p-4 rounded-xl h-24 flex flex-col justify-between">
        <p class="text-[10px] uppercase font-black text-slate-400 tracking-widest">
            Deals Ganados (mes)
        </p>
        <p id="kpi-won" class="text-2xl font-black text-emerald-400">—</p>
    </div>
</div>
```

> **Regla:** No usar SVGs decorativos en KPI cards. Solo `dax-card` flat.

---

## 5. Barra de Filtros Avanzados

```html
<div class="dax-card p-4 rounded-xl space-y-3">
    <div class="flex flex-wrap items-center gap-3">
        <!-- Search con ícono -->
        <div class="relative">
            <i class="fas fa-search absolute left-3 top-2.5 text-slate-500 text-xs"></i>
            <input type="text" id="search-input" placeholder="Buscar cuenta o deal..."
                class="pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg
                       text-white text-xs outline-none focus:border-primary-500 w-56 transition">
        </div>

        <div class="h-6 w-px bg-slate-700 hidden sm:block"></div>

        <!-- Filtro por Pipeline -->
        <div class="flex items-center gap-2">
            <label class="text-[10px] uppercase text-slate-500 font-bold tracking-widest whitespace-nowrap">
                Pipeline:
            </label>
            <select id="pipeline-select" onchange="Module.load(true)"
                class="bg-slate-900 border border-slate-700 rounded-lg text-white
                       text-xs py-2 px-3 outline-none focus:border-primary-500 transition">
                <option value="">Todos</option>
            </select>
        </div>

        <!-- Filtro por Responsable -->
        <div class="flex items-center gap-2">
            <label class="text-[10px] uppercase text-slate-500 font-bold tracking-widest whitespace-nowrap">
                Responsable:
            </label>
            <select id="owner-select" onchange="Module.load(true)"
                class="bg-slate-900 border border-slate-700 rounded-lg text-white
                       text-xs py-2 px-3 outline-none focus:border-primary-500 transition">
                <option value="">Todos</option>
            </select>
        </div>

        <!-- Acciones al extremo derecho -->
        <div class="ml-auto flex items-center gap-2">
            <button onclick="Module.resetFilters()" title="Limpiar filtros"
                class="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400
                       hover:text-white rounded-lg border border-slate-700 transition text-xs">
                <i class="fas fa-times"></i>
            </button>
            <button onclick="Module.load()" title="Actualizar"
                class="p-2 bg-slate-800 hover:bg-slate-700 text-emerald-400
                       rounded-lg border border-slate-700 transition">
                <i class="fas fa-sync-alt"></i>
            </button>
        </div>
    </div>
</div>
```

---

## 6. Paginación Server-Side

Patrón estándar para todas las vistas de listado (accounts, deals, activities, cotizaciones).  
Se activa solo cuando `total > limit`.

### HTML
```html
<div id="pagination-bar" class="dax-card p-3 rounded-xl hidden">
    <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-xs text-slate-400">
            Mostrando <span id="pg-from" class="text-white font-bold">—</span>–<span
            id="pg-to" class="text-white font-bold">—</span>
            de <span id="pg-total" class="text-white font-bold">—</span> registros
        </p>
        <div class="flex items-center gap-2">
            <button id="btn-prev" onclick="Module.prevPage()"
                class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs rounded-lg
                       border border-slate-700 transition disabled:opacity-40
                       disabled:cursor-not-allowed">
                <i class="fas fa-chevron-left"></i>
            </button>
            <span class="text-xs text-white font-bold px-1">
                Pág <span id="pg-current">1</span>
            </span>
            <span class="text-xs text-slate-500">/ <span id="pg-total-pages">—</span></span>
            <button id="btn-next" onclick="Module.nextPage()"
                class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs rounded-lg
                       border border-slate-700 transition disabled:opacity-40
                       disabled:cursor-not-allowed">
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>
        <div class="flex items-center gap-2">
            <label class="text-[10px] text-slate-500 uppercase font-bold">Por página:</label>
            <select id="pg-limit" onchange="Module.load(true)"
                class="bg-slate-900 border border-slate-700 rounded-lg text-white
                       text-xs py-1.5 px-2 outline-none focus:border-primary-500">
                <option value="25">25</option>
                <option value="50" selected>50</option>
                <option value="100">100</option>
            </select>
        </div>
    </div>
</div>
```

### JavaScript
```javascript
let currentPage = 0;
function pageSize() { return parseInt(document.getElementById('pg-limit')?.value || 50); }

function updatePagination(total, skip, limit) {
    const totalPages = Math.max(1, Math.ceil(total / limit));
    document.getElementById('pagination-bar').classList.toggle('hidden', total <= limit);
    document.getElementById('pg-from').textContent        = total ? skip + 1 : 0;
    document.getElementById('pg-to').textContent          = Math.min(skip + limit, total);
    document.getElementById('pg-total').textContent       = total;
    document.getElementById('pg-current').textContent     = currentPage + 1;
    document.getElementById('pg-total-pages').textContent = totalPages;
    document.getElementById('btn-prev').disabled = currentPage === 0;
    document.getElementById('btn-next').disabled = currentPage + 1 >= totalPages;
}

function prevPage() { if (currentPage > 0) { currentPage--; loadData(); } }
function nextPage() { currentPage++; loadData(); }

// Respuesta esperada del endpoint: { items, total, skip, limit, kpis? }
async function loadData(resetPage = false) {
    if (resetPage === true) currentPage = 0;
    const skip  = currentPage * pageSize();
    const limit = pageSize();
    const resp  = await fetch(`/api/crm/deals?skip=${skip}&limit=${limit}`).then(r => r.json());
    updatePagination(resp.total, resp.skip, resp.limit);
}
```

---

## 7. Modales

```html
<div id="deal-modal"
    class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]
           flex items-center justify-center p-4">
    <div class="bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg
                border border-primary-500/30 overflow-hidden">

        <!-- Header -->
        <div class="px-6 py-4 bg-slate-800/50 border-b border-slate-700
                    flex justify-between items-center">
            <div>
                <h3 class="text-lg font-black tracking-tight text-white uppercase">
                    Nuevo Deal
                </h3>
                <p class="text-xs text-primary-300 font-bold mt-1">Oportunidad comercial</p>
            </div>
            <button onclick="closeDealModal()"
                class="text-slate-400 hover:text-white transition p-2
                       hover:bg-slate-800 rounded-full">
                <i class="fas fa-times"></i>
            </button>
        </div>

        <!-- Body -->
        <div class="p-6 space-y-4">
            <div>
                <label class="block text-[10px] font-black uppercase text-slate-400
                              tracking-widest mb-1.5">Título del Deal</label>
                <input type="text" id="deal-title" placeholder="Ej. Línea de producción CNC"
                    class="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg
                           text-white text-xs outline-none focus:border-primary-500 transition
                           placeholder-slate-600">
            </div>
            <div>
                <label class="block text-[10px] font-black uppercase text-slate-400
                              tracking-widest mb-1.5">Valor Estimado (MXN)</label>
                <input type="number" id="deal-value" placeholder="0.00"
                    class="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg
                           text-white text-xs outline-none focus:border-primary-500 transition
                           placeholder-slate-600">
            </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-slate-800 bg-slate-800/30
                    flex justify-end gap-3">
            <button onclick="closeDealModal()"
                class="px-4 py-2 text-slate-400 hover:bg-slate-700/50
                       hover:text-white rounded-xl text-xs font-bold uppercase
                       tracking-wider transition">
                Cancelar
            </button>
            <button onclick="submitDeal()"
                class="px-6 py-2 bg-gradient-to-r from-primary-600 to-primary-500
                       hover:from-primary-500 hover:to-primary-400 text-white
                       rounded-xl text-xs font-black uppercase tracking-widest
                       shadow-lg shadow-primary-500/20 transition-all
                       hover:scale-105 active:scale-95">
                <i class="fas fa-check mr-2"></i> Crear Deal
            </button>
        </div>
    </div>
</div>
```

**Toggle helper:**
```javascript
function openDealModal() {
    const m = document.getElementById('deal-modal');
    m.classList.remove('hidden'); m.classList.add('flex');
}
function closeDealModal() {
    const m = document.getElementById('deal-modal');
    m.classList.add('hidden'); m.classList.remove('flex');
}
```

---

## 8. Kanban Board (Pipeline View)

Patrón para `/crm/pipeline` — columnas = stages, cards = deals.

```html
<!-- Contenedor del board -->
<div class="flex gap-4 overflow-x-auto pb-4">

    <!-- Columna de etapa -->
    <div class="shrink-0 w-72">
        <div class="dax-card p-3 rounded-xl mb-3 flex items-center justify-between">
            <div>
                <h4 class="text-xs font-black text-white uppercase tracking-wider">
                    Contacto Inicial
                </h4>
                <p class="text-[9px] text-slate-500 mt-0.5">3 deals · $120,000</p>
            </div>
            <span class="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-bold">
                3
            </span>
        </div>

        <!-- Deal card -->
        <div class="space-y-2" id="stage-col-1">
            <div class="dax-card p-3 rounded-xl cursor-pointer hover:border-primary-500/50
                        transition group deal-card" data-deal-id="1">
                <div class="flex items-start justify-between mb-2">
                    <span class="text-[10px] font-mono bg-slate-950 text-slate-500
                                 px-1.5 py-0.5 rounded border border-slate-800">DEAL-001</span>
                    <span class="text-[10px] bg-amber-500/10 text-amber-400
                                 border border-amber-500/20 px-1.5 py-0.5 rounded font-bold uppercase">
                        Alta
                    </span>
                </div>
                <h5 class="text-sm font-bold text-white group-hover:text-primary-400
                           transition line-clamp-2 mb-1">
                    Línea de producción CNC
                </h5>
                <p class="text-[10px] text-slate-400 mb-2">DASIC Monterrey</p>
                <div class="flex items-center justify-between">
                    <span class="text-xs font-bold text-emerald-400">$450,000</span>
                    <span class="text-[9px] text-slate-500">Cierre: 30 abr</span>
                </div>
            </div>
        </div>
    </div>

</div>
```

---

## 9. Activity Feed / Timeline

Patrón para account detail y deal detail.

```html
<div class="space-y-3" id="timeline-feed">
    <!-- Evento de timeline -->
    <div class="flex gap-3">
        <!-- Ícono del tipo -->
        <div class="shrink-0 w-8 h-8 bg-violet-500/10 border border-violet-500/20
                    rounded-full flex items-center justify-center mt-0.5">
            <i class="fab fa-whatsapp text-violet-400 text-xs"></i>
        </div>
        <!-- Contenido -->
        <div class="dax-card p-3 rounded-xl flex-1">
            <div class="flex items-start justify-between mb-1">
                <span class="text-xs font-bold text-white">WhatsApp registrado</span>
                <span class="text-[9px] text-slate-500">hace 2h</span>
            </div>
            <p class="text-xs text-slate-400">
                "Confirmaron reunión para el miércoles. Interesados en propuesta full."
            </p>
            <p class="text-[9px] text-slate-500 mt-1">por Juan Pérez</p>
        </div>
    </div>
</div>
```

**Iconos por tipo de actividad:**
```javascript
const ACTIVITY_ICONS = {
    WHATSAPP: { icon: 'fab fa-whatsapp', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
    CALL:     { icon: 'fas fa-phone-alt', color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
    VISIT:    { icon: 'fas fa-map-marker-alt', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    TASK:     { icon: 'fas fa-check-circle', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    NOTE:     { icon: 'fas fa-sticky-note', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20' },
};
```

---

## 10. Labels de Sección / Fieldset

```html
<label class="block text-[10px] font-black uppercase text-slate-400
              tracking-widest mb-1.5">
    Nombre del campo
</label>
```

---

## 11. Convenciones JS de Módulos (IIFE + Public API)

Cada vista encapsula su lógica. Nombre del módulo = nombre del contexto CRM.

```javascript
(function () {
    'use strict';

    // Estado local
    let currentPage = 0;
    let dataList    = [];

    // Funciones privadas
    async function loadData(resetPage = false) {
        if (resetPage) currentPage = 0;
        const skip  = currentPage * pageSize();
        const limit = pageSize();
        const params = new URLSearchParams({
            skip, limit,
            q:        document.getElementById('search-input')?.value || '',
            pipeline: document.getElementById('pipeline-select')?.value || '',
            owner:    document.getElementById('owner-select')?.value || '',
        });
        const resp = await fetch(`/api/crm/deals?${params}`).then(r => r.json());
        renderTable(resp.items);
        updateKpis(resp.kpis);
        updatePagination(resp.total, resp.skip, resp.limit);
    }

    function renderTable(items) { /* ... */ }
    function updateKpis(kpis) { /* ... */ }
    function updatePagination(total, skip, limit) { /* patrón §6 */ }

    async function init() {
        await Promise.all([loadPipelines(), loadOwners()]);
        loadData();

        // Debounce en search
        let searchTimeout = null;
        document.getElementById('search-input').addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => loadData(true), 400);
        });
    }

    // Public API (expuesta al HTML para onclick="")
    window.DealsModule = {
        load:         loadData,
        prevPage:     () => { if (currentPage > 0) { currentPage--; loadData(); } },
        nextPage:     () => { currentPage++; loadData(); },
        resetFilters: () => { /* limpiar selects + search */ loadData(true); },
        openNew:      openDealModal,
    };

    document.addEventListener('DOMContentLoaded', init);
})();
```

---

## 12. Tipografía y Tamaños

| Rol                        | Clases                                                       |
|----------------------------|--------------------------------------------------------------|
| Título de página           | `text-xl font-bold text-white tracking-tight uppercase`      |
| Subtítulo de página        | `text-[10px] text-slate-400 uppercase tracking-widest font-semibold` |
| Título de sección / modal  | `text-lg font-black tracking-tight text-white uppercase`     |
| Label de campo             | `text-[10px] font-black uppercase text-slate-400 tracking-widest` |
| Valor KPI                  | `text-2xl font-black`                                        |
| Texto tabla                | `text-xs text-slate-300`                                     |
| Código / Folio / ID        | `font-mono text-[11px]`                                      |
| Nota al pie / ayuda        | `text-[9px] text-slate-500`                                  |
| Nombre de cuenta (tabla)   | `font-bold text-white group-hover:text-primary-400 transition` |

---

## 13. Backend — Endpoint Paginado con KPIs

Patrón obligatorio para toda vista de listado CRM con filtros avanzados.

```python
from pydantic import BaseModel
from typing import List, Optional

class DealsKPIs(BaseModel):
    total_deals: int
    valor_pipeline: float
    deals_won_mes: int
    deals_lost_mes: int

class DealsPage(BaseModel):
    items: List[DealRead]
    total: int
    skip: int
    limit: int
    kpis: DealsKPIs
```

**Reglas de endpoint:**
- **No modificar** endpoints existentes usados por el cotizador u otros consumidores.
- Crear endpoint nuevo con prefijo descriptivo (ej. `/api/crm/deals`, `/api/crm/accounts`).
- Declarar endpoints específicos **ANTES** de `/{id}` en el router.
- Los KPIs se calculan sobre el **universo filtrado antes del offset/limit**.
- Respuesta siempre incluye `skip` y `limit` para que el frontend pueda calcular paginación.

---

## 14. Patrón de Módulo DASIC (Branch/Sucursal)

Aplica a todos los módulos del rol CAJERO/VENDEDOR en contexto sucursal.

### Content wrapper
Todo `{% block content %}` abre con:
```html
<div class="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto animate-fade-in">
```

### Headers de página
```html
<div class="flex items-start justify-between">
    <div>
        <h1 class="text-xl font-bold text-white tracking-tight uppercase">
            Pipeline CRM
        </h1>
        <p class="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mt-0.5">
            DASIC Industrial · Oportunidades activas
        </p>
    </div>
    <button onclick="DealsModule.openNew()"
        class="px-4 py-2 bg-gradient-to-r from-primary-600 to-primary-500
               hover:from-primary-500 hover:to-primary-400 text-white rounded-xl
               text-xs font-black uppercase tracking-widest shadow-lg
               shadow-primary-500/20 transition-all hover:scale-105 active:scale-95">
        <i class="fas fa-plus mr-2"></i> Nuevo Deal
    </button>
</div>
```

### Tab pills (vistas kanban / lista / actividades)
```html
<div class="bg-slate-900/60 border border-white/5 rounded-xl p-1 w-fit flex gap-1">
    <button class="px-4 py-2 text-xs font-bold rounded-lg bg-slate-700 text-white transition">
        Kanban
    </button>
    <button class="px-4 py-2 text-xs font-bold rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition">
        Lista
    </button>
    <button class="px-4 py-2 text-xs font-bold rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition">
        Actividades
    </button>
</div>
```

### Table container
```html
<div class="dax-card rounded-xl overflow-hidden">
    <div class="overflow-x-auto">
        <table class="w-full text-left">
            <thead class="bg-slate-900/50">
                <tr>
                    <th class="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cuenta</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/50 text-sm text-slate-300 bg-slate-900/30">
            </tbody>
        </table>
    </div>
</div>
```

---

## Reglas Globales (checklist antes de hacer PR)

- [ ] **No `dark:` prefixes** — DASIC es siempre dark.
- [ ] **No inline styles** — solo clases Tailwind.
- [ ] **No SPA routing** — Alpine.js solo para interactividad local (modals, kanban drag, dropdowns).
- [ ] **Multi-tenant**: toda query de API lleva `organization_id` (viene del JWT, no del body).
- [ ] **RBAC**: endpoints con `require_roles([...])`, no solo en UI.
- [ ] **Header h1:** `class="text-xl font-bold text-white tracking-tight uppercase"`
- [ ] **Header subtitle:** `class="text-[10px] text-slate-400 uppercase tracking-widest font-semibold"`
- [ ] **No SVGs decorativos** en KPI cards — solo `dax-card` flat.
- [ ] **Paginación server-side** en toda vista de listado con más de 25 registros.
- [ ] **KPIs del universo filtrado**, no del total global.
- [ ] **Endpoints nuevos declarados ANTES de `/{id}`** en el router FastAPI.
