declare module 'bun:test' {
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function describe(name: string, fn: () => void): void;
  export function expect<T>(actual: T): {
    toBe(expected: T): void;
    toEqual(expected: T): void;
    toHaveBeenCalled(): void;
    toHaveBeenCalledTimes(times: number): void;
    toHaveBeenCalledWith(...args: unknown[]): void;
    rejects: { toThrow(expected?: string | RegExp): Promise<void> };
  };
  export function beforeEach(fn: () => void): void;
  export function afterEach(fn: () => void): void;
  export function mock<T extends (...args: unknown[]) => unknown>(fn: T): T & { mockClear(): void };
}