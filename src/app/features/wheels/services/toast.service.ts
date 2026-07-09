import { Injectable, signal } from '@angular/core';

/** ARIA live-region role the consumer must render the toast with. */
export type ToastKind = 'status' | 'alert';

/** A single toast notification. */
export interface Toast {
  readonly kind: ToastKind;
  readonly message: string;
}

/**
 * Minimal in-memory toast notification store.
 *
 * There is no shared design system yet (`@pivot/design-system`, EN17.2, not created) to host a
 * global toast overlay, so each consuming component renders its own toast region from
 * {@link ToastService#current} — `kind` maps directly to the ARIA live-region role
 * (`role="status"` for success, `role="alert"` for errors).
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toastSignal = signal<Toast | null>(null);

  /** The current toast to display, or `null` if none. */
  readonly current = this.toastSignal.asReadonly();

  /**
   * Shows a success/confirmation toast (`role="status"`).
   *
   * @param message the message to display
   */
  success(message: string): void {
    this.toastSignal.set({ kind: 'status', message });
  }

  /**
   * Shows an error toast (`role="alert"`).
   *
   * @param message the message to display
   */
  error(message: string): void {
    this.toastSignal.set({ kind: 'alert', message });
  }

  /** Clears the current toast. */
  dismiss(): void {
    this.toastSignal.set(null);
  }
}
