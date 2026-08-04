import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { NotFound } from '@/components/NotFound';
import { LoginPage } from '@/features/auth/pages/LoginPage';

// Code-split: cada página se carga on-demand al navegar a ella.
// React Router v6.4 acepta `lazy: async () => ({ Component })` por route.
// LoginPage queda eager porque es la ruta crítica del primer paint.
//
// Esto baja el bundle inicial de ~520kB a ~150kB (vendor + shell + dashboard).
// Las otras pages bajan en chunks separados según el usuario navega.

// Tras un deploy, el index.html (no-cache) trae hashes de chunk nuevos, pero una
// SPA ya abierta sigue en memoria con el entry viejo y, al navegar, intenta importar
// un chunk cuyo hash ya no existe → "Failed to fetch dynamically imported module".
// Si el import dinámico falla, recargamos UNA vez (trae index.html + chunks nuevos).
// La guarda en sessionStorage evita un loop si el fallo es real (no por deploy).
const CHUNK_RELOAD_FLAG = 'spa-chunk-reload';
const lazyPage = <K extends string>(loader: () => Promise<Record<K, React.ComponentType>>, key: K) =>
  async () => {
    try {
      const mod = await loader();
      sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
      return { Component: mod[key] };
    } catch (err) {
      if (!sessionStorage.getItem(CHUNK_RELOAD_FLAG)) {
        sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1');
        window.location.reload();
        return { Component: () => null };
      }
      throw err;
    }
  };

const dashboard = lazyPage(() => import('@/features/dashboard/pages/DashboardPage'), 'DashboardPage');
const cotizador = lazyPage(() => import('@/features/cotizador/pages/CotizadorPage'), 'CotizadorPage');
const borradores = lazyPage(() => import('@/features/borradores/pages/BorradoresPage'), 'BorradoresPage');
const seguimiento = lazyPage(() => import('@/features/seguimiento/pages/SeguimientoPage'), 'SeguimientoPage');
const fantasmas = lazyPage(() => import('@/features/fantasmas/pages/FantasmasPage'), 'FantasmasPage');
const clientes = lazyPage(() => import('@/features/clientes/pages/ClientesPage'), 'ClientesPage');
const unificarEmpresas = lazyPage(() => import('@/features/clientes/pages/UnificarEmpresasPage'), 'UnificarEmpresasPage');
const empresaDetalle = lazyPage(() => import('@/features/clientes/pages/EmpresaDetallePage'), 'EmpresaDetallePage');
const contactos = lazyPage(() => import('@/features/contactos/pages/ContactosPage'), 'ContactosPage');
const inventario = lazyPage(() => import('@/features/inventario/pages/InventarioPage'), 'InventarioPage');
const catalogos = lazyPage(() => import('@/features/catalogos/pages/CatalogosPage'), 'CatalogosPage');
const compras = lazyPage(() => import('@/features/compras/pages/ComprasPage'), 'ComprasPage');
const remisiones = lazyPage(() => import('@/features/remisiones/pages/RemisionesPage'), 'RemisionesPage');
const crearRemision = lazyPage(() => import('@/features/remisiones/pages/CrearRemisionPage'), 'CrearRemisionPage');
const gastos = lazyPage(() => import('@/features/gastos/pages/GastosPage'), 'GastosPage');
const reportesServicioDocs = lazyPage(
  () => import('@/features/reportes_servicio_docs/pages/ReportesServicioDocsPage'),
  'ReportesServicioDocsPage',
);
const cxc = lazyPage(() => import('@/features/cxc/pages/CuentasPorCobrarPage'), 'CuentasPorCobrarPage');
const fx = lazyPage(() => import('@/features/fx/pages/FxPage'), 'FxPage');
const precios = lazyPage(() => import('@/features/precios/pages/PreciosPage'), 'PreciosPage');
const usuarios = lazyPage(() => import('@/features/usuarios/pages/UsuariosPage'), 'UsuariosPage');
const servicios = lazyPage(() => import('@/features/servicios/pages/ServiciosPage'), 'ServiciosPage');
const superadmin = lazyPage(() => import('@/features/superadmin/pages/SuperAdminPage'), 'SuperAdminPage');
const superadminConfig = lazyPage(() => import('@/features/superadmin/pages/ConfigPlataformaPage'), 'ConfigPlataformaPage');
const superadminAudit = lazyPage(() => import('@/features/superadmin/pages/AuditPage'), 'AuditPage');
const superadminSalud = lazyPage(() => import('@/features/superadmin/pages/SaludPage'), 'SaludPage');
const superadminMantenimiento = lazyPage(() => import('@/features/superadmin/pages/MantenimientoPage'), 'MantenimientoPage');
const superadminUsuarios = lazyPage(() => import('@/features/superadmin/pages/UsuariosPlataformaPage'), 'UsuariosPlataformaPage');
const crm = lazyPage(() => import('@/features/crm/pages/CrmKanbanPage'), 'CrmKanbanPage');
const crmDealDetalle = lazyPage(() => import('@/features/crm/pages/DealDetallePage'), 'DealDetallePage');
const recordatorios = lazyPage(() => import('@/features/recordatorios/pages/RecordatoriosPage'), 'RecordatoriosPage');
const analitica = lazyPage(() => import('@/features/analitica/pages/KpisPage'), 'KpisPage');

