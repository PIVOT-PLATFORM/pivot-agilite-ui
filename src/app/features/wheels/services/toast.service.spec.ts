import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
  });

  it('has no toast initially', () => {
    expect(service.current()).toBeNull();
  });

  it('success() sets a status toast', () => {
    service.success('Saved');
    expect(service.current()).toEqual({ kind: 'status', message: 'Saved' });
  });

  it('error() sets an alert toast', () => {
    service.error('Failed');
    expect(service.current()).toEqual({ kind: 'alert', message: 'Failed' });
  });

  it('dismiss() clears the toast', () => {
    service.success('Saved');
    service.dismiss();
    expect(service.current()).toBeNull();
  });
});
