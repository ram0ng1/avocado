// Globais de runtime que nenhum módulo expõe (`flarum`, `m`, `$`), e o namespace
// JSX para os .tsx que recebem componentes do Flarum tipados como `any`.

declare const flarum: {
  reg: {
    asyncModuleImport(id: string): Promise<{ default: any }>;
    addChunkModule(id: string, mod: any): void;
    // (namespace, module path, handler) — o handler roda na hora se o módulo já
    // estiver registrado, e fica guardado até o registro quando não.
    onLoad(namespace: string, id: string, handler: (module: any) => void): void;
  };
  extensions: Record<string, unknown>;
  [key: string]: any;
};

declare const m: any;
declare const $: any;
