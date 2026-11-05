'use client';
import { ResourceState, useResource, humanize } from './workspace-ui';
type Summary = {
  organizationId: string;
  purpose: string;
  timezone: string;
  asOf: string;
  population: number;
  missingDeclarationCount: number;
  items: {
    craftSkillId: string;
    unit: string;
    periodFrom: string;
    periodTo: string;
    memberCount: number;
    declared: string;
    reserved: string;
    committed: string;
    free: string | null;
    availabilityKnown: boolean;
  }[];
  limitations: string[];
};
export function AssociationCapacitySummary({ organizationId }: { organizationId: string }) {
  const resource = useResource<Summary>(
    `/api/v1/associations/${encodeURIComponent(organizationId)}/capacity`,
  );
  const data = resource.data;
  const date = (value: string) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Tunis', dateStyle: 'medium' }).format(
      new Date(value),
    );
  return (
    <section aria-labelledby="delegated-association-capacity">
      <h2 id="delegated-association-capacity">Delegated association capacity</h2>
      <p>
        Only members who explicitly share capacity with this association contribute. Declared
        capacity, temporary reservations and accepted commitments remain separate. This view creates
        no reservation.
      </p>
      <ResourceState loading={resource.loading} error={resource.error} retry={resource.reload} />
      {data && (
        <>
          <p>
            {data.population} consenting members; {data.missingDeclarationCount} without a current
            declaration. Dates use {data.timezone}. Evaluated {date(data.asOf)}.
          </p>
          {!data.items.length && (
            <p role="status">No current capacity has been shared with this association.</p>
          )}
          <div className="grid gap-4">
            {data.items.map((item) => (
              <article
                className="panel p-4"
                key={`${item.craftSkillId}:${item.unit}:${item.periodFrom}:${item.periodTo}`}
              >
                <h3>
                  {humanize(item.craftSkillId)} · {humanize(item.unit)}
                </h3>
                <p>
                  {date(item.periodFrom)} – {date(item.periodTo)} · {item.memberCount} members
                </p>
                <dl>
                  <dt>Declared</dt>
                  <dd>{item.declared}</dd>
                  <dt>Reserved</dt>
                  <dd>{item.reserved}</dd>
                  <dt>Committed</dt>
                  <dd>{item.committed}</dd>
                  <dt>Free</dt>
                  <dd>
                    {item.availabilityKnown && item.free !== null
                      ? item.free
                      : 'Unknown; current evidence is incomplete'}
                  </dd>
                </dl>
              </article>
            ))}
          </div>
          <ul>
            {data.limitations.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <button type="button" onClick={resource.reload}>
            Refresh shared capacity
          </button>
        </>
      )}
    </section>
  );
}
