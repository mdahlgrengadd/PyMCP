/// <reference types="vite/client" />

// SQLite WASM module declarations
declare module '@sqlite.org/sqlite-wasm/sqlite3.wasm?url' {
  const url: string;
  export default url;
}

declare module '@sqlite.org/sqlite-wasm' {
  export default function sqlite3InitModule(config?: {
    print?: (message: string) => void;
    printErr?: (message: string) => void;
    locateFile?: (file: string) => string;
  }): Promise<any>;
}

