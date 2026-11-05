'use client';
import { Pagination } from './governance';
import { CapacityWorkspace } from './capacity-workspace';
import Link from 'next/link';
import { useState } from 'react';
import type {
  Page as DataPage,
  ArtisanProfileView,
  CraftSkillView,
  ArtisanSkillView,
  CapacityDeclarationView,
  AssociationMembershipView,
  DelegationGrantView,
} from '@nasj/contracts';
import { apiFetch } from '@/lib/api';
import {
  Workspace,
  ResourceState,
  ActionForm,
  Input,
  Select,
  Checkboxes,
  useResource,
  text,
  humanize,
} from './workspace-ui';
type Items<T> = { items: T[] };
type Assisted = {
  id: string;
  displayName: string;
  organizationId: string;
  scopes: string[];
  expiresAt: string;
};
const profileFields = ['displayName', 'region', 'contactPhone', 'experienceDescription'] as const;
const profileLabels = {
  displayName: 'Display name',
  region: 'Region',
  contactPhone: 'Contact phone',
  experienceDescription: 'Experience and biography',
};
export function ArtisanWorkspace({ artisanId }: { artisanId?: string }) {
  const [skillsVersion, setSkillsVersion] = useState(0);
  const [associationVersion, setAssociationVersion] = useState(0);
  const path = artisanId
    ? `/api/v1/artisans/${encodeURIComponent(artisanId)}`
    : '/api/v1/artisans/me';
  const resource = useResource<ArtisanProfileView>(path);
  const grants = useResource<Items<Assisted>>('/api/v1/artisans/assisted');
  const scopes =
    grants.data?.items.filter((grant) => grant.id === artisanId).flatMap((grant) => grant.scopes) ??
    [];
  const can = (permission: string) => !artisanId || scopes.includes(permission);
  const profile = resource.data;
  return (
    <Workspace
      title={artisanId ? 'Assisted artisan workspace.' : 'Your artisan workspace.'}
      description="Share your skills and voluntary capacity. Participation through an association is optional."
    >
      <nav className="workspace-tabs" aria-label="Artisan sections">
        {['profile', 'skills', 'capacity', 'associations', 'delegations'].map((section) => (
          <a key={section} href={`#${section}`}>
            {humanize(section)}
          </a>
        ))}
      </nav>
      {resource.loading && <p role="status">Loading artisan profile…</p>}
      {resource.error && (
        <p className="notice" role="status">
          {resource.error}{' '}
          {artisanId
            ? 'Ask the artisan to review your delegation.'
            : 'If you have not created a profile, complete the form below.'}
        </p>
      )}
      <div className="settings-grid">
        <section className="panel" id="profile">
          <h2>Artisan profile</h2>
          {can('artisan.profile.update') && !resource.loading && (!artisanId || profile) ? (
            <ActionForm
              key={profile?.updatedAt ?? 'new'}
              label="Save artisan profile"
              onSuccess={resource.reload}
              action={(data) =>
                apiFetch(path, {
                  method: 'PATCH',
                  body: {
                    ...Object.fromEntries(profileFields.map((name) => [name, text(data, name)])),
                    preferredLanguage: text(data, 'preferredLanguage'),
                    availabilityStatus: text(data, 'availabilityStatus'),
                    equipment: text(data, 'equipment')
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean),
                    ...(!artisanId ? { contactVisibility: text(data, 'contactVisibility') } : {}),
                    ...(!profile && !artisanId
                      ? {
                          processingConsent: data.has('processingConsent'),
                          policyVersion: 'artisan-profile-v1',
                        }
                      : {}),
                  },
                })
              }
            >
              {profileFields.map((name) => (
                <Input
                  key={name}
                  name={name}
                  label={profileLabels[name]}
                  value={profile?.[name]}
                  required={name === 'displayName' || name === 'region'}
                />
              ))}
              <Select
                name="preferredLanguage"
                label="Preferred language"
                value={profile?.preferredLanguage ?? 'fr'}
                options={[
                  { value: 'fr', label: 'Français' },
                  { value: 'ar', label: 'العربية' },
                  { value: 'en', label: 'English' },
                ]}
              />
              {!artisanId && (
                <Select
                  name="contactVisibility"
                  label="Contact visibility"
                  value={profile?.contactVisibility ?? 'PRIVATE'}
                  options={['PRIVATE', 'ASSOCIATION', 'PUBLIC']}
                />
              )}
              <Select
                name="availabilityStatus"
                label="Availability for new opportunities"
                value={profile?.availabilityStatus ?? 'AVAILABLE'}
                options={['AVAILABLE', 'PAUSED']}
              />
              <Input
                name="equipment"
                label="Equipment (separate items with commas)"
                value={profile?.equipment.join(', ')}
              />
              {!profile && !artisanId && (
                <label className="check-label">
                  <input name="processingConsent" type="checkbox" required />I consent to processing
                  this artisan profile for participation in NASJ (artisan-profile-v1).
                </label>
              )}
              <p className="hint">
                Language records your preference. Offer review supports English, French and Arabic
                interface copy; approved translated commercial terms remain unavailable. Pausing new
                opportunities preserves existing commitments.
              </p>
            </ActionForm>
          ) : (
            profile && (
              <>
                <p>
                  {profile.displayName} · {profile.region}
                </p>
                <p>{profile.experienceDescription}</p>
                <p>{humanize(profile.availabilityStatus)}</p>
              </>
            )
          )}
        </section>
        {!artisanId && (
          <section className="panel">
            <h2>Assistance you can provide</h2>
            <ResourceState {...grants} retry={grants.reload} />
            <p>Only current, explicit delegation grants appear here.</p>
            <ul className="record-list">
              {grants.data?.items.map((grant) => (
                <li key={`${grant.id}-${grant.organizationId}-${grant.expiresAt}`}>
                  <Link href={`/artisan/assisted/${grant.id}`}>{grant.displayName}</Link>
                  <p>{grant.scopes.join(', ')}</p>
                </li>
              ))}
            </ul>
            {grants.data?.items.length === 0 && <p>No active assisted profiles.</p>}
          </section>
        )}
        {profile && (
          <>
            {can('artisan.skills.manage') && (
              <section className="panel wide" id="skills">
                <Skills path={path} onChanged={() => setSkillsVersion((value) => value + 1)} />
              </section>
            )}
            {can('artisan.capacity.read') && (
              <section className="panel wide" id="capacity">
                <Capacity
                  key={skillsVersion}
                  path={path}
                  canUpdate={can('artisan.capacity.update')}
                />
              </section>
            )}
            {!artisanId && (
              <>
                <section className="panel wide" id="associations">
                  <Associations
                    path={path}
                    onChanged={() => setAssociationVersion((value) => value + 1)}
                  />
                </section>
                <section className="panel wide" id="delegations">
                  <Delegations key={associationVersion} path={path} />
                </section>
              </>
            )}
          </>
        )}
      </div>
    </Workspace>
  );
}
function Skills({ path, onChanged }: { path: string; onChanged: () => void }) {
  const catalog = useResource<Items<CraftSkillView>>('/api/v1/craft-skills');
  const selected = useResource<Items<ArtisanSkillView>>(`${path}/skills`);
  return (
    <>
      <h2>Craft skills</h2>
      <ResourceState {...catalog} retry={catalog.reload} />
      <ResourceState {...selected} retry={selected.reload} />
      {catalog.data && selected.data && (
        <ActionForm
          key={JSON.stringify(selected.data)}
          label="Save craft skills"
          onSuccess={async () => {
            await selected.reload();
            onChanged();
          }}
          action={(data) =>
            apiFetch(`${path}/skills`, {
              method: 'PUT',
              body: {
                items: data.getAll('skills').map((value) => ({
                  craftSkillId: String(value),
                  proficiency: text(data, `proficiency-${value}`),
                  evidence: text(data, `evidence-${value}`),
                })),
              },
            })
          }
        >
          <div className="skill-grid">
            {catalog.data.items.map((skill) => {
              const current = selected.data?.items.find((item) => item.craftSkillId === skill.id);
              return (
                <div key={skill.id}>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      name="skills"
                      value={skill.id}
                      defaultChecked={Boolean(current)}
                    />
                    {skill.name}
                  </label>
                  <Select
                    name={`proficiency-${skill.id}`}
                    label={`${skill.name} proficiency`}
                    value={current?.proficiency ?? 'INTERMEDIATE'}
                    options={['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']}
                  />
                  <Input
                    name={`evidence-${skill.id}`}
                    label={`${skill.name} experience or evidence`}
                    value={current?.evidence}
                  />
                </div>
              );
            })}
          </div>
        </ActionForm>
      )}
      {catalog.data?.items.length === 0 && <p>No craft skills are available yet.</p>}
    </>
  );
}
function Capacity({ path, canUpdate }: { path: string; canUpdate: boolean }) {
  const [page, setPage] = useState(1);
  const history = useResource<DataPage<CapacityDeclarationView>>(
    `${path}/capacity?page=${page}&pageSize=100`,
  );
  const skills = useResource<Items<ArtisanSkillView>>(`${path}/skills`);
  return (
    <>
      <ResourceState {...history} retry={history.reload} />
      <ResourceState {...skills} retry={skills.reload} />
      {history.data && skills.data && (
        <CapacityWorkspace
          key={`${path}-${page}`}
          rows={history.data.items}
          skills={skills.data.items}
          path={path}
          reload={history.reload}
          canUpdate={canUpdate}
        />
      )}
      <Pagination data={history.data} page={page} change={setPage} />
    </>
  );
}
function Associations({ path, onChanged }: { path: string; onChanged: () => void }) {
  const links = useResource<Items<AssociationMembershipView>>(`${path}/associations`);
  const catalog = useResource<Items<{ id: string; name: string }>>(
    '/api/v1/artisans/associations/catalog',
  );
  return (
    <>
      <h2>Association relationships</h2>
      <p>
        You can work independently. Linking an association does not grant access to your profile;
        assistance requires a separate delegation.
      </p>
      <ResourceState {...links} retry={links.reload} />
      <ResourceState {...catalog} retry={catalog.reload} />
      {catalog.data?.items.length ? (
        <ActionForm
          label="Link association"
          onSuccess={async () => {
            await links.reload();
            onChanged();
          }}
          action={(data) =>
            apiFetch(`${path}/associations`, {
              method: 'POST',
              body: {
                organizationId: text(data, 'organizationId'),
                policyVersion: 'association-v1',
                consent: data.has('consent'),
              },
            })
          }
        >
          <Select
            name="organizationId"
            label="Approved association"
            options={catalog.data.items.map((item) => ({ value: item.id, label: item.name }))}
          />
          <label className="check-label">
            <input type="checkbox" name="consent" required />I consent to recording this association
            relationship (association-v1).
          </label>
        </ActionForm>
      ) : (
        catalog.data && <p>No approved associations are available yet.</p>
      )}
      <ul className="record-list">
        {links.data?.items.map((link) => (
          <li key={link.id}>
            <strong>{link.organizationName}</strong>
            <p>{humanize(link.status)}</p>
            {link.status === 'ACTIVE' && (
              <ActionForm
                label="End relationship"
                confirm="End this association relationship? Associated delegations will be revoked."
                onSuccess={async () => {
                  await links.reload();
                  onChanged();
                }}
                action={() => apiFetch(`${path}/associations/${link.id}`, { method: 'DELETE' })}
              />
            )}
          </li>
        ))}
      </ul>
      {links.data?.items.length === 0 && <p>You are participating independently.</p>}
    </>
  );
}
function Delegations({ path }: { path: string }) {
  const resource = useResource<Items<DelegationGrantView>>(`${path}/delegations`);
  const associations = useResource<Items<AssociationMembershipView>>(`${path}/associations`);
  const [association, setAssociation] = useState('');
  const active = associations.data?.items.filter((link) => link.status === 'ACTIVE') ?? [];
  return (
    <>
      <h2>Limited assistance permissions</h2>
      <p>
        Grant selected actions to an association coordinator until an expiry date. You can revoke
        access at any time.
      </p>
      <ResourceState {...resource} retry={resource.reload} />
      <label className="field">
        <span className="label">Association for delegation</span>
        <select
          aria-label="Association for delegation"
          value={association}
          onChange={(event) => setAssociation(event.target.value)}
        >
          <option value="">Choose an association</option>
          {active.map((link) => (
            <option key={link.id} value={link.id}>
              {link.organizationName}
            </option>
          ))}
        </select>
      </label>
      {association && (
        <GrantDelegation
          key={association}
          path={path}
          association={active.find((link) => link.id === association)!}
          reload={resource.reload}
        />
      )}
      <ul className="record-list">
        {resource.data?.items.map((grant) => (
          <li key={grant.id}>
            <strong>Coordinator {grant.delegateName ?? grant.delegateUserId}</strong>
            <p>
              {grant.scopes.join(', ')} · {humanize(grant.status)}
            </p>
            <p>Expires {new Date(grant.expiresAt).toLocaleString()}</p>
            {grant.status === 'ACTIVE' && (
              <ActionForm
                label="Revoke delegation"
                confirm="Revoke this coordinator’s assistance access immediately?"
                onSuccess={resource.reload}
                action={() => apiFetch(`${path}/delegations/${grant.id}`, { method: 'DELETE' })}
              />
            )}
          </li>
        ))}
      </ul>
      {resource.data?.items.length === 0 && <p>No assistance permissions granted.</p>}
    </>
  );
}
function GrantDelegation({
  path,
  association,
  reload,
}: {
  path: string;
  association: AssociationMembershipView;
  reload: () => unknown;
}) {
  const coordinators = useResource<Items<{ id: string; name: string }>>(
    `${path}/associations/${association.id}/coordinators`,
  );
  return (
    <>
      <ResourceState {...coordinators} retry={coordinators.reload} />
      {coordinators.data?.items.length ? (
        <ActionForm
          label="Grant limited assistance"
          onSuccess={reload}
          action={(data) =>
            apiFetch(`${path}/delegations`, {
              method: 'POST',
              body: {
                organizationId: association.organizationId,
                delegateUserId: text(data, 'delegateUserId'),
                scopes: data.getAll('scopes'),
                expiresAt: new Date(text(data, 'expiresAt')).toISOString(),
                policyVersion: 'delegation-v1',
                consent: data.has('consent'),
              },
            })
          }
        >
          <Select
            name="delegateUserId"
            label="Coordinator"
            options={coordinators.data.items.map((item) => ({ value: item.id, label: item.name }))}
          />
          <Checkboxes
            name="scopes"
            options={[
              'artisan.profile.read',
              'artisan.profile.update',
              'artisan.skills.manage',
              'artisan.capacity.read',
              'artisan.capacity.update',
            ]}
          />
          <Input name="expiresAt" label="Assistance expires" type="datetime-local" required />
          <label className="check-label">
            <input type="checkbox" name="consent" required />I authorize only the selected actions
            until expiry (delegation-v1).
          </label>
        </ActionForm>
      ) : (
        coordinators.data && <p>This association has no eligible coordinators.</p>
      )}
    </>
  );
}

export function AssistedArtisans() {
  const resource = useResource<Items<Assisted>>('/api/v1/artisans/assisted');
  return (
    <Workspace
      title="Assisted artisans."
      description="Only artisans with a current, explicit delegation appear in this workspace."
    >
      <ResourceState {...resource} retry={resource.reload} />
      <section className="panel">
        <ul className="record-list">
          {resource.data?.items.map((grant) => (
            <li key={`${grant.id}-${grant.organizationId}-${grant.expiresAt}`}>
              <Link href={`/artisan/assisted/${grant.id}`}>{grant.displayName}</Link>
              <p>{grant.scopes.join(', ')}</p>
              <p>Expires {new Date(grant.expiresAt).toLocaleString()}</p>
            </li>
          ))}
        </ul>
        {resource.data?.items.length === 0 && <p>No active assistance delegations.</p>}
      </section>
    </Workspace>
  );
}
