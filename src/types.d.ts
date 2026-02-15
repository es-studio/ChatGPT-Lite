export {};

declare global {
  interface Window {
    app: {
      openExternal: (url: string) => Promise<void>;
      reloadChat: () => void;
    };
  }
}
