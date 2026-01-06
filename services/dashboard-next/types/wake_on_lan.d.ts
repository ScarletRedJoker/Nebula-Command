declare module 'wake_on_lan' {
  interface WakeOptions {
    address?: string;
    port?: number;
  }

  function wake(
    mac: string,
    options?: WakeOptions,
    callback?: (error: Error | null) => void
  ): void;

  function wake(mac: string, callback?: (error: Error | null) => void): void;

  export = { wake };
  export default { wake };
}
