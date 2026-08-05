> [!warning] DOCUMENTO HISTÓRICO — NO APLICA
> Este archivo es un **boceto de planeación de abril-2026** que propuso un stack **Next.js 14 + Prisma + NextAuth**. Ese stack **nunca se implementó**: el proyecto siempre fue FastAPI + SQLAlchemy y hoy es SPA React + FastAPI. Ningún modelo Prisma, ruta `/app/...` ni comando `npx prisma` de aquí existe en el repo.
> **Se conserva solo como registro del plan original.** Para el estado real ir a `CLAUDE.md` (raíz del repo), `docs/Atlas-ONE-Proyecto.md` y `context/02_REPO_CURRENT_STATE.md`.

---

# CLAUDE.md — DASIC Industrial ERP
## Ultra Plan · CRM para Consultora Industrial
**Desarrollado por:** Atlas_Tech  
**Stack:** Next.js 14 · PostgreSQL · Railway · TailwindCSS  
**Usuarios objetivo:** 1–5 · Roles: Administrador, Comercial, Operaciones

---

## CONTEXTO DEL PROYECTO

DASIC es una plataforma ERP/CRM para una consultora industrial que vende productos y servicios.
Reemplaza un flujo manual de Excel (CRM) + Word (cotizaciones) que no escala.

**Dolor principal a resolver:**
- Seguimiento de clientes/leads sin trazabilidad
- Cotizaciones generadas a mano en Word sin control de versiones
- Órdenes de compra sin visibilidad de estado
- Stock gestionado en hojas de cálculo desconectadas

**Flujo maestro del negocio:**
```
LEAD → CLIENTE → COTIZACIÓN → ORDEN DE VENTA → OC PROVEEDOR → STOCK → ENTREGA
```

---

## STACK TECNOLÓGICO

```
Frontend:     Next.js 14 (App Router) + TailwindCSS
Backend:      Next.js API Routes (REST)
Base datos:   PostgreSQL (Railway)
ORM:          Prisma
Auth:         NextAuth.js (credentials provider)
PDF:          React-PDF / @react-pdf/renderer
Email:        Resend (para envío de cotizaciones)
Deploy:       Railway
Repo:         Git (convencional commits)
```

---

## ARQUITECTURA DE MÓDULOS

### MÓDULO 1 — CRM (Clientes + Leads)
```
/app/crm/
├── leads/          → pipeline de prospectos
├── clientes/       → base de clientes activos
└── actividades/    → historial de seguimiento
```

**Modelos Prisma:**
```prisma
model Lead {
  id              String   @id @default(cuid())
  nombre          String
  empresa         String?
  telefono        String?
  email           String?
  origen          String   // referido|web|visita|llamada
  estado          String   // nuevo|contactado|propuesta|ganado|perdido
  responsableId   String
  fechaSeguimiento DateTime?
  notas           String?
  actividades     Actividad[]
  creadoEn        DateTime @default(now())
  actualizadoEn   DateTime @updatedAt
}

model Cliente {
  id            String   @id @default(cuid())
  razonSocial   String
  rfc           String?  @unique
  email         String?
  telefono      String?
  direccion     String?
  contactos     Contacto[]
  cotizaciones  Cotizacion[]
  actividades   Actividad[]
  creadoEn      DateTime @default(now())
}

model Contacto {
  id         String  @id @default(cuid())
  nombre     String
  puesto     String?
  email      String?
  telefono   String?
  clienteId  String
  cliente    Cliente @relation(fields: [clienteId], references: [id])
}

model Actividad {
  id          String   @id @default(cuid())
  tipo        String   // llamada|email|visita|reunion
  descripcion String
  resultado   String?
  proximaAccion String?
  fecha       DateTime
  leadId      String?
  clienteId   String?
  usuarioId   String
  creadoEn    DateTime @default(now())
}
```

---

### MÓDULO 2 — Cotizador
```
/app/cotizaciones/
├── nueva/          → crear cotización
├── [id]/           → detalle y edición
└── pdf/[id]/       → generación de PDF
```

