/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Preset de branding del tenant ('dasic' | 'atlas'). Default: 'dasic'. */
  readonly VITE_TENANT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
