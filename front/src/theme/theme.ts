import type { Preferences } from '@pippos/shared';

export type Theme = Preferences['theme'];

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}
