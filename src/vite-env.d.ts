/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_SHEETS_WEBAPP_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
