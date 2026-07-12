/**
 * Pure view-model + demo data for {@link AgiliteHubComponent} — no Angular, no I/O, unit-testable.
 *
 * **Demo data, deliberately.** Only the wheel/retro/poker sub-features are backed by
 * `pivot-agilite-core` today; the **Daily** and **Capacity** tabs have no backend yet (schema
 * `agilite` carries no daily/capacity/velocity table — a documented gap). This module therefore
 * ships representative sample data so the agrégée hub renders end-to-end; wiring each tab to a real
 * endpoint (wheel API first, then a new daily/capacity backend) is the follow-up. Kept here, pure
 * and isolated, so swapping demo arrays for API responses touches nothing in the component/template.
 */

export type HubTab = 'daily' | 'wheel' | 'capacity';

export interface TeamMember {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly role: string;
}

export const TEAM: readonly TeamMember[] = [
  { id: 'mc', name: 'Marion Caron', initials: 'MC', role: 'PO' },
  { id: 'jl', name: 'Julie Lefèvre', initials: 'JL', role: 'Scrum Master' },
  { id: 'sb', name: 'Samuel Bertrand', initials: 'SB', role: 'Dev' },
  { id: 'kh', name: 'Karim Haddad', initials: 'KH', role: 'Dev' },
  { id: 'lf', name: 'Léa Fontaine', initials: 'LF', role: 'Dev' },
  { id: 'tg', name: 'Thomas Girard', initials: 'TG', role: 'Dev' },
  { id: 'nb', name: 'Nadia Benali', initials: 'NB', role: 'Dev' },
  { id: 'ar', name: 'Antoine Roux', initials: 'AR', role: 'Dev' },
];

type DailyStatus = 'fait' | 'cours' | 'bloque';
const TODAY_STATUS: Record<string, { status: DailyStatus; note: string | null }> = {
  mc: { status: 'cours', note: null },
  jl: { status: 'fait', note: null },
  sb: { status: 'bloque', note: 'Bloqué sur la configuration du webhook SSO.' },
  kh: { status: 'fait', note: null },
  lf: { status: 'cours', note: null },
  tg: { status: 'fait', note: null },
  nb: { status: 'fait', note: null },
  ar: { status: 'cours', note: null },
};

type TaskStatus = 'termine' | 'cours' | 'faire';
const SPRINT_TASKS: readonly { name: string; initials: string; status: TaskStatus }[] = [
  { name: 'Finaliser intégration SSO', initials: 'SB', status: 'cours' },
  { name: "Tests d'acceptation module Whiteboard", initials: 'KH', status: 'faire' },
  { name: 'Correctif export CSV rapports', initials: 'LF', status: 'termine' },
  { name: 'Documentation API interne', initials: 'TG', status: 'cours' },
  { name: 'Revue sécurité authentification', initials: 'NB', status: 'faire' },
  { name: 'Préparation démo de sprint', initials: 'AR', status: 'cours' },
];

const HISTORY: readonly { date: string; ok: number; cours: number; bloque: number; note: string }[] = [
  { date: '11 juillet', ok: 6, cours: 1, bloque: 1, note: "Blocage sur l'API paiement — en cours de résolution par Karim." },
  { date: '10 juillet', ok: 7, cours: 1, bloque: 0, note: 'RAS.' },
  { date: '9 juillet', ok: 6, cours: 2, bloque: 0, note: 'Revue de code plus longue que prévue sur le module SSO.' },
  { date: '8 juillet', ok: 8, cours: 0, bloque: 0, note: 'RAS.' },
  { date: '7 juillet', ok: 5, cours: 2, bloque: 1, note: "Attente de retour du fournisseur d'identité." },
];

const WHEEL_HISTORY: readonly { id: string; date: string }[] = [
  { id: 'jl', date: '11 juillet' },
  { id: 'ar', date: '10 juillet' },
  { id: 'mc', date: '9 juillet' },
  { id: 'sb', date: '8 juillet' },
  { id: 'nb', date: '7 juillet' },
];

const VELOCITY: readonly { label: string; points: number }[] = [
  { label: 'Sprint 8', points: 32 },
  { label: 'Sprint 9', points: 36 },
  { label: 'Sprint 10', points: 34 },
  { label: 'Sprint 11', points: 40 },
  { label: 'Sprint 12', points: 38 },
  { label: 'Sprint 13', points: 44 },
];

const CAPACITY_DATA: readonly { id: string; capacityDays: number; chargeDays: number }[] = [
  { id: 'mc', capacityDays: 6, chargeDays: 5 },
  { id: 'jl', capacityDays: 5, chargeDays: 6 },
  { id: 'sb', capacityDays: 9, chargeDays: 10 },
  { id: 'kh', capacityDays: 10, chargeDays: 8 },
  { id: 'lf', capacityDays: 8, chargeDays: 8 },
  { id: 'tg', capacityDays: 10, chargeDays: 9 },
  { id: 'nb', capacityDays: 7, chargeDays: 4 },
  { id: 'ar', capacityDays: 9, chargeDays: 9 },
];

const WHEEL_COLORS = [
  'var(--color-brand-200)',
  'var(--color-gray-300)',
  'var(--color-brand-500)',
  'var(--color-gray-400)',
  'var(--color-brand-700)',
  'var(--color-brand-100)',
  'var(--color-brand-600)',
  'var(--color-gray-200)',
];

const STATUS_META: Record<DailyStatus, { label: string; kind: string }> = {
  fait: { label: 'Fait', kind: 'ok' },
  cours: { label: 'En cours', kind: 'progress' },
  bloque: { label: 'Bloqué', kind: 'blocked' },
};
const TASK_STATUS_META: Record<TaskStatus, { label: string; kind: string }> = {
  termine: { label: 'Terminé', kind: 'ok' },
  cours: { label: 'En cours', kind: 'progress' },
  faire: { label: 'À faire', kind: 'todo' },
};
const DOT_KIND: Record<'fait' | 'cours' | 'bloque', string> = { fait: 'ok', cours: 'progress', bloque: 'blocked' };

