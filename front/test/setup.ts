import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

// L1: el login vive en /ingresar; `/` es la landing. Los tests de la app parten de /ingresar (los de la landing fijan `/`).
beforeEach(() => window.history.pushState({}, '', '/ingresar'));

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});
