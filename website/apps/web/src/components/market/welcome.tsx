'use client';
import { Building2, HandHeart } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import type { IdentityContext, OrganizationMembershipView } from '@nasj/contracts';
import { apiFetch } from '@/lib/api';
import { nasoujArt } from '../assistant/nasouj-assets';
import { Label } from '../ui/label';
import { Modal } from '../ui/modal';
import { Textarea } from '../ui/textarea';
import { ActionForm, Input, ResourceState, text, useResource } from '../workspace-ui';
import { FileField, chosenFile, pdfPayload } from './market-ui';
import styles from './market.module.css';

const proofHint =
  'A PDF showing you can act for this organization, like a mandate letter or a registration document with your name. Up to 4 MB.';

async function sendProof(organizationId: string, file: File) {
  await apiFetch('/api/v1/market/files', {
    method: 'POST',
    body: { purpose: 'ORG_PROOF', organizationId, ...(await pdfPayload(file)) },
  });
  await apiFetch(`/api/v1/organizations/${organizationId}/submit-approval`, {
    method: 'POST',
    body: {},
  });
}

export function Welcome() {
  const context = useResource<IdentityContext>('/api/v1/me/context');
  const [choice, setChoice] = useState<'BUYER_BUSINESS' | 'ASSOCIATION' | null>(null);
  const others = context.data?.organizations.filter((org) => org.type !== 'INTERNAL') ?? [];
  const own = others.find((org) => org.approvalStatus !== 'REJECTED') ?? others[0];
  const canApply = context.data && (!own || own.approvalStatus === 'REJECTED');
  return (
    <div className={styles.welcome}>
      <Image
        src={nasoujArt.poses.wave}
        alt="Nasouj, the NASJ assistant, waving"
        width={220}
        height={294}
        priority
      />
      <ResourceState {...context} retry={context.reload} />
      {canApply && (
        <>
          <h1>Welcome to NASJ</h1>
          <p>
            {own
              ? `We could not accept ${own.name}. Check your email for the reason, then apply again.`
              : 'Who are you joining us as?'}
          </p>
          <div className={styles.welcomeChoices}>
            <button type="button" onClick={() => setChoice('BUYER_BUSINESS')}>
              <Building2 size={28} aria-hidden="true" />
              <strong>Create a company</strong>
              <span>Order handmade gifts and products</span>
            </button>
            <button type="button" onClick={() => setChoice('ASSOCIATION')}>
              <HandHeart size={28} aria-hidden="true" />
              <strong>Create an association</strong>
              <span>Offer the crafts of the artisanes you work with</span>
            </button>
          </div>
        </>
      )}
      {own?.approvalStatus === 'DRAFT' && (
        <>
          <h1>Finish your application</h1>
          <p>Add your proof so we can review {own.name}.</p>
          <div className={`panel ${styles.welcomeForm}`}>
            <ActionForm
              label="Send application"
              successMessage="Your application was sent."
              onSuccess={context.reload}
              action={async (data) => {
                const proof = chosenFile(data, 'proof');
                if (!proof) throw new Error('Add your proof as a PDF.');
                await sendProof(own.id, proof);
              }}
            >
              <FileField
                name="proof"
                label="Proof that you represent it (PDF)"
                accept="application/pdf"
                required
                hint={proofHint}
              />
            </ActionForm>
          </div>
        </>
      )}
      {own?.approvalStatus === 'PENDING_REVIEW' && (
        <>
          <h1>Thank you, we received your application</h1>
          <p>Our team is checking {own.name}. We will email you as soon as you are accepted.</p>
        </>
      )}
      {own?.approvalStatus === 'SUSPENDED' && (
        <>
          <h1>{own.name} is suspended</h1>
          <p>Please contact the NASJ team.</p>
        </>
      )}
      <Modal
        open={choice !== null}
        onOpenChange={(open) => !open && setChoice(null)}
        title={choice === 'ASSOCIATION' ? 'Create your association' : 'Create your company'}
        description="Our team checks every application, then you are ready to start."
      >
        <ActionForm
          label="Send application"
          successMessage="Your application was sent."
          onSuccess={async () => {
            setChoice(null);
            await context.reload();
          }}
          action={async (data) => {
            const proof = chosenFile(data, 'proof');
            if (!proof) throw new Error('Add your proof as a PDF.');
            await pdfPayload(proof);
            const org = await apiFetch<OrganizationMembershipView>('/api/v1/organizations', {
              method: 'POST',
              body: {
                type: choice,
                name: text(data, 'name'),
                representativeName: text(data, 'representativeName'),
                country: 'TN',
                region: text(data, 'region'),
                description: text(data, 'description'),
                contactEmail: text(data, 'contactEmail'),
                contactPhone: text(data, 'contactPhone'),
              },
            });
            await sendProof(org.id, proof);
          }}
        >
          <Input
            name="name"
            label={choice === 'ASSOCIATION' ? 'Association name' : 'Company name'}
            required
          />
          <Input name="representativeName" label="Your full name" required />
          <Input name="region" label="Region" required />
          <Input name="contactEmail" label="Contact email" type="email" required />
          <Input name="contactPhone" label="Phone (optional)" type="tel" />
          <div className="field">
            <Label htmlFor="organization-description">What does it do?</Label>
            <Textarea id="organization-description" name="description" rows={3} required />
          </div>
          <FileField
            name="proof"
            label="Proof that you represent it (PDF)"
            accept="application/pdf"
            required
            hint={proofHint}
          />
        </ActionForm>
      </Modal>
    </div>
  );
}
