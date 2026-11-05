import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');
const report = await read('docs/competition/PHASE1_TECHNICAL_REPORT.md');
const storyboard = await read('docs/competition/PHASE1_VIDEO_STORYBOARD.md');
const abstract = report.split('## Abstract\n')[1]?.split('**Keywords:**')[0]?.trim();
assert.ok(abstract, 'An abstract is required.');
const words = abstract.split(/\s+/).length;
assert.ok(words >= 150 && words <= 250, `Abstract must have 150–250 words; found ${words}.`);
const keywords = report.match(/\*\*Keywords:\*\* ([^\n]+)/)?.[1].split(';');
assert.ok(keywords && keywords.length >= 3 && keywords.length <= 6, 'Use 3–6 keywords.');
for (const heading of [
  'Abstract',
  'Introduction',
  'Related Work',
  'Methodology / Materials and Methods',
  'Results and Discussion',
  'Conclusion and Future Work',
  'References',
]) {
  assert.ok(report.includes(`## ${heading}\n`), `Required heading missing: ${heading}`);
}
for (let i = 1; i <= 9; i++) assert.ok(report.includes(`[R${i}]`), `Reference R${i} missing.`);
const durations = [...storyboard.matchAll(/; (\d+) seconds\)/g)].map((m) => Number(m[1]));
assert.equal(durations.length, 7);
assert.equal(
  durations.reduce((sum, n) => sum + n, 0),
  180,
);
const pdfPath = 'output/pdf/PHASE1_TECHNICAL_REPORT.pdf';
const videoPath = 'output/video/PHASE1_PROGRESS_REVIEW.mp4';
const pdf = JSON.parse(
  execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' })
    .split('\n')
    .reduce((json, line) => {
      const match = line.match(/^Pages:\s+(\d+)/);
      return match ? JSON.stringify({ pages: Number(match[1]) }) : json;
    }, '{}'),
) as { pages: number };
assert.ok(pdf.pages > 0 && pdf.pages <= 6, 'Report exceeds the official page limit.');
const media = JSON.parse(
  execFileSync(
    'ffprobe',
    ['-v', 'quiet', '-show_format', '-show_streams', '-of', 'json', videoPath],
    { encoding: 'utf8' },
  ),
);
assert.ok(
  Math.abs(Number(media.format.duration) - 180) < 0.25,
  'Actual video must be approximately three minutes.',
);
assert.ok(
  media.streams.some((stream: { codec_type: string }) => stream.codec_type === 'audio'),
  'Narrated audio stream required.',
);
assert.ok(
  media.streams.some(
    (stream: { codec_type: string; width: number; height: number }) =>
      stream.codec_type === 'video' && stream.width >= 1280 && stream.height >= 720,
  ),
);
const validation = JSON.parse(
  await read('docs/engineering/evidence/batch7-20261027/artifact-validation.json'),
);
for (const [key, path] of [
  ['pdf', pdfPath],
  ['video', videoPath],
]) {
  const hash = createHash('sha256')
    .update(await readFile(new URL(path, root)))
    .digest('hex');
  assert.equal(validation[key].sha256, hash, `${key} review record is stale.`);
}
assert.equal(
  validation.pdf.sourceSha256,
  createHash('sha256').update(report).digest('hex'),
  'PDF source changed after review.',
);
assert.equal(
  validation.video.sourceSha256,
  createHash('sha256').update(storyboard).digest('hex'),
  'Video narration changed after review.',
);
assert.equal(validation.pdf.visualReviewPages, pdf.pages);
assert.equal(validation.video.sampledScenes, 7);
assert.equal(validation.ownerApproved, false, 'This command cannot grant owner approval.');
for (const file of [
  'ELIGIBILITY_AND_TRACK_REGISTER.md',
  'PHASE1_SUBMISSION_CHECKLIST.md',
  'CITATION_AND_EVIDENCE_REGISTER.md',
  'ARTIFACT_VALIDATION.md',
]) {
  assert.ok(
    (await read(`docs/competition/${file}`)).length > 200,
    `Missing evidence file: ${file}`,
  );
}
console.log(
  JSON.stringify({
    status: 'PASS_ARTIFACT_TECHNICAL_CHECKS',
    abstractWords: words,
    keywords: keywords.length,
    pdfPages: pdf.pages,
    videoSeconds: Number(media.format.duration),
    videoAudioPresent: true,
    ownerApproved: false,
    eligibilityVerified: false,
    submitted: false,
  }),
);
