import '@testing-library/jest-dom';
import { vi } from 'vitest';

const storage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => (key in storage ? storage[key] : null)),
  setItem: vi.fn((key: string, value: string) => {
    storage[key] = String(value);
  }),
  removeItem: vi.fn((key: string) => {
    delete storage[key];
  }),
  clear: vi.fn(() => {
    for (const k of Object.keys(storage)) delete storage[k];
  }),
  key: vi.fn((index: number) => Object.keys(storage)[index] ?? null),
  get length() {
    return Object.keys(storage).length;
  },
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });
// expose for debugging if needed
// @ts-ignore
window.__storage__ = storage;

Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

Object.defineProperty(window, 'scrollTo', {
  value: vi.fn(),
});

HTMLDialogElement.prototype.showModal = vi.fn();
HTMLDialogElement.prototype.close = vi.fn();
HTMLDialogElement.prototype.show = vi.fn();

// Radix (DropdownMenu, Select, Dialog) measures and traps focus. jsdom has
// none of these, so opening any Radix menu throws instead of rendering.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
}
if (!Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => [];
}
if (!globalThis.DOMRect) {
  globalThis.DOMRect = class {
    constructor(x = 0, y = 0, w = 0, h = 0) {
      Object.assign(this, { x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h });
    }
  } as any;
}