export interface HubDailyMember extends TeamMember {
  readonly note: string | null;
  readonly statusLabel: string;
  readonly statusKind: string;
}
export interface HubTask {
  readonly name: string;
  readonly initials: string;
  readonly statusLabel: string;
  readonly statusKind: string;
}
export interface HubHistoryEntry {
  readonly dateLabel: string;
  readonly note: string;
  readonly dots: readonly string[];
}
export interface WheelSlice {
  readonly initials: string;
  readonly angle: number;
  readonly counter: number;
}
export interface HubWheelHistory {
  readonly initials: string;
  readonly name: string;
  readonly dateLabel: string;
}
export interface VelocityBar {
  readonly label: string;
  readonly points: number;
  readonly heightPct: number;
}
export interface CapacityRow {
  readonly initials: string;
  readonly name: string;
  readonly capacityDays: number;
  readonly chargeDays: number;
  readonly barWidth: number;
  readonly ratioLabel: string;
  readonly kind: 'over' | 'balanced' | 'under';
}

/** The full derived view of the hub, given the interactive wheel state. */
export interface HubView {
  readonly team: readonly HubDailyMember[];
  readonly sprintTasks: readonly HubTask[];
  readonly history: readonly HubHistoryEntry[];
  readonly wheelGradient: string;
  readonly wheelSlices: readonly WheelSlice[];
  readonly wheelHistory: readonly HubWheelHistory[];
  readonly velocity: readonly VelocityBar[];
  readonly capacity: readonly CapacityRow[];
}

/** Segment angle of one wheel slice. */
export const WHEEL_SEG_ANGLE = 360 / TEAM.length;

/** Builds every derived list of the hub. `overloadThreshold` is the "surcharge" ratio (%, default 110). */
export function buildHubView(overloadThreshold = 110): HubView {
  const team = TEAM.map<HubDailyMember>(m => {
    const s = TODAY_STATUS[m.id];
    return { ...m, note: s.note, statusLabel: STATUS_META[s.status].label, statusKind: STATUS_META[s.status].kind };
  });

  const sprintTasks = SPRINT_TASKS.map<HubTask>(t => ({
    name: t.name,
    initials: t.initials,
    statusLabel: TASK_STATUS_META[t.status].label,
    statusKind: TASK_STATUS_META[t.status].kind,
  }));

  const history = HISTORY.map<HubHistoryEntry>(h => ({
    dateLabel: h.date,
    note: h.note,
    dots: [
      ...Array<string>(h.ok).fill(DOT_KIND.fait),
      ...Array<string>(h.cours).fill(DOT_KIND.cours),
      ...Array<string>(h.bloque).fill(DOT_KIND.bloque),
    ],
  }));

  let acc = 0;
  const stops = TEAM.map((_, i) => {
    const from = acc;
    const to = acc + WHEEL_SEG_ANGLE;
    acc = to;
    return `${WHEEL_COLORS[i % WHEEL_COLORS.length]} ${from}deg ${to}deg`;
  });
  const wheelGradient = `conic-gradient(from 0deg, ${stops.join(', ')})`;
  const wheelSlices = TEAM.map<WheelSlice>((m, i) => ({
    initials: m.initials,
    angle: i * WHEEL_SEG_ANGLE + WHEEL_SEG_ANGLE / 2,
    counter: -(i * WHEEL_SEG_ANGLE + WHEEL_SEG_ANGLE / 2),
  }));
  const wheelHistory = WHEEL_HISTORY.map<HubWheelHistory>(w => {
    const m = TEAM.find(t => t.id === w.id)!;
    return { initials: m.initials, name: m.name, dateLabel: w.date };
  });

  const maxV = Math.max(...VELOCITY.map(v => v.points));
  const velocity = VELOCITY.map<VelocityBar>(v => ({
    label: v.label,
    points: v.points,
    heightPct: Math.round((v.points / maxV) * 100),
  }));

  const capacity = CAPACITY_DATA.map<CapacityRow>(c => {
    const m = TEAM.find(t => t.id === c.id)!;
    const ratio = Math.round((c.chargeDays / c.capacityDays) * 100);
    const kind: CapacityRow['kind'] = ratio > overloadThreshold ? 'over' : ratio < 70 ? 'under' : 'balanced';
    return {
      initials: m.initials,
      name: m.name,
      capacityDays: c.capacityDays,
      chargeDays: c.chargeDays,
      barWidth: Math.min(ratio, 100),
      ratioLabel: `${ratio}%`,
      kind,
    };
  });

  return { team, sprintTasks, history, wheelGradient, wheelSlices, wheelHistory, velocity, capacity };
}

/** Picks a random winning member and the wheel rotation that lands its slice under the top pointer. */
export function pickWheelTarget(currentRotation: number, randomFraction: number): { memberId: string; rotation: number } {
  const idx = Math.min(TEAM.length - 1, Math.floor(randomFraction * TEAM.length));
  const centerAngle = idx * WHEEL_SEG_ANGLE + WHEEL_SEG_ANGLE / 2;
  const currentMod = ((currentRotation % 360) + 360) % 360;
  const delta = (360 - centerAngle - currentMod + 360) % 360;
  return { memberId: TEAM[idx].id, rotation: currentRotation + 5 * 360 + delta };
}

export function memberById(id: string | null): TeamMember | null {
  return id ? (TEAM.find(t => t.id === id) ?? null) : null;
}
