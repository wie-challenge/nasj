import Image from 'next/image';
import Link from 'next/link';
import { Weave, Wordmark } from '@/components/brand';
import { nasoujArt } from '@/components/assistant/nasouj-assets';
import { LandingMotion } from '@/components/landing/landing-motion';
import { LandingNasouj } from '@/components/landing/landing-nasouj';
import styles from './landing.module.css';

const people = [
  {
    title: 'Companies',
    text: 'Source employee gifts, event gifts and CSR projects that mean something, and see the full quotation before you commit.',
  },
  {
    title: 'NASJ, the connector',
    text: 'Plans capacity, prepares costed offers and follows quality and delivery for every order.',
  },
  {
    title: 'Associations and cooperatives',
    text: 'Bring each request to their artisans and support them, within consent and permissions.',
  },
  {
    title: 'Artisanes',
    text: 'Receive requests through their association and decide for themselves which work to take on.',
  },
];
const crafts = [
  {
    name: 'Embroidery',
    text: 'Our starting craft, and the first production journey NASJ is built around.',
  },
  { name: 'Textile weaving', text: 'Patterned textiles, the craft our name comes from.' },
  { name: 'Basket making', text: 'Natural fibers, shaped by hand.' },
  { name: 'Pottery', text: 'Handmade ceramics.' },
  { name: 'Other crafts', text: 'More crafts will join as the network grows.' },
];
export default function Home() {
  return (
    <div className={styles.page} data-landing>
      <LandingMotion activeClass={styles.motionOn} />
      <header className={styles.bar}>
        <Wordmark />
        <nav aria-label="Main">
          <a href="#how">How it works</a>
          <a href="#nasouj">Nasouj</a>
          <a href="#crafts">Crafts</a>
        </nav>
        <div className={styles.barActions}>
          <Link href="/auth/login">Sign in</Link>
          <Link className={styles.btnSmall} href="/auth/register">
            Get started
          </Link>
        </div>
      </header>

      <main id="main-content">
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <h1>
              Meaningful gifts.
              <br />
              Greater impact.
            </h1>
            <p className={styles.lead}>
              NASJ connects companies with rural women artisans and the associations and
              cooperatives that support them, turning employee gifts, event gifts and CSR budgets
              into work and visibility for handmade craft.
            </p>
            <div className={styles.actions}>
              <Link className={styles.btn} href="/catalog">
                Browse the catalog
              </Link>
              <Link className={styles.textLink} href="/auth/register">
                Create an account
              </Link>
            </div>
          </div>
          <div className={styles.arch}>
            <Image
              src="/brand/artisan-weaving.jpg"
              alt="Hands weaving a patterned textile"
              width={685}
              height={753}
              fetchPriority="high"
              sizes="(max-width: 750px) 90vw, 42vw"
            />
          </div>
        </section>
        <Weave />

        <section id="how" className={styles.how} aria-labelledby="how-title">
          <h2 id="how-title" className={`${styles.heading} ${styles.frame}`} data-reveal>
            From a brief to a delivered gift.
          </h2>
          <div className={styles.weaveGrid}>
            <article className={`${styles.step} ${styles.stepDeep}`} data-reveal>
              <h3>Share your brief</h3>
              <p>
                Tell NASJ the product, the quantity and the delivery date your gifts need, then
                review a clear quotation in Tunisian dinars.
              </p>
            </article>
            <div className={styles.stepPicture} data-reveal>
              <Image
                src="/landing/workshop.jpg"
                alt="A workshop with embroidered fabric on a wooden table"
                width={1400}
                height={1864}
                sizes="(max-width: 750px) 100vw, 30vw"
                loading="lazy"
              />
            </div>
            <article className={`${styles.step} ${styles.stepTerracotta}`} data-reveal>
              <h3>Artisans choose</h3>
              <p>
                Associations bring each request to their artisanes. Every woman hears the work, the
                pay and the terms, then decides for herself.
              </p>
            </article>
            <div className={`${styles.stepPicture} ${styles.stepPictureWide}`} data-reveal>
              <Image
                src="/landing/embroidery.jpg"
                alt="A hand stitching gold thread onto fabric"
                width={1800}
                height={1197}
                sizes="(max-width: 750px) 100vw, 42vw"
                loading="lazy"
              />
            </div>
            <article className={`${styles.step} ${styles.stepGreen}`} data-reveal>
              <h3>Made by hand</h3>
              <p>
                Production, quality checks and material handovers are recorded from the workshop to
                the shipment.
              </p>
            </article>
            <article className={`${styles.step} ${styles.stepGold}`} data-reveal>
              <h3>Delivered</h3>
              <p>You confirm what arrived, and a QR page tells the story behind each piece.</p>
            </article>
          </div>
        </section>

        <section className={styles.people} aria-labelledby="people-title">
          <div className={`${styles.frame} ${styles.peopleGrid}`}>
            <div data-reveal>
              <h2 id="people-title" className={styles.heading}>
                One order, woven through three communities.
              </h2>
              <p className={styles.peopleIntro}>
                NASJ isn’t about donating money or buying generic merchandise. It turns the
                purchasing companies already do into practical work for women artisans.
              </p>
            </div>
            <div className={styles.peopleList}>
              {people.map((person) => (
                <article key={person.title} data-reveal>
                  <h3>{person.title}</h3>
                  <p>{person.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="nasouj" className={styles.nasouj} aria-labelledby="nasouj-title">
          <div className={styles.frame}>
            <div className={styles.nasoujHead} data-reveal>
              <h2 id="nasouj-title" className={styles.heading}>
                Meet Nasouj
              </h2>
              <p className={styles.nasoujArabic} lang="ar" dir="rtl">
                نسوج
              </p>
            </div>
            <p className={styles.lead} data-reveal>
              Your guide inside NASJ. Pick who you are and see how Nasouj helps with your next step.
            </p>
            <LandingNasouj />
          </div>
        </section>

        <section id="crafts" className={styles.crafts} aria-labelledby="crafts-title">
          <div className={`${styles.frame} ${styles.craftsGrid}`}>
            <div>
              <h2 id="crafts-title" className={styles.heading} data-reveal>
                Crafts your team will keep.
              </h2>
              <div className={styles.bars}>
                {crafts.map((craft, index) => (
                  <details key={craft.name} className={styles.barRow} open={index === 0}>
                    <summary>{craft.name}</summary>
                    <p>{craft.text}</p>
                  </details>
                ))}
              </div>
            </div>
            <div className={styles.craftsPicture} data-reveal>
              <Image
                src="/landing/nasj-gifting.jpg"
                alt="A NASJ tote bag, a woven basket and a printed NASJ card on a sunlit table"
                width={960}
                height={1024}
                sizes="(max-width: 750px) 100vw, 40vw"
                loading="lazy"
              />
            </div>
          </div>
        </section>

        <section className={styles.cta} aria-labelledby="cta-title">
          <div className={`${styles.frame} ${styles.ctaInner}`}>
            <div>
              <h2 id="cta-title" className={styles.heading}>
                See how NASJ works.
              </h2>
              <p>
                NASJ is a working prototype, shown with fictional organizations and sample data.
              </p>
            </div>
            <Link className={styles.btnGold} href="/catalog">
              Browse the catalog
            </Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <Weave />
        <div className={`${styles.frame} ${styles.footerInner}`}>
          <div className={styles.footerBrand}>
            <Image src={nasoujArt.avatar} alt="" width={64} height={64} loading="lazy" />
            <p>
              Weaving Connections. Creating Impact. <span lang="ar">نسج</span>
            </p>
          </div>
          <nav aria-label="Footer">
            <a href="#how">How it works</a>
            <a href="#nasouj">Nasouj</a>
            <a href="#crafts">Crafts</a>
            <Link href="/catalog">Catalog</Link>
            <Link href="/auth/login">Sign in</Link>
            <Link href="/auth/register">Create an account</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
