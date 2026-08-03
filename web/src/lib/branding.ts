// Branding por tenant: toda cadena de marca visible en el chrome/login sale de aquí.
// Regla (Atlas Industrial Services): la identidad del cliente es configuración,
// no texto disperso en componentes. Nuevo tenant = nuevo preset, nunca un fork.
export type TenantBranding = {
  /** Nombre de la organización cliente — encabezado del sidebar y title. */
  organizationName: string;
  /** Descriptor corto bajo el nombre de la organización. */
  tagline: string;
  /** Nombre del producto (plataforma). */
  productName: string;
  productVersion: string;
  /** Crédito del pie de página. */
  poweredBy: string;
  /** Logo principal (ruta servida por el backend). null = sin logo. */
  logoUrl: string | null;
  /** Placeholder para campos de email en formularios de usuarios. */
  emailPlaceholder: string;
  /** Mensaje principal del panel de marca en el login. */
  loginHeadline: string;
  /** Bullets de valor en el panel de marca del login. */
  loginBullets: string[];
};

const TENANTS: Record<string, TenantBranding> = {
  dasic: {
    organizationName: 'DASIC',
    tagline: 'Sistema Industrial',
    productName: 'Atlas ONE',
    productVersion: 'v2.0',
    poweredBy: 'Atlas Tech',
    logoUrl: '/static/img/Logo_main.png',
    emailPlaceholder: 'usuario@dasic.com',
    loginHeadline: 'La plataforma para cotizar, surtir y entregar — todo en un solo lugar.',
    loginBullets: [
      'Cotizaciones en minutos',
      'Inventario y reservas en vivo',
      'OC, remisiones y reportes',
    ],
  },
  // Identidad neutra del producto SaaS — demo sin marca de cliente.
  atlas: {
    organizationName: 'Atlas',
    tagline: 'Industrial Services',
    productName: 'Atlas Industrial Services',
    productVersion: 'v2.0',
    poweredBy: 'Atlas Tech',
    logoUrl: null,
    emailPlaceholder: 'usuario@empresa.com',
    loginHeadline: 'La plataforma para empresas que venden, ejecutan y mantienen soluciones industriales.',
    loginBullets: [
      'CRM y cotizaciones industriales',
      'Inventario y compras conectados',
      'Cobranza y reportería en vivo',
    ],
  },
};

const tenantKey = (import.meta.env.VITE_TENANT ?? 'dasic').toLowerCase();

export const branding: TenantBranding = TENANTS[tenantKey] ?? TENANTS.dasic;

/** Título del documento: "Atlas ONE · DASIC". */
export function documentTitle(page?: string): string {
  const base = `${branding.productName} · ${branding.organizationName}`;
  return page ? `${page} — ${base}` : base;
}