// Helper: ruta legacy → redirect a su equivalente /spa/* (normaliza URL,
// breadcrumbs y bookmarks; antes montaba la página duplicada sin breadcrumb).
const legacyRedirect = (path: string, to: string) => ({
  path,
  element: <Navigate to={to} replace />,
});

export const router = createBrowserRouter([
  // Login (público) — fuera del Layout (sin sidebar/header).
  // Sirve también la URL `/` (matching el flujo previo de Jinja).
  { path: '/', element: <LoginPage /> },
  { path: '/login', element: <LoginPage /> },
  {
    path: '/spa',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/spa/dashboard" replace /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'dashboard', lazy: dashboard },
      { path: 'cotizador', lazy: cotizador },
      { path: 'borradores', lazy: borradores },
      { path: 'seguimiento', lazy: seguimiento },
      { path: 'fantasmas', lazy: fantasmas },
      { path: 'clientes', lazy: clientes },
      { path: 'empresas/:id', lazy: empresaDetalle },
      { path: 'empresas-unificar', lazy: unificarEmpresas },
      { path: 'contactos', lazy: contactos },
      { path: 'inventario', lazy: inventario },
      { path: 'catalogos', lazy: catalogos },
      { path: 'compras', lazy: compras },
      { path: 'remisiones', lazy: remisiones },
      { path: 'remisiones-nueva', lazy: crearRemision },
      { path: 'remisiones/:id/editar', lazy: crearRemision },
      { path: 'gastos', lazy: gastos },
      { path: 'analitica', lazy: analitica },
      { path: 'reportes', element: <Navigate to="/spa/analitica?tab=ventas" replace /> },
      { path: 'reportes-servicio', element: <Navigate to="/spa/analitica?tab=operativo" replace /> },
      { path: 'reportes-servicio-docs', lazy: reportesServicioDocs },
      { path: 'cuentas-por-cobrar', lazy: cxc },
      { path: 'fx', lazy: fx },
      { path: 'precios', lazy: precios },
      { path: 'usuarios', lazy: usuarios },
      { path: 'servicios', lazy: servicios },
      { path: 'superadmin', lazy: superadmin },
      { path: 'superadmin/config', lazy: superadminConfig },
      { path: 'superadmin/audit', lazy: superadminAudit },
      { path: 'superadmin/salud', lazy: superadminSalud },
      { path: 'superadmin/mantenimiento', lazy: superadminMantenimiento },
      { path: 'superadmin/usuarios', lazy: superadminUsuarios },
      { path: 'crm', lazy: crm },
      { path: 'crm/deals/:id', lazy: crmDealDetalle },
      { path: 'recordatorios', lazy: recordatorios },
      { path: '*', element: <NotFound /> },
    ],
  },
  // Rutas legacy — FastAPI sirve el mismo dist/index.html para estas URLs;
  // el router las redirige a su equivalente canónico /spa/*.
  legacyRedirect('/ventas/cotizador', '/spa/cotizador'),
  legacyRedirect('/dashboard', '/spa/dashboard'),
  legacyRedirect('/borradores', '/spa/borradores'),
  legacyRedirect('/seguimiento', '/spa/seguimiento'),
  legacyRedirect('/fantasmas', '/spa/fantasmas'),
  legacyRedirect('/clientes', '/spa/clientes'),
  legacyRedirect('/inventario', '/spa/inventario'),
  legacyRedirect('/catalogos', '/spa/catalogos'),
  legacyRedirect('/compras', '/spa/compras'),
  legacyRedirect('/remisiones', '/spa/remisiones'),
  legacyRedirect('/gastos', '/spa/gastos'),
  legacyRedirect('/reportes', '/spa/analitica?tab=ventas'),
  legacyRedirect('/reportes-servicio', '/spa/analitica?tab=operativo'),
  legacyRedirect('/reportes-servicio-docs', '/spa/reportes-servicio-docs'),
  legacyRedirect('/cuentas-por-cobrar', '/spa/cuentas-por-cobrar'),
  legacyRedirect('/fx', '/spa/fx'),
  legacyRedirect('/precios', '/spa/precios'),
  legacyRedirect('/usuarios', '/spa/usuarios'),
  legacyRedirect('/servicios', '/spa/servicios'),
  // Catch-all: cualquier URL desconocida cae en el 404 dentro del shell.
  { path: '*', element: <Layout />, children: [{ path: '*', element: <NotFound /> }] },
]);
