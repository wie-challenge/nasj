'use client';
import Link from 'next/link';
import { useState } from 'react';
import type {
  DirectoryContributorView,
  DirectoryDetail,
  DirectoryGroupView,
  DirectoryPage,
} from '@nasj/contracts';
import { Pagination } from './governance';
import { Button } from './ui/button';
import { ResourceState, useResource, Workspace } from './workspace-ui';

type Craft = { id: string; name: string; category: string };
const tunisInput = (value: string) =>
  value ? new Date(new Date(value).getTime() + 3600000).toISOString().slice(0, 16) : '';
const tunisInstant = (value: string) => (value ? new Date(`${value}:00+01:00`).toISOString() : '');
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Tunis',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
function stateLabel(group: DirectoryGroupView) {
  if (!group.availabilityKnown && group.knownSubtotal) return 'Known subtotal only';
  if (!group.availabilityKnown) return 'Capacity unknown';
  if (group.deficit !== '0.00') return 'Capacity overcommitted';
  if (group.remaining === '0.00') return 'Capacity fully reserved';
  return 'Capacity available';
}
function amount(value: string | null, unit: string) {
  return value === null ? 'Unknown' : `${value} ${unit.toLowerCase()}`;
}
export function DirectoryWorkspace({
  initial = {},
}: {
  initial?: {
    craft?: string;
    region?: string;
    unit?: string;
    effectiveFrom?: string;
    effectiveTo?: string;
    minRemaining?: string;
  };
}) {
  const crafts = useResource<{ items: Craft[] }>('/api/v1/directory/crafts');
  const regions = useResource<{ items: string[] }>('/api/v1/directory/regions');
  const [draft, setDraft] = useState({
    craft: initial.craft ?? '',
    region: initial.region ?? '',
    unit: initial.unit ?? '',
    effectiveFrom: initial.effectiveFrom ? tunisInput(initial.effectiveFrom) : '',
    effectiveTo: initial.effectiveTo ? tunisInput(initial.effectiveTo) : '',
    minRemaining: initial.minRemaining ?? '',
  });
  const [applied, setApplied] = useState(draft);
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  for (const [key, value] of Object.entries(applied)) {
    if (!value) continue;
    params.set(key, key === 'effectiveFrom' || key === 'effectiveTo' ? tunisInstant(value) : value);
  }
  const results = useResource<DirectoryPage>(`/api/v1/directory/groups?${params.toString()}`);
  return (
    <Workspace
      title="Production directory"
      description="Find declared production capacity by craft, region and period. Results are not reservations or feasibility guarantees."
    >
      <p>
        Figures are synthetic declared capacity. Hours and pieces stay separate. Unknown
        availability is withheld rather than shown as free capacity.
      </p>
      <ResourceState {...crafts} retry={crafts.reload} />
      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setApplied(draft);
        }}
      >
        <div className="settings-grid">
          <label className="field">
            Craft
            <select
              aria-label="Craft"
              value={draft.craft}
              onChange={(event) => setDraft({ ...draft, craft: event.target.value })}
            >
              <option value="">All crafts</option>
              {crafts.data?.items.map((craft) => (
                <option key={craft.id} value={craft.id}>
                  {craft.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Region
            <select
              aria-label="Region"
              value={draft.region}
              onChange={(event) => setDraft({ ...draft, region: event.target.value })}
            >
              <option value="">All regions</option>
              {regions.data?.items.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Capacity unit
            <select
              aria-label="Capacity unit"
              value={draft.unit}
              onChange={(event) => setDraft({ ...draft, unit: event.target.value })}
            >
              <option value="">All units</option>
              <option value="PIECES">Pieces</option>
              <option value="HOURS">Hours</option>
            </select>
          </label>
          <label className="field">
            Minimum known remaining
            <input
              aria-label="Minimum known remaining"
              value={draft.minRemaining}
              inputMode="decimal"
              onChange={(event) => setDraft({ ...draft, minRemaining: event.target.value })}
            />
          </label>
          <label className="field">
            Period start (Africa/Tunis)
            <input
              aria-label="Period start"
              type="datetime-local"
              value={draft.effectiveFrom}
              onChange={(event) => setDraft({ ...draft, effectiveFrom: event.target.value })}
            />
          </label>
          <label className="field">
            Period end (Africa/Tunis)
            <input
              aria-label="Period end"
              type="datetime-local"
              value={draft.effectiveTo}
              onChange={(event) => setDraft({ ...draft, effectiveTo: event.target.value })}
            />
          </label>
        </div>
        <Button type="submit">Search capacity</Button>{' '}
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            const empty = {
              craft: '',
              region: '',
              unit: '',
              effectiveFrom: '',
              effectiveTo: '',
              minRemaining: '',
            };
            setDraft(empty);
            setApplied(empty);
            setPage(1);
          }}
        >
          Clear filters
        </Button>
      </form>
      <ResourceState {...results} retry={results.reload} />
      {results.data && (
        <p role="status">
          {results.data.total} matching production {results.data.total === 1 ? 'group' : 'groups'}.
          {results.data.truncated ? ' The scan limit was reached; narrow the filters.' : ''}
        </p>
      )}
      {results.data?.items.length === 0 && (
        <p>No production groups match these filters. Try another craft, region or period.</p>
      )}
      <div className="record-list">
        {results.data?.items.map((group) => (
          <DirectoryCard key={group.id} group={group} />
        ))}
      </div>
      <Pagination data={results.data} page={page} change={setPage} />
    </Workspace>
  );
}
function DirectoryCard({ group }: { group: DirectoryGroupView }) {
  const unknown = !group.availabilityKnown;
  return (
    <article className="panel" aria-label={`${group.name} ${group.craftName}`}>
      <h2>
        <Link href={`/directory/${group.id}`}>{group.name}</Link>
      </h2>
      <p>
        {group.craftName} · {group.craftCategory} · {group.region}
      </p>
      <p>
        {dateLabel(group.effectiveFrom)} – {dateLabel(group.effectiveTo)} (Africa/Tunis)
      </p>
      <p className={unknown || group.deficit !== '0.00' ? 'notice capacity-warning' : undefined}>
        {stateLabel(group)}. {group.provenance.replaceAll('_', ' ').toLowerCase()}.
      </p>
      <dl className="settings-grid">
        {(
          [
            ['Declared', group.declared],
            ['Reserved', group.reserved],
            ['Committed', group.committed],
            ['Remaining', group.remaining],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{amount(value, group.unitType)}</dd>
          </div>
        ))}
      </dl>
      {group.constraints.length > 0 && <p>Constraints: {group.constraints.join(', ')}.</p>}
    </article>
  );
}
export function DirectoryGroup({ id }: { id: string }) {
  const resource = useResource<DirectoryDetail>(
    `/api/v1/directory/groups/${encodeURIComponent(id)}`,
  );
  const group = resource.data?.group;
  return (
    <Workspace
      title={group?.name ?? 'Production group'}
      description="Aggregate declared capacity for this production period. Search does not reserve work."
    >
      <p>
        <Link href="/directory">Back to directory</Link>
      </p>
      <ResourceState {...resource} retry={resource.reload} />
      {group && <DirectoryCard group={group} />}
      {resource.data && resource.data.contributors === null && (
        <p>Individual artisan records are not included in this discovery view.</p>
      )}
      {resource.data?.contributors && (
        <>
          <h2>Assigned artisan contributions</h2>
          <p>
            Only artisans assigned to you are listed. Open a record to update declared capacity.
          </p>
          <ul className="record-list">
            {resource.data.contributors.map((person) => (
              <Contributor key={person.artisanProfileId} person={person} />
            ))}
          </ul>
          {resource.data.contributors.length === 0 && <p>No assigned artisans in this group.</p>}
        </>
      )}
    </Workspace>
  );
}
function Contributor({ person }: { person: DirectoryContributorView }) {
  return (
    <li>
      <Link href={`/association/artisans/${person.artisanProfileId}`}>{person.displayName}</Link>
      {person.missingDeclaration ? (
        <p className="notice capacity-warning">No current declaration for this period.</p>
      ) : (
        <p>
          Declared {amount(person.declared, '')} · Reserved {amount(person.reserved, '')} ·
          Committed {amount(person.committed, '')} · Remaining {amount(person.remaining, '')}
          {person.deficit !== '0.00' ? ` · Deficit ${person.deficit}` : ''}
          {!person.availabilityKnown ? ' · Availability unknown' : ''}
        </p>
      )}
    </li>
  );
}
