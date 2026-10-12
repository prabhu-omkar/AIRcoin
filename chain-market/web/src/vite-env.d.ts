/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_INDEXER_URL?: string;
  readonly VITE_VALIDATOR_URL?: string;
  readonly VITE_TWIN_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
