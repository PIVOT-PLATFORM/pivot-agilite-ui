import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService, TOAST_AUTO_DISMISS_MS } from './toast.service';

describe('ToastService (contrat canonique design-system)', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('has no toast initially', () => {
    expect(service.toasts()).toEqual([]);
  });

  it('show() adds a toast with the given key/type and returns its id', () => {
    const id = service.show('wheels.list.deleteSuccess', 'success');
    const toasts = service.toasts();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({
      id,
      messageKey: 'wheels.list.deleteSuccess',
      type: 'success',
    });
  });

  it('defaults the type to info', () => {
    service.show('some.key');
    expect(service.toasts()[0].type).toBe('info');
  });

  it('deduplicates an identical key + params, returning the existing id', () => {
    const first = service.show('k', 'error', { n: 1 });
    const second = service.show('k', 'error', { n: 1 });
    expect(second).toBe(first);
    expect(service.toasts()).toHaveLength(1);
  });

  it('does not deduplicate the same key with different params', () => {
    service.show('k', 'info', { n: 1 });
    service.show('k', 'info', { n: 2 });
    expect(service.toasts()).toHaveLength(2);
  });

  it('dismiss(id) removes the targeted toast only', () => {
    const a = service.show('a', 'success');
    const b = service.show('b', 'error');
    service.dismiss(a);
    expect(service.toasts().map((t) => t.id)).toEqual([b]);
  });

  it('auto-dismisses after TOAST_AUTO_DISMISS_MS', () => {
    vi.useFakeTimers();
    service.show('a');
    expect(service.toasts()).toHaveLength(1);
    vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS);
    expect(service.toasts()).toHaveLength(0);
  });
});
