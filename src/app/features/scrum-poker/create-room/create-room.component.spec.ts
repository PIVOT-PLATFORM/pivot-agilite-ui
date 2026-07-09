import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { RoomResponse } from '../room.model';
import { RoomService } from '../room.service';
import { CreateRoomComponent } from './create-room.component';

describe('CreateRoomComponent', () => {
  const mockRoom: RoomResponse = {
    id: 42,
    name: 'Sprint 8 estimation',
    inviteCode: 'K7M2XQ',
    sequence: 'FIBONACCI',
    cardValues: ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?'],
    facilitatorUserId: 7,
    active: true,
    createdAt: '2026-07-10T10:00:00Z',
    expiresAt: '2026-07-11T10:00:00Z',
    wsTopic: '/topic/agilite/poker/42',
  };

  let createRoomSpy: ReturnType<typeof vi.fn>;
  let getRoomSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    createRoomSpy = vi.fn().mockReturnValue(of(mockRoom));
    getRoomSpy = vi.fn();

    await TestBed.configureTestingModule({
      imports: [CreateRoomComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
      providers: [
        {
          provide: RoomService,
          useValue: { createRoom: createRoomSpy, getRoom: getRoomSpy },
        },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(CreateRoomComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  /**
   * Given an empty room name, when the form is submitted, then the service is never called,
   * the form is marked touched, and the template surfaces the required-field error with
   * aria-invalid/aria-describedby wired to it (A11y AC).
   */
  it('does not submit an empty name and surfaces an accessible error', () => {
    const fixture = TestBed.createComponent(CreateRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    (component as unknown as { onSubmit: () => void }).onSubmit();
    fixture.detectChanges();

    expect(createRoomSpy).not.toHaveBeenCalled();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#room-name');
    const error: HTMLElement | null = fixture.nativeElement.querySelector('#room-name-error');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('room-name-error');
    // TranslocoTestingModule provides empty translation maps — the pipe renders the raw key
    // (e.g. "en.scrumPoker.createRoom.nameRequired"), which is enough to prove the "required"
    // branch (not "maxlength") was selected.
    expect(error?.textContent?.trim()).toContain('nameRequired');
  });

  /**
   * Given a name longer than 120 characters, when submitted, then the service is never called
   * and the template surfaces the too-long error.
   */
  it('does not submit a name longer than 120 characters and surfaces the error', () => {
    const fixture = TestBed.createComponent(CreateRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      form: { controls: { name: { setValue: (v: string) => void } } };
      onSubmit: () => void;
    };

    component.form.controls.name.setValue('a'.repeat(121));
    component.onSubmit();
    fixture.detectChanges();

    expect(createRoomSpy).not.toHaveBeenCalled();
    const error: HTMLElement | null = fixture.nativeElement.querySelector('#room-name-error');
    expect(error?.textContent?.trim()).toContain('nameTooLong');
  });

  /**
   * Given a valid room name, when the form is submitted, then RoomService.createRoom() is
   * called with that name and, on success, the created room becomes visible.
   */
  it('submits a valid name and displays the created room', () => {
    const fixture = TestBed.createComponent(CreateRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      form: { controls: { name: { setValue: (v: string) => void } } };
      onSubmit: () => void;
      createdRoom: () => RoomResponse | null;
    };

    component.form.controls.name.setValue('Sprint 8 estimation');
    component.onSubmit();
    fixture.detectChanges();

    expect(createRoomSpy).toHaveBeenCalledWith({ name: 'Sprint 8 estimation' });
    expect(component.createdRoom()).toEqual(mockRoom);
  });

  /**
   * Security/error case: given the backend rejects with 401 (missing/invalid token), when
   * submitted, then the unauthorized error key is set — never a raw backend message.
   */
  it('maps a 401 response to the unauthorized error key', () => {
    createRoomSpy.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 401 })),
    );
    const fixture = TestBed.createComponent(CreateRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      form: { controls: { name: { setValue: (v: string) => void } } };
      onSubmit: () => void;
      errorMessageKey: () => string | null;
    };

    component.form.controls.name.setValue('Room');
    component.onSubmit();
    fixture.detectChanges();

    expect(component.errorMessageKey()).toBe('scrumPoker.createRoom.errors.unauthorized');
  });

  /**
   * Error case: given the backend rejects with 400 and code INVALID_NAME, when submitted,
   * then the invalid-name error key is set.
   */
  it('maps a 400 INVALID_NAME response to the invalid name error key', () => {
    createRoomSpy.mockReturnValue(
      throwError(
        () => new HttpErrorResponse({ status: 400, error: { code: 'INVALID_NAME' } }),
      ),
    );
    const fixture = TestBed.createComponent(CreateRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      form: { controls: { name: { setValue: (v: string) => void } } };
      onSubmit: () => void;
      errorMessageKey: () => string | null;
    };

    component.form.controls.name.setValue('Room');
    component.onSubmit();
    fixture.detectChanges();

    expect(component.errorMessageKey()).toBe('scrumPoker.createRoom.errors.invalidName');
  });

  /**
   * Error case: given an unexpected 500 response, when submitted, then the generic error key
   * is set.
   */
  it('maps a 500 response to the generic error key', () => {
    createRoomSpy.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    const fixture = TestBed.createComponent(CreateRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      form: { controls: { name: { setValue: (v: string) => void } } };
      onSubmit: () => void;
      errorMessageKey: () => string | null;
    };

    component.form.controls.name.setValue('Room');
    component.onSubmit();
    fixture.detectChanges();

    expect(component.errorMessageKey()).toBe('scrumPoker.createRoom.errors.generic');
  });

  /**
   * Given no room created yet, when copyInviteCode() is called, then it no-ops (no clipboard
   * call, no announcement) rather than throwing.
   */
  it('copyInviteCode() no-ops when no room was created', () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });

    const fixture = TestBed.createComponent(CreateRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      copyInviteCode: () => void;
      copyAnnouncementKey: () => string | null;
    };

    component.copyInviteCode();

    expect(writeText).not.toHaveBeenCalled();
    expect(component.copyAnnouncementKey()).toBeNull();
  });

  /**
   * Given a created room, when copyInviteCode() is called and the clipboard write fails, then
   * the copy-error announcement key is set instead of throwing.
   */
  it('announces an error when copying the invite code fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText } });

    const fixture = TestBed.createComponent(CreateRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      form: { controls: { name: { setValue: (v: string) => void } } };
      onSubmit: () => void;
      copyInviteCode: () => void;
      copyAnnouncementKey: () => string | null;
    };

    component.form.controls.name.setValue('Room');
    component.onSubmit();
    fixture.detectChanges();

    component.copyInviteCode();
    await Promise.resolve();
    await Promise.resolve();

    expect(component.copyAnnouncementKey()).toBe('scrumPoker.createRoom.copyError');
  });

  /**
   * Error case: given a 400 response whose code is not INVALID_NAME (e.g. absent), when
   * submitted, then the generic invalid-request error key is set (not invalidName).
   */
  it('maps a 400 response without INVALID_NAME code to the invalid request error key', () => {
    createRoomSpy.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400, error: {} })),
    );
    const fixture = TestBed.createComponent(CreateRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      form: { controls: { name: { setValue: (v: string) => void } } };
      onSubmit: () => void;
      errorMessageKey: () => string | null;
    };

    component.form.controls.name.setValue('Room');
    component.onSubmit();
    fixture.detectChanges();

    expect(component.errorMessageKey()).toBe('scrumPoker.createRoom.errors.invalidRequest');
  });

  /**
   * Given a created room, when copyInviteCode() is called and the clipboard write succeeds,
   * then the copy-success announcement key is set (for screen reader users).
   */
  it('announces success after copying the invite code', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const fixture = TestBed.createComponent(CreateRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      form: { controls: { name: { setValue: (v: string) => void } } };
      onSubmit: () => void;
      copyInviteCode: () => void;
      copyAnnouncementKey: () => string | null;
    };

    component.form.controls.name.setValue('Room');
    component.onSubmit();
    fixture.detectChanges();

    component.copyInviteCode();
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith('K7M2XQ');
    expect(component.copyAnnouncementKey()).toBe('scrumPoker.createRoom.copySuccess');
  });

  /**
   * Given a created room shown in the success view, when createAnother() is called, then the
   * form view is shown again (createdRoom resets to null).
   */
  it('createAnother() resets the success view', () => {
    const fixture = TestBed.createComponent(CreateRoomComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      form: { controls: { name: { setValue: (v: string) => void } } };
      onSubmit: () => void;
      createAnother: () => void;
      createdRoom: () => RoomResponse | null;
    };

    component.form.controls.name.setValue('Room');
    component.onSubmit();
    fixture.detectChanges();
    expect(component.createdRoom()).not.toBeNull();

    component.createAnother();
    fixture.detectChanges();

    expect(component.createdRoom()).toBeNull();
  });
});
