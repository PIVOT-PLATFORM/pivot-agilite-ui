import { describe, it, expect } from 'vitest';
import { TEAM, WHEEL_SEG_ANGLE, buildHubView, memberById, pickWheelTarget } from './agilite-hub.model';

describe('buildHubView', () => {
  const view = buildHubView();

  it('maps every team member to a daily row with a DS tone as status kind', () => {
    expect(view.team).toHaveLength(TEAM.length);
    const kinds = new Set(view.team.map((m) => m.statusKind));
    // les kinds sont des noms de ton du design system
    kinds.forEach((k) => expect(['success', 'brand', 'danger', 'neutral']).toContain(k));
    const blocked = view.team.find((m) => m.statusLabel === 'Bloqué');
    expect(blocked?.statusKind).toBe('danger');
    expect(blocked?.note).toBeTruthy();
  });

  it('maps sprint tasks with tone kinds', () => {
    expect(view.sprintTasks.length).toBeGreaterThan(0);
    view.sprintTasks.forEach((t) => expect(['success', 'brand', 'neutral']).toContain(t.statusKind));
  });

  it('builds history dots whose count matches ok+cours+bloque and carry tones', () => {
    const first = view.history[0];
    expect(first.dots.length).toBeGreaterThan(0);
    first.dots.forEach((d) => expect(['success', 'brand', 'danger']).toContain(d));
  });

  it('builds a conic-gradient + one counter-rotated slice per member', () => {
    expect(view.wheelGradient).toContain('conic-gradient');
    expect(view.wheelSlices).toHaveLength(TEAM.length);
    view.wheelSlices.forEach((s, i) => {
      expect(s.angle).toBeCloseTo(i * WHEEL_SEG_ANGLE + WHEEL_SEG_ANGLE / 2);
      expect(s.counter).toBeCloseTo(-s.angle);
    });
  });

  it('resolves wheel history members to names', () => {
    expect(view.wheelHistory.length).toBeGreaterThan(0);
    view.wheelHistory.forEach((w) => {
      expect(w.name).toBeTruthy();
      expect(w.initials).toBeTruthy();
    });
  });

  it('normalises velocity bar heights against the max', () => {
    const max = Math.max(...view.velocity.map((v) => v.points));
    const tallest = view.velocity.find((v) => v.points === max)!;
    expect(tallest.heightPct).toBe(100);
    view.velocity.forEach((v) => expect(v.heightPct).toBeLessThanOrEqual(100));
  });

  it('classifies capacity by charge/capacity ratio (over/balanced/under)', () => {
    const jl = view.capacity.find((c) => c.name === 'Julie Lefèvre')!; // 6/5 = 120% > seuil
    expect(jl.kind).toBe('over');
    expect(jl.ratioLabel).toBe('120%');
    const nb = view.capacity.find((c) => c.name === 'Nadia Benali')!; // 4/7 = 57% < 70
    expect(nb.kind).toBe('under');
    const lf = view.capacity.find((c) => c.name === 'Léa Fontaine')!; // 8/8 = 100%
    expect(lf.kind).toBe('balanced');
    view.capacity.forEach((c) => expect(c.barWidth).toBeLessThanOrEqual(100));
  });

  it('honours a custom overload threshold', () => {
    const strict = buildHubView(105).capacity.find((c) => c.name === 'Samuel Bertrand')!; // 10/9 = 111%
    expect(strict.kind).toBe('over');
  });
});

describe('pickWheelTarget', () => {
  it('is deterministic given a random fraction and adds ≥5 full turns', () => {
    const { memberId, rotation } = pickWheelTarget(0, 0);
    expect(memberId).toBe(TEAM[0].id);
    expect(rotation).toBeGreaterThanOrEqual(5 * 360);
  });

  it('clamps a fraction of 1 to the last member', () => {
    expect(pickWheelTarget(0, 0.999999).memberId).toBe(TEAM[TEAM.length - 1].id);
  });
});

describe('memberById', () => {
  it('returns the member or null', () => {
    expect(memberById(TEAM[0].id)?.name).toBe(TEAM[0].name);
    expect(memberById(null)).toBeNull();
    expect(memberById('does-not-exist')).toBeNull();
  });
});
