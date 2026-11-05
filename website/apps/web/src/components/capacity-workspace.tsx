'use client';
import { useId, useRef, useState } from 'react';
import type { CapacityDeclarationView } from '@nasj/contracts';
import { apiFetch } from '@/lib/api';
import { ActionForm, Input, Select, text } from './workspace-ui';
import { Button } from './ui/button';

type Skill = { craftSkillId: string; craftSkill: { name: string } };
const displayQuantity = (value: string) => value.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
// datetime-local is explicitly interpreted in Africa/Tunis, independent of the browser timezone.
const tunisInput = (value: string) =>
  new Date(new Date(value).getTime() + 3600000).toISOString().slice(0, 16);
const tunisInstant = (value: string) => new Date(`${value}:00+01:00`).toISOString();
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Tunis',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

export function CapacityWorkspace({
  rows,
  skills,
  path,
  reload,
  canUpdate,
  authorizations,
}: {
  rows: CapacityDeclarationView[];
  skills: Skill[];
  path: string;
  reload: () => unknown;
  canUpdate: boolean;
  authorizations?: { id: string; label: string }[];
}) {
  const assisted = authorizations !== undefined;
  const current = rows.filter((row) => !row.supersededAt);
  const [craft, setCraft] = useState('');
  const [period, setPeriod] = useState('');
  const [editing, setEditing] = useState<CapacityDeclarationView | null>(null);
  const pending = useRef<{ payload: string; key: string } | null>(null);
  const visible = current.filter((row) => !craft || row.craftSkillId === craft);
  const selected = visible.find((row) => row.id === period) ?? visible[0];
  const summary = selected?.summary;
  const craftId = useId(),
    periodId = useId();
  const craftName = (id: string) =>
    skills.find((s) => s.craftSkillId === id)?.craftSkill.name ?? id;
  return (
    <>
      <h2>{assisted ? 'Declared capacity' : 'Voluntary weekly capacity'}</h2>
      <p>
        Capacity is your voluntary production budget. For a weekly declaration, choose a seven-day
        period. Longer periods use the stated amount once, without multiplying it by weeks.
      </p>
      <p>
        All dates use Africa/Tunis. Periods include the start and exclude the end. Wearable data is
        never used. Changing capacity does not change accepted work; accepted terms require an
        amendment.
      </p>
      {current.length > 0 && (
        <>
          <div className="field">
            <label htmlFor={craftId}>Capacity craft</label>
            <select
              id={craftId}
              value={craft}
              onChange={(e) => {
                setCraft(e.target.value);
                setPeriod('');
              }}
            >
              <option value="">All crafts</option>
              {skills.map((s) => (
                <option key={s.craftSkillId} value={s.craftSkillId}>
                  {s.craftSkill.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={periodId}>Production period</label>
            <select
              id={periodId}
              value={selected?.id ?? ''}
              onChange={(e) => setPeriod(e.target.value)}
            >
              {visible.map((row) => (
                <option key={row.id} value={row.id}>
                  {craftName(row.craftSkillId)} · {row.unitType} · {dateLabel(row.effectiveFrom)} –{' '}
                  {dateLabel(row.effectiveTo)}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      {summary && (
        <section aria-label="System-calculated capacity" aria-live="polite">
          <h3>System-calculated availability</h3>
          <dl className="settings-grid">
            {(
              [
                ['Declared', summary.declared],
                ['Reserved', summary.reserved],
                ['Committed', summary.committed],
                ['Remaining', summary.remaining],
                ['Capacity deficit', summary.deficit],
              ] as const
            ).map(([label, quantity]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  {quantity} {summary.unitType.toLowerCase()}
                </dd>
              </div>
            ))}
          </dl>
          <p>
            Version {summary.version} · calculated {dateLabel(summary.asOf)}. Reservations are
            temporary offers; commitments are accepted work.
          </p>
          {summary.deficit !== '0.00' && (
            <p className="notice capacity-warning" role="alert">
              Warning: Your declared capacity is lower than the work already accepted. Existing
              commitments remain active. Please review your availability with your coordinator. An
              amendment is required to change accepted work.
            </p>
          )}
          {summary.reservationShortfall !== '0.00' && (
            <p className="notice capacity-warning">
              Warning: Pending offers and accepted work exceed the declaration by{' '}
              {summary.reservationShortfall} {summary.unitType.toLowerCase()}. Additional offers are
              blocked; pending acceptance must be reviewed.
            </p>
          )}
          {!summary.availabilityKnown && (
            <p className="notice capacity-warning" role="alert">
              Warning: Availability is unknown. Additional offers are blocked until incompatible
              units, overlapping declarations or unallocated periods are resolved. Hours and pieces
              are never automatically converted.
            </p>
          )}
          {canUpdate && selected && (
            <Button type="button" variant="secondary" onClick={() => setEditing(selected)}>
              Revise selected period
            </Button>
          )}
        </section>
      )}
      {rows.length === 0 && <p>No capacity declarations yet.</p>}
      {canUpdate && skills.length > 0 && (
        <>
          {editing && (
            <p>
              Revising version {editing.version}. Accepted work stays unchanged.{' '}
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                New declaration
              </Button>
            </p>
          )}
          <ActionForm
            key={editing ? `${editing.id}-${editing.version}` : 'new'}
            label={assisted ? 'Record declared capacity' : 'Declare capacity'}
            onSuccess={async () => {
              await reload();
              setEditing(null);
            }}
            action={async (data) => {
              const effectiveFrom = tunisInstant(text(data, 'effectiveFrom'));
              const effectiveTo = tunisInstant(text(data, 'effectiveTo'));
              const craftSkillId = text(data, 'craftSkillId'),
                unitType = text(data, 'unitType');
              const previous = rows.find(
                (r) =>
                  !r.supersededAt &&
                  r.craftSkillId === craftSkillId &&
                  r.unitType === unitType &&
                  r.effectiveFrom === effectiveFrom &&
                  r.effectiveTo === effectiveTo,
              );
              const body = {
                craftSkillId,
                unitType,
                effectiveFrom,
                effectiveTo,
                quantity: assisted ? text(data, 'quantity') : Number(text(data, 'quantity')),
                expectedVersion: previous?.version ?? 0,
                ...(assisted ? { authorizationId: text(data, 'authorizationId') } : {}),
              };
              const payload = JSON.stringify(body);
              if (pending.current?.payload !== payload)
                pending.current = { payload, key: crypto.randomUUID() };
              const result = await apiFetch(`${path}/capacity`, {
                method: 'POST',
                body,
                idempotencyKey: pending.current.key,
              });
              pending.current = null;
              return result;
            }}
          >
            <Select
              name="craftSkillId"
              label="Craft"
              value={editing?.craftSkillId}
              options={skills.map((s) => ({ value: s.craftSkillId, label: s.craftSkill.name }))}
            />
            <Select
              name="unitType"
              label={assisted ? 'Capacity unit' : 'Weekly capacity unit'}
              value={editing?.unitType}
              options={['HOURS', 'PIECES']}
            />
            <Input
              name="quantity"
              label={assisted ? 'Weekly declared quantity' : 'Quantity per week'}
              value={editing?.quantity}
              type="number"
              min="0"
              max="100000"
              step="0.01"
              required
            />
            <Input
              name="effectiveFrom"
              label="Effective from"
              value={editing ? tunisInput(editing.effectiveFrom) : ''}
              type="datetime-local"
              required
            />
            <Input
              name="effectiveTo"
              label={assisted ? 'Effective to' : 'Effective until'}
              value={editing ? tunisInput(editing.effectiveTo) : ''}
              type="datetime-local"
              required
            />
            {assisted && (
              <Select
                name="authorizationId"
                label="Worker capacity authorization"
                required
                options={[
                  { value: '', label: 'Choose current worker authorization' },
                  ...authorizations.map((a) => ({ value: a.id, label: a.label })),
                ]}
              />
            )}
          </ActionForm>
        </>
      )}
      {canUpdate && skills.length === 0 && <p>Add a craft skill before declaring capacity.</p>}
      <h3>Declaration history</h3>
      <ul className="record-list">
        {rows.map((row) => (
          <li key={row.id}>
            {row.supersededAt ? 'Superseded declaration' : 'Current declaration'} · version{' '}
            {row.version} · {displayQuantity(row.quantity)}{' '}
            {assisted ? row.unitType : row.unitType.toLowerCase()}{' '}
            {new Date(row.effectiveTo).getTime() - new Date(row.effectiveFrom).getTime() ===
            604800000
              ? 'per week'
              : 'for this period'}{' '}
            · {craftName(row.craftSkillId)}
            <p>
              {dateLabel(row.effectiveFrom)} – {dateLabel(row.effectiveTo)} (Africa/Tunis)
            </p>
            <p>
              {row.recordingMode === 'SELF' ? 'Artisan self-recorded' : 'Coordinator-assisted'} ·
              recorded by {row.recordedByName} · {dateLabel(row.createdAt)}
            </p>
            {row.authorizationId && <p>Worker authorization: {row.authorizationId}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}
