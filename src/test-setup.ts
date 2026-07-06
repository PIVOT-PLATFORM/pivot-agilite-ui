/**
 * Bootstrap de l'environnement de test Angular pour vitest standalone
 * (utilise par Stryker via vitest.stryker.config.ts).
 *
 * App zoneless (pas de zone.js en dependances) : on fournit
 * provideZonelessChangeDetection au platform de test.
 */
import { provideZonelessChangeDetection } from '@angular/core';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

getTestBed().initTestEnvironment(
  BrowserTestingModule,
  platformBrowserTesting([provideZonelessChangeDetection()]),
);
