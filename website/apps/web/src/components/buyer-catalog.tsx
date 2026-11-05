'use client';
import { useState, useId, type ReactNode } from 'react';
import Image from 'next/image';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { NativeSelect } from './ui/native-select';
import { Badge } from './ui/badge';
import { Label } from './ui/label';
import Link from 'next/link';
import type { BuyerCatalog, CatalogExample } from '@nasj/contracts';
import { ResourceState, Workspace, useResource } from './workspace-ui';

function ExampleImage({ image }: { image: CatalogExample['image'] }) {
  const [failed, setFailed] = useState(false);
  return image && !failed ? (
    <Image
      className="catalog-image"
      src={image.src}
      alt={image.alt}
      width={480}
      height={280}
      unoptimized
      onError={() => setFailed(true)}
    />
  ) : (
    <p className="catalog-image catalog-image-fallback">
      No example image available. Use the specification below.
    </p>
  );
}

export function BuyerCraftCatalog() {
  const resource = useResource<BuyerCatalog>('/api/v1/commerce/catalog');
  const [category, setCategory] = useState('');
  const categoryId = useId();
  const categories = resource.data?.categories.filter((c) => !category || c.id === category) ?? [];
  return (
    <Workspace
      title="Craft and example catalog"
      description="Explore fictional craft examples to prepare a buyer request. Every example is synthetic: no stock, price, capacity or delivery date is confirmed."
    >
      <p>
        <Link href="/commerce/buyer">Your buyer requests</Link>
      </p>
      <ResourceState {...resource} retry={resource.reload} />
      {resource.data && (
        <>
          <div className="field catalog-filter">
            <Label htmlFor={categoryId}>Browse craft</Label>
            <NativeSelect
              id={categoryId}
              aria-label="Browse craft"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">All crafts</option>
              {resource.data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <p className="hint">
            Illustrations are fictional designs, not photographs of verified products. Lead times
            are planning assumptions, not promises.
          </p>
          {!categories.length && (
            <p>No craft categories are available. Please check again later.</p>
          )}
          <div className="catalog-categories">
            {categories.map((c) => (
              <section key={c.id} aria-labelledby={`catalog-${c.id}`} className="section-gap">
                <h2 id={`catalog-${c.id}`}>{c.name}</h2>
                <p>{c.specificationSummary || 'Specifications must be agreed for each request.'}</p>
                {!c.examples.length ? (
                  <p>No examples are available in this category yet.</p>
                ) : (
                  <div className="catalog-grid">
                    {c.examples.map((example) => (
                      <Card
                        role="article"
                        key={example.id}
                        className="panel catalog-card block gap-0 p-4"
                        aria-label={example.name}
                      >
                        <ExampleImage image={example.image} />
                        <Badge variant="secondary">
                          Synthetic example ·{' '}
                          {example.availability === 'UNAVAILABLE'
                            ? 'Unavailable'
                            : 'Illustrative only'}
                        </Badge>
                        <h3>{example.name}</h3>
                        <p>{example.specification}</p>
                        <p>Unit: piece</p>
                        <p>
                          <strong>
                            Indicative lead time: {example.leadTime.minDays}–
                            {example.leadTime.maxDays} days
                          </strong>
                        </p>
                        <details className="catalog-assumptions">
                          <summary>Planning assumptions</summary>
                          <p>{example.leadTime.assumption}</p>
                        </details>
                        {example.availability === 'UNAVAILABLE' ? (
                          <p>{example.unavailableReason}</p>
                        ) : (
                          <Button
                            asChild
                            variant="outline"
                            className="catalog-start h-auto min-h-10 w-full whitespace-normal text-xs leading-relaxed"
                          >
                            <Link
                              href={`/commerce/buyer?example=${encodeURIComponent(example.id)}`}
                            >
                              Start RFQ for {example.name}
                            </Link>
                          </Button>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </Workspace>
  );
}

/** Query strings carry only a fixture ID. Resolve current server data before showing a form. */
export function CatalogRequestSelection({
  id,
  children,
}: {
  id: string;
  children: (example: CatalogExample) => ReactNode;
}) {
  const resource = useResource<BuyerCatalog>('/api/v1/commerce/catalog');
  const example = resource.data?.categories.flatMap((c) => c.examples).find((e) => e.id === id);
  return (
    <>
      <ResourceState {...resource} retry={resource.reload} />
      {resource.data &&
        (example?.availability === 'ILLUSTRATIVE' ? (
          <>
            <p className="notice">
              Starting from synthetic example: {example.name}. Review the specifications and confirm
              your quantity, destination and future deadline. This is not a stock reservation or
              supply commitment.
            </p>
            {children(example)}
          </>
        ) : (
          <p className="notice" role="alert">
            This catalog example is unavailable or no longer active.{' '}
            <Link href="/commerce/catalog">Choose another example</Link> or{' '}
            <Link href="/commerce/buyer">start a request without an example</Link>.
          </p>
        ))}
    </>
  );
}
