import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TEAM } from './agilite-hub.model';
import { AgiliteHubComponent } from './agilite-hub.component';

function create(): ComponentFixture<AgiliteHubComponent> {
  TestBed.configureTestingModule({
    imports: [AgiliteHubComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
  });
  const fixture = TestBed.createComponent(AgiliteHubComponent);
  fixture.detectChanges();
  return fixture;
}

interface HubApi {
  tab(): string;
  spinning(): boolean;
  resultId(): string | null;
  wheelRotation(): number;
  result(): { name: string } | null;
  select(t: 'daily' | 'wheel' | 'capacity'): void;
  spin(): void;
}

describe('AgiliteHubComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => vi.useRealTimers());

  it('démarre sur l\'onglet Daily et rend le board d\'équipe', () => {
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as HubApi;
    expect(cmp.tab()).toBe('daily');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.pv-avatar').length).toBeGreaterThan(0);
  });

  it('change d\'onglet', () => {
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as HubApi;
    cmp.select('capacity');
    fixture.detectChanges();
    expect(cmp.tab()).toBe('capacity');
    expect((fixture.nativeElement as HTMLElement).querySelector('.agh__velocity')).not.toBeNull();
  });

  it('le tirage tourne la roue puis désigne un membre après le délai', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0); // → premier membre, déterministe
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as HubApi;

    cmp.spin();
    expect(cmp.spinning()).toBe(true);
    expect(cmp.resultId()).toBeNull();
    expect(cmp.wheelRotation()).toBeGreaterThan(0);

    vi.runAllTimers();
    expect(cmp.spinning()).toBe(false);
    expect(cmp.resultId()).toBe(TEAM[0].id);
    expect(cmp.result()?.name).toBe(TEAM[0].name);
  });

  it('ignore un second tirage tant que le premier tourne', () => {
    vi.useFakeTimers();
    const fixture = create();
    const cmp = fixture.componentInstance as unknown as HubApi;
    cmp.spin();
    const rotation = cmp.wheelRotation();
    cmp.spin(); // no-op car spinning
    expect(cmp.wheelRotation()).toBe(rotation);
  });
});
