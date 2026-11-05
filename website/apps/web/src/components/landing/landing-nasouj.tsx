'use client';
import { useState } from 'react';
import Image from 'next/image';
import { nasoujArt } from '@/components/assistant/nasouj-assets';
import {
  nasoujTopics,
  type NasoujLocale,
  type NasoujRole,
} from '@/components/assistant/nasouj-demo-replies';
import styles from '@/app/landing.module.css';

const roles: { id: NasoujRole; label: string; pose: string }[] = [
  { id: 'buyer', label: 'Company', pose: nasoujArt.poses.wave },
  { id: 'association', label: 'Association', pose: nasoujArt.poses.celebrate },
  { id: 'coordinator', label: 'NASJ team', pose: nasoujArt.poses.wink },
];
const locales: { id: NasoujLocale; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'fr', label: 'Français' },
  { id: 'ar', label: 'العربية' },
];

export function LandingNasouj() {
  const [role, setRole] = useState<NasoujRole>('buyer');
  const [locale, setLocale] = useState<NasoujLocale>('en');
  const active = roles.find((item) => item.id === role) ?? roles[0];
  const topic = nasoujTopics[role][0];
  return (
    <div className={styles.nasoujLive}>
      <Image
        key={active.pose}
        className={styles.nasoujPose}
        src={active.pose}
        alt="Nasouj, a plush woven robot wearing a green scarf"
        width={437}
        height={584}
      />
      <div className={styles.nasoujChat} data-ui>
        <fieldset className={styles.choice}>
          <legend>I am a</legend>
          <div>
            {roles.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={role === item.id}
                onClick={() => setRole(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className={styles.choice}>
          <legend>Nasouj answers in</legend>
          <div>
            {locales.map((item) => (
              <button
                key={item.id}
                type="button"
                lang={item.id}
                aria-pressed={locale === item.id}
                onClick={() => setLocale(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div
          className={styles.nasoujAnswer}
          aria-live="polite"
          lang={locale}
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
        >
          <p className={styles.nasoujQuestion}>{topic.question[locale]}</p>
          <p>{topic.answer[locale]}</p>
        </div>
      </div>
    </div>
  );
}
