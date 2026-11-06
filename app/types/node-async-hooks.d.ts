// Workers provide AsyncLocalStorage under nodejs_compat (void.config.ts). Only the part we use is
// declared, so the project does not take on all of @types/node's globals.
declare module 'node:async_hooks' {
  export class AsyncLocalStorage<T> {
    run<R>(store: T, callback: () => R): R;
    getStore(): T | undefined;
  }
}
