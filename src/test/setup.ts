import "@testing-library/jest-dom";

if (typeof URL.createObjectURL === "undefined") {
  URL.createObjectURL = (blob: any) => `blob:mock-${Math.random().toString(36).substring(2)}`;
}
if (typeof URL.revokeObjectURL === "undefined") {
  URL.revokeObjectURL = () => {};
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
