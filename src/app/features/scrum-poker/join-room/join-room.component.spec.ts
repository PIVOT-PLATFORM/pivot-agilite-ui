import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
import { JoinRoomResponse } from '../room.model';
import { RoomWsService } from '../room-ws.service';
import { RoomService } from '../room.service';
import { JoinRoomComponent } from './join-room.component';

describe('JoinRoomComponent', () => {
  const mockRoom: JoinRoomResponse = {
    roomId: '9f4e6b1a-6c3d-4b8e-8f2a-1234567890ab',
    name: 'Sprint 8 estimation',
    sequence: 'FIBONACCI',
    cardValues: ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?'],
    active: true,
    expiresAt: '2026-07-11T10:00:00Z',
    wsTopic: '/topic/agilite/poker/9f4e6b1a-6c3d-4b8e-8f2a-1234567890ab',
    accessToken: 'opaque-access-token',
  };

  let joinRoomSpy: ReturnType<typeof vi.fn>;
  let wsConnectSpy: ReturnType<typeof vi.fn>;
  let wsDisconnectSpy: ReturnType<typeof vi.fn>;
  let wsStatusSignal: ReturnType<typeof signal<'connecting' | 'connected' | 'error'>>;

  beforeEach(async () => {
    joinRoomSpy = vi.fn().mockReturnValue(of(mockRoom));
    wsConnectSpy = vi.fn();
    wsDisconnectSpy = vi.fn();
    wsStatusSignal = signal<'connecting' | 'connected' | 'error'>('connecting');

    await TestBed.configureTestingModule({
      imports: [JoinRoomComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
      providers: [
        { provide: RoomService, useValue: { joinRoom: joinRoomSpy } },
        {
          provide: RoomWsService,
          useValue: { status: wsStatusSignal, connect: wsConnectSpy, disconnect: wsDisconnectSpy },
        },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(JoinRoomComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  /**
   * Given an empty code, when the form is submitted, then the service is never called, the
   * form is marked touched, and the template surfaces the required-field error with
   * aria-invalid/aria-describedby wired to it (A11y AC).
   */
  it('does not submit an empty code and surfaces an accessible required error', () => {
    const fixture = TestBed.createComponent(JoinRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    (component as unknown as { onSubmit: () => void }).onSubmit();
    fixture.detectChanges();

    expect(joinRoomSpy).not.toHaveBeenCalled();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#join-room-code');
    const error: HTMLElement | null = fixture.nativeElement.querySelector('#join-room-code-error');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('join-room-code-error');
    // TranslocoTestingModule provides empty translation maps — the pipe renders the raw key
    // (e.g. "en.scrumPoker.joinRoom.codeRequired"), which is enough to prove the "required"
    // branch (not "minlength"/"maxlength") was selected.
    expect(error?.textContent?.trim()).toContain('codeRequired');
  });

  /**
   * Given a code shorter than 6 characters, when submitted, then the service is never called
   * and the template surfaces the invalid-length error.
   */
  it('does not submit a code shorter than 6 characters and surfaces the length error', () => {
    const fixture = TestBed.createComponent(JoinRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      form: { controls: { code: { setValue: (v: string) => void } } };
      onSubmit: () => void;
    };

    component.form.controls.code.setValue('AB12');
    component.onSubmit();
    fixture.detectChanges();

    expect(joinRoomSpy).not.toHaveBeenCalled();
    const error: HTMLElement | null = fixture.nativeElement.querySelector('#join-room-code-error');
    expect(error?.textContent?.trim()).toContain('codeInvalidLength');
  });

  /**
   * Given a code longer than 6 characters, when submitted, then the service is never called
   * and the template surfaces the invalid-length error.
   */
  it('does not submit a code longer than 6 characters and surfaces the length error', () => {
    const fixture = TestBed.createComponent(JoinRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      form: { controls: { code: { setValue: (v: string) => void } } };
      onSubmit: () => void;
    };

    component.form.controls.code.setValue('AB123456');
    component.onSubmit();
    fixture.detectChanges();

    expect(joinRoomSpy).not.toHaveBeenCalled();
    const error: HTMLElement | null = fixture.nativeElement.querySelector('#join-room-code-error');
    expect(error?.textContent?.trim()).toContain('codeInvalidLength');
  });

  /**
   * Given a valid, lowercase code, when submitted, then RoomService.joinRoom() is called with
   * the uppercased code (the backend does not normalize case) and, on success, the joined room
   * is displayed and the STOMP client is connected with the response's wsTopic/accessToken.
   */
  it('uppercases the code, joins the room, and connects the STOMP client with wsTopic/accessToken', () => {
    const fixture = TestBed.createComponent(JoinRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      form: { controls: { code: { setValue: (v: string) => void } } };
      onSubmit: () => void;
      joinedRoom: () => JoinRoomResponse | null;
    };

    component.form.controls.code.setValue('k7m2xq');
    component.onSubmit();
    fixture.detectChanges();

    expect(joinRoomSpy).toHaveBeenCalledWith({ code: 'K7M2XQ' });
    expect(component.joinedRoom()).toEqual(mockRoom);
    expect(wsConnectSpy).toHaveBeenCalledWith(mockRoom.wsTopic, mockRoom.accessToken);
  });

  /**
   * Given the joined room view, then the observable connection status from RoomWsService is
   * rendered (connecting/connected/error), announced via aria-live for screen reader users.
   */
  it('renders the STOMP connection status from RoomWsService after joining', () => {
    const fixture = TestBed.createComponent(JoinRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      form: { controls: { code: { setValue: (v: string) => void } } };
      onSubmit: () => void;
    };

    component.form.controls.code.setValue('K7M2XQ');
    component.onSubmit();
    fixture.detectChanges();

    let statusEl: HTMLElement | null = fixture.nativeElement.querySelector('.join-room__ws-status');
    expect(statusEl?.getAttribute('aria-live')).toBe('polite');
    expect(statusEl?.textContent).toContain('connecting');

    wsStatusSignal.set('connected');
    fixture.detectChanges();
    statusEl = fixture.nativeElement.querySelector('.join-room__ws-status');
    expect(statusEl?.textContent).toContain('connected');
  });

  /**
   * A11y: while the join request is in flight, the submit button carries aria-busy="true" and
   * is disabled.
   */
  it('sets aria-busy and disables the submit button while the request is in flight', () => {
    const pending = new Subject<JoinRoomResponse>();
    joinRoomSpy.mockReturnValue(pending);

    const fixture = TestBed.createComponent(JoinRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      form: { controls: { code: { setValue: (v: string) => void } } };
      onSubmit: () => void;
    };

    component.form.controls.code.setValue('K7M2XQ');
    component.onSubmit();
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.join-room__submit');
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.disabled).toBe(true);
  });

  /**
   * A11y: once the in-flight request resolves with an error, the form (and its submit button)
   * remains visible — unlike the success path, which swaps to the joined-room view — and
   * aria-busy/disabled are cleared so the user can retry.
   */
  it('clears aria-busy after the in-flight request resolves with an error', () => {
    const pending = new Subject<JoinRoomResponse>();
    joinRoomSpy.mockReturnValue(pending);

    const fixture = TestBed.createComponent(JoinRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      form: { controls: { code: { setValue: (v: string) => void } } };
      onSubmit: () => void;
    };

    component.form.controls.code.setValue('K7M2XQ');
    component.onSubmit();
    fixture.detectChanges();

    pending.error(new HttpErrorResponse({ status: 500 }));
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.join-room__submit');
    expect(button.getAttribute('aria-busy')).toBe('false');
    expect(button.disabled).toBe(false);
  });

  /**
   * Security/error case: given the backend rejects with 401 (missing/invalid token), when
   * submitted, then the unauthorized error key is set — never a raw backend message.
   */
  it('maps a 401 response to the unauthorized error key', () => {
    joinRoomSpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
    const fixture = TestBed.createComponent(JoinRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      form: { controls: { code: { setValue: (v: string) => void } } };
      onSubmit: () => void;
      errorMessageKey: () => string | null;
    };

    component.form.controls.code.setValue('K7M2XQ');
    component.onSubmit();
    fixture.detectChanges();

    expect(component.errorMessageKey()).toBe('scrumPoker.joinRoom.errors.unauthorized');
    expect(wsConnectSpy).not.toHaveBeenCalled();
  });

  /**
   * Error case: given the backend rejects with 400 and code INVALID_CODE, when submitted,
   * then the invalid-code error key is set.
   */
  it('maps a 400 INVALID_CODE response to the invalid code error key', () => {
    joinRoomSpy.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400, error: { code: 'INVALID_CODE' } })),
    );
    const fixture = TestBed.createComponent(JoinRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      form: { controls: { code: { setValue: (v: string) => void } } };
      onSubmit: () => void;
      errorMessageKey: () => string | null;
    };

    component.form.controls.code.setValue('K7M2XQ');
    component.onSubmit();
    fixture.detectChanges();

    expect(component.errorMessageKey()).toBe('scrumPoker.joinRoom.errors.invalidCode');
  });

  /**
   * Error case: given a 400 response whose code is not INVALID_CODE (e.g. absent), when
   * submitted, then the generic invalid-request error key is set (not invalidCode).
   */
  it('maps a 400 response without INVALID_CODE code to the invalid request error key', () => {
    joinRoomSpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: {} })));
    const fixture = TestBed.createComponent(JoinRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      form: { controls: { code: { setValue: (v: string) => void } } };
      onSubmit: () => void;
      errorMessageKey: () => string | null;
    };

    component.form.controls.code.setValue('K7M2XQ');
    component.onSubmit();
    fixture.detectChanges();

    expect(component.errorMessageKey()).toBe('scrumPoker.joinRoom.errors.invalidRequest');
  });

  /**
   * Error case: given the backend rejects with 404 (unknown/expired/cross-tenant code —
   * intentionally indistinguishable), when submitted, then the generic not-found error key is
   * set — never a message differentiating the cause.
   */
  it('maps a 404 response to the not-found error key', () => {
    joinRoomSpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    const fixture = TestBed.createComponent(JoinRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      form: { controls: { code: { setValue: (v: string) => void } } };
      onSubmit: () => void;
      errorMessageKey: () => string | null;
    };

    component.form.controls.code.setValue('K7M2XQ');
    component.onSubmit();
    fixture.detectChanges();

    expect(component.errorMessageKey()).toBe('scrumPoker.joinRoom.errors.notFound');
  });

  /**
   * Error case: given an unexpected 500 response, when submitted, then the generic error key
   * is set.
   */
  it('maps a 500 response to the generic error key', () => {
    joinRoomSpy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    const fixture = TestBed.createComponent(JoinRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      form: { controls: { code: { setValue: (v: string) => void } } };
      onSubmit: () => void;
      errorMessageKey: () => string | null;
    };

    component.form.controls.code.setValue('K7M2XQ');
    component.onSubmit();
    fixture.detectChanges();

    expect(component.errorMessageKey()).toBe('scrumPoker.joinRoom.errors.generic');
  });

  /**
   * Given a joined room shown in the success view, when joinAnother() is called, then the
   * STOMP connection is torn down and the form view is shown again (joinedRoom resets to
   * null).
   */
  it('joinAnother() disconnects the STOMP client and resets the form view', () => {
    const fixture = TestBed.createComponent(JoinRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      form: { controls: { code: { setValue: (v: string) => void } } };
      onSubmit: () => void;
      joinAnother: () => void;
      joinedRoom: () => JoinRoomResponse | null;
    };

    component.form.controls.code.setValue('K7M2XQ');
    component.onSubmit();
    fixture.detectChanges();
    expect(component.joinedRoom()).not.toBeNull();

    component.joinAnother();
    fixture.detectChanges();

    expect(wsDisconnectSpy).toHaveBeenCalled();
    expect(component.joinedRoom()).toBeNull();
  });

  /**
   * Given the component is destroyed (e.g. navigation away), then the STOMP connection is
   * torn down rather than leaking an open socket.
   */
  it('disconnects the STOMP client on destroy', () => {
    const fixture = TestBed.createComponent(JoinRoomComponent);
    fixture.detectChanges();

    fixture.destroy();

    expect(wsDisconnectSpy).toHaveBeenCalled();
  });
});
