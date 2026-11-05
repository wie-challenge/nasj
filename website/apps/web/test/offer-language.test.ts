import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offerCopy, offerDirection, offerLanguage } from '../src/lib/offer-language';
test('offer locale fallback is deterministic and Arabic alone uses RTL', () => {
  for (const value of [null, undefined, 'de', '', '<script>', 'en'])
    assert.equal(offerLanguage(value), 'en');
  assert.equal(offerLanguage('fr'), 'fr');
  assert.equal(offerLanguage('ar'), 'ar');
  assert.equal(offerDirection('en'), 'ltr');
  assert.equal(offerDirection('fr'), 'ltr');
  assert.equal(offerDirection('ar'), 'rtl');
});
test('supported offer interface copies are complete and do not omit the commercial translation gate', () => {
  for (const language of ['en', 'fr', 'ar'] as const) {
    assert.deepEqual(Object.keys(offerCopy[language]).sort(), Object.keys(offerCopy.en).sort());
    for (const value of Object.values(offerCopy[language])) assert.ok(value.trim().length > 0);
    assert.ok(offerCopy[language].translation.length > 100);
  }
});