**Modelos Prisma:**
```prisma
model Cotizacion {
  id              String   @id @default(cuid())
  folio           String   @unique // COT-2025-001
  clienteId       String
  cliente         Cliente  @relation(fields: [clienteId], references: [id])
  estado          String   // borrador|enviada|aceptada|rechazada|facturada
  tipo            String   // productos|servicios|mixta
  fechaEmision    DateTime @default(now())
  fechaVencimiento DateTime
  condicionesPago String?
  notas           String?
  subtotal        Decimal
  iva             Decimal
  total           Decimal
  lineas          LineaCotizacion[]
  ordenVenta      OrdenVenta?
  responsableId   String
  creadoEn        DateTime @default(now())
  actualizadoEn   DateTime @updatedAt
}

model LineaCotizacion {
  id              String     @id @default(cuid())
  cotizacionId    String
  cotizacion      Cotizacion @relation(fields: [cotizacionId], references: [id])
  descripcion     String
  cantidad        Decimal
  unidad          String
  precioUnitario  Decimal
  descuento       Decimal    @default(0)
  subtotal        Decimal
  productoId      String?    // opcional, si viene del catálogo
}
```

---

### MÓDULO 3 — Órdenes de Compra y Venta
```
/app/ordenes/
├── ventas/         → órdenes de venta (cliente)
└── compras/        → órdenes de compra (proveedor)
```

**Modelos Prisma:**
```prisma
model OrdenVenta {
  id               String     @id @default(cuid())
  folio            String     @unique // OV-2025-001
  cotizacionId     String     @unique
  cotizacion       Cotizacion @relation(fields: [cotizacionId], references: [id])
  estado           String     // confirmada|en_proceso|entregada|facturada
  fechaCompromiso  DateTime?
  notas            String?
  ordenesCompra    OrdenCompra[]
  creadoEn         DateTime   @default(now())
  actualizadoEn    DateTime   @updatedAt
}

model OrdenCompra {
  id               String      @id @default(cuid())
  folio            String      @unique // OC-2025-001
  proveedorId      String
  proveedor        Proveedor   @relation(fields: [proveedorId], references: [id])
  ordenVentaId     String?
  ordenVenta       OrdenVenta? @relation(fields: [ordenVentaId], references: [id])
  estado           String      // borrador|enviada|confirmada|recibida
  fechaEstimada    DateTime?
  lineas           LineaOrdenCompra[]
  total            Decimal
  creadoEn         DateTime    @default(now())
  actualizadoEn    DateTime    @updatedAt
}

model Proveedor {
  id                String        @id @default(cuid())
  nombre            String
  rfc               String?
  contacto          String?
  email             String?
  telefono          String?
  tiempoEntregaDias Int?
  ordenesCompra     OrdenCompra[]
  creadoEn          DateTime      @default(now())
}
```

---

### MÓDULO 4 — Inventario / Stock
```
/app/inventario/
├── productos/      → catálogo y stock actual
├── movimientos/    → entradas y salidas
└── alertas/        → productos bajo mínimo
```

**Modelos Prisma:**
```prisma
model Producto {
  id               String    @id @default(cuid())
  sku              String    @unique
  nombre           String
  descripcion      String?
  categoria        String?
  unidad           String    // pza|kg|lt|m|etc
  stockActual      Decimal   @default(0)
  stockMinimo      Decimal   @default(0)
  stockMaximo      Decimal?
  costoPromedio    Decimal   @default(0)
  precioVenta      Decimal   @default(0)
  proveedorPrefId  String?
  movimientos      MovimientoStock[]
  creadoEn         DateTime  @default(now())
  actualizadoEn    DateTime  @updatedAt
}

model MovimientoStock {
  id           String   @id @default(cuid())
  productoId   String
  producto     Producto @relation(fields: [productoId], references: [id])
  tipo         String   // entrada|salida|ajuste
  cantidad     Decimal
  saldo        Decimal
  referencia   String?  // OC-xxx | OV-xxx | AJUSTE-xxx
  notas        String?
  usuarioId    String
  creadoEn     DateTime @default(now())
}
```

---

### MÓDULO 5 — Administración
```
/app/admin/
├── gastos/         → registro de egresos
├── reportes/       → dashboards y exports
└── equipo/         → usuarios y roles
```

**Modelos Prisma:**
```prisma
model Gasto {
  id           String   @id @default(cuid())
  categoria    String   // operativo|logistica|servicios|nomina
  descripcion  String
  monto        Decimal
  fecha        DateTime
  comprobante  String?  // URL del archivo
  clienteId    String?
  responsableId String
  creadoEn     DateTime @default(now())
}

model Usuario {
  id        String   @id @default(cuid())
  nombre    String
  email     String   @unique
  password  String   // hashed
  rol       String   // administrador|comercial|operaciones
  activo    Boolean  @default(true)
  creadoEn  DateTime @default(now())
}
```

---

## ROLES Y PERMISOS

