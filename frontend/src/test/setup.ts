import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

const noop = () => undefined;

if (typeof window !== 'undefined') {
  window.matchMedia = window.matchMedia || ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: noop,
    removeListener: noop,
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: () => true,
  }));

  window.ResizeObserver =
    window.ResizeObserver ||
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
}
