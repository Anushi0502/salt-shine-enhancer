type ReactRuntime = {
  [key: string]: unknown;
  Fragment: unknown;
  createElement: (
    type: unknown,
    props?: Record<string, unknown> | null,
    ...children: unknown[]
  ) => unknown;
};

type ReactDomRuntime = {
  [key: string]: unknown;
  createRoot: (...args: unknown[]) => unknown;
  hydrateRoot?: (...args: unknown[]) => unknown;
};

const globalScope = window as Window &
  typeof globalThis & {
    React?: ReactRuntime;
    ReactDOM?: ReactDomRuntime;
  };

export function getReactRuntime(): ReactRuntime {
  const runtime = globalScope.React;
  if (!runtime) {
    throw new Error("SALT React UMD runtime has not been loaded");
  }

  return runtime;
}

export function getReactDomRuntime(): ReactDomRuntime {
  const runtime = globalScope.ReactDOM;
  if (!runtime) {
    throw new Error("SALT ReactDOM UMD runtime has not been loaded");
  }

  return runtime;
}