```
Administrador   → acceso total: todos los módulos + configuración + reportes
Comercial       → CRM (leads, clientes, actividades) + Cotizador + ver OVs
Operaciones     → OCs + Inventario + ver cotizaciones aceptadas
```

**Middleware de permisos:** Validar rol en cada API route y en layout del frontend.

---

## ESTRUCTURA DE CARPETAS DEL PROYECTO

```
dasic/
├── app/
│   ├── (auth)/
│   │   └── login/
│   ├── (dashboard)/
│   │   ├── layout.tsx          ← sidebar + header
│   │   ├── page.tsx            ← dashboard principal
│   │   ├── crm/
│   │   │   ├── leads/
│   │   │   ├── clientes/
│   │   │   └── actividades/
│   │   ├── cotizaciones/
│   │   ├── ordenes/
│   │   │   ├── ventas/
│   │   │   └── compras/
│   │   ├── inventario/
│   │   └── admin/
│   └── api/
│       ├── auth/
│       ├── leads/
│       ├── clientes/
│       ├── cotizaciones/
│       ├── ordenes/
│       ├── inventario/
│       └── admin/
├── components/
│   ├── layout/
│   │   ├── SidebarRail.tsx
│   │   ├── SidebarPanel.tsx
│   │   └── Header.tsx
│   ├── ui/                     ← componentes reutilizables
│   └── modules/                ← componentes por módulo
├── lib/
│   ├── prisma.ts
│   ├── auth.ts
│   └── pdf.ts
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── public/
└── CLAUDE.md                   ← este archivo
```

---

## PLAN DE DESARROLLO POR FASES

### FASE 1 — Foundation (Semanas 1–2)
```
[ ] SETUP-001: Inicializar proyecto Next.js 14 con App Router
    npx create-next-app@latest dasic --typescript --tailwind --app

[ ] SETUP-002: Configurar PostgreSQL en Railway
    - Crear proyecto en Railway
    - Agregar plugin PostgreSQL
    - Copiar DATABASE_URL a .env

[ ] SETUP-003: Configurar Prisma
    npm install prisma @prisma/client
    npx prisma init
    - Pegar todos los modelos del schema
    npx prisma migrate dev --name init

[ ] SETUP-004: Configurar NextAuth.js
    npm install next-auth bcryptjs
    - Credentials provider con email + password
    - Proteger rutas con middleware

[ ] SETUP-005: Crear layout con Sidebar doble columna
    - SidebarRail (iconos)
    - SidebarPanel (expandido con labels)
    - Header con usuario activo

[ ] SETUP-006: Seed de datos iniciales
    - 1 usuario Administrador
    - Datos de empresa (nombre, RFC, logo)
    npx prisma db seed
```

### FASE 2 — CRM (Semanas 2–3)
```
[ ] CRM-001: CRUD de Leads
    - Listado con pipeline Kanban por estado
    - Formulario crear/editar lead
    - Cambiar estado con drag & drop o select
    - API: GET/POST/PUT/DELETE /api/leads

[ ] CRM-002: CRUD de Clientes
    - Listado con búsqueda y filtros
    - Perfil de cliente con contactos múltiples
    - Historial de cotizaciones y actividades
    - API: GET/POST/PUT/DELETE /api/clientes

[ ] CRM-003: Registro de Actividades
    - Crear actividad vinculada a lead o cliente
    - Timeline de actividades por cliente
    - Recordatorios de próxima acción
```

### FASE 3 — Cotizador (Semanas 3–4)
```
[ ] COT-001: Constructor de cotización
    - Seleccionar cliente
    - Agregar líneas (producto del catálogo o descripción libre)
    - Cálculo automático: subtotal, IVA, total
    - Folio automático: COT-YYYY-NNN

[ ] COT-002: Generación de PDF
    - Plantilla con logo, datos fiscales, tabla de líneas
    - Descargar PDF desde el sistema
    - npm install @react-pdf/renderer

[ ] COT-003: Gestión de estados
    - Enviar → Aceptada → Rechazada → Facturada
    - Al aceptar: generar Orden de Venta automáticamente
```

### FASE 4 — Órdenes (Semanas 4–5)
```
[ ] OC-001: Órdenes de Venta
    - Generadas automáticamente desde cotización aceptada
    - Seguimiento de estado hasta entrega
    - Folio: OV-YYYY-NNN

[ ] OC-002: Órdenes de Compra a Proveedor
    - CRUD de proveedores
    - Crear OC vinculada a OV
    - Al marcar "recibida": actualiza stock automáticamente
    - Folio: OC-YYYY-NNN
```

### FASE 5 — Inventario (Semana 5–6)
```
[ ] INV-001: Catálogo de productos
    - CRUD de productos con SKU
    - Stock actual visible en listado
    - Precio costo y precio venta

[ ] INV-002: Movimientos de stock
    - Entradas manuales y automáticas (desde OC)
    - Salidas manuales y automáticas (desde OV)
    - Historial de movimientos por producto

[ ] INV-003: Alertas de stock
    - Badge en sidebar cuando hay productos bajo mínimo
    - Página de alertas con acción directa a crear OC
```

### FASE 6 — Admin + Reportes (Semana 6–7)
```
[ ] ADM-001: Dashboard ejecutivo
    - KPIs: cotizaciones del mes, OVs activas, stock crítico, gastos
    - Gráfica: pipeline comercial por etapa
    - Gráfica: cotizaciones por estado (valor $)

[ ] ADM-002: Módulo de Gastos
    - Registro de egresos con categoría
    - Resumen mensual de gastos

[ ] ADM-003: Gestión de Usuarios
    - CRUD de usuarios
    - Asignación de roles
    - Activar/desactivar acceso
```

---

## CONVENCIONES DE CÓDIGO

```
Commits:        feat: | fix: | chore: | refactor: | docs:
Branches:       main → staging → feature/nombre-tarea
API responses:  { data, error, message }
Fechas:         ISO 8601 (UTC)
Moneda:         Decimal(10,2), mostrar en MXN
Folios:         Generados en backend, nunca en frontend
Passwords:      bcryptjs, saltRounds: 12
```

---

## VARIABLES DE ENTORNO (.env)

```env
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="genera-con: openssl rand -base64 32"
NEXTAUTH_URL="http://localhost:3000"
RESEND_API_KEY="re_..."
NEXT_PUBLIC_APP_NAME="DASIC"
NEXT_PUBLIC_APP_VERSION="1.0.0"
```

---

## COMANDOS FRECUENTES

```bash
# Desarrollo
npm run dev

# Migraciones
npx prisma migrate dev --name descripcion
npx prisma db push          # solo para desarrollo rápido
npx prisma studio           # GUI de la base de datos

# Seed
npx prisma db seed

# Build
npm run build
npm run start

# Deploy a Railway
railway up
```

---

## CHECKLIST DE INICIO DE SESIÓN (para el agente)

Antes de empezar a trabajar en cualquier tarea, ejecutar:

```bash
# 1. Verificar que el proyecto corre
npm run dev

# 2. Verificar conexión a base de datos
npx prisma db pull

# 3. Verificar migraciones pendientes
npx prisma migrate status

# 4. Reportar estado
echo "DASIC ENV: OK — $(date)"
```

---

## DISEÑO UI — TOKENS DASIC

```css
/* Sidebar */
--sidebar-bg:          #0d1b3e;
--sidebar-rail-width:  56px;
--sidebar-panel-width: 240px;
--sidebar-text:        #ffffff;
--sidebar-active-bg:   rgba(255,255,255,0.10);
--sidebar-hover-bg:    rgba(255,255,255,0.06);
--sidebar-accent:      #2563eb;

/* Global (Atlas_Tech base) */
--at-black:   #141416;
--at-dark:    #1E1E22;
--at-white:   #E8E8EA;
--at-teal:    #00C9B1;
--at-cyan:    #00E5FF;
--at-purple:  #7B2FBE;
--at-magenta: #C026D3;
--at-gray:    #6B6B78;
--at-border:  #2A2A32;
```

---

## NOTAS IMPORTANTES PARA EL AGENTE

```
1. NUNCA generar folios (COT, OV, OC) en el frontend — siempre en API route
2. SIEMPRE validar rol del usuario en cada API route antes de ejecutar
3. Los totales (subtotal, IVA, total) se recalculan en el backend al guardar
4. El stock se actualiza SOLO mediante movimientos — nunca editar stockActual directo
5. Al convertir Lead a Cliente: copiar datos, NO eliminar el lead
6. Al aceptar una Cotización: crear OrdenVenta automáticamente en la misma transacción
7. Al marcar OC como "recibida": crear MovimientoStock tipo "entrada" automáticamente
8. Trabajar únicamente desde terminal — confirmar cada tarea con:
   echo "TASK-XXX: DONE — $(date)"
9. Si una tarea bloquea, crear archivo: BLOCKER-XXX.md con el error exacto
10. Documentar cambios importantes en /docs/CHANGELOG.md
```

---

*CLAUDE.md generado por Atlas_Tech · DASIC Industrial ERP v1.0*
