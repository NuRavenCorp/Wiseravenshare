import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { truthEngine } from '../src/Services/TruthDetectionEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const casesPath = path.join(__dirname, 'truth-benchmark-cases.json');
const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));

const classifyScore = (score) => {
  if (score >= 70) return 'true';
  if (score <= 30) return 'false';
  return 'unknown';
};

const rows = cases.map((entry) => {
  const score = truthEngine.getTruthScore(entry.claim);
  const predicted = classifyScore(score);
  const correct = predicted === entry.expected;
  return {
    id: entry.id,
    expected: entry.expected,
    predicted,
    score,
    correct,
    claim: entry.claim
  };
});

const total = rows.length;
const correctCount = rows.filter((r) => r.correct).length;
const accuracy = (correctCount / total) * 100;

const confidentRows = rows.filter((r) => r.predicted !== 'unknown');
const confidentCorrect = confidentRows.filter((r) => r.correct).length;
const confidentAccuracy = confidentRows.length > 0
  ? (confidentCorrect / confidentRows.length) * 100
  : 0;

const p99TargetMet = confidentAccuracy >= 99 && confidentRows.length >= 10;

console.log('=== Truth Seeker Benchmark ===');
console.log(`Total cases: ${total}`);
console.log(`Overall accuracy: ${accuracy.toFixed(2)}%`);
console.log(`Confident decisions: ${confidentRows.length}/${total}`);
console.log(`Confident accuracy: ${confidentAccuracy.toFixed(2)}%`);
console.log(`P99 target (>=99% confident accuracy): ${p99TargetMet ? 'PASS' : 'FAIL'}`);

if (!p99TargetMet) {
  console.log('\nTop misclassifications:');
  rows
    .filter((r) => !r.correct)
    .slice(0, 10)
    .forEach((r) => {
      console.log(`- [${r.id}] expected=${r.expected}, predicted=${r.predicted}, score=${r.score} :: ${r.claim}`);
    });
}

const outPath = path.join(__dirname, 'truth-benchmark-report.json');
fs.writeFileSync(outPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  metrics: {
    total,
    accuracy,
    confidentDecisions: confidentRows.length,
    confidentAccuracy,
    p99TargetMet
  },
  rows
}, null, 2));

console.log(`\nReport written: ${outPath}`);

if (!p99TargetMet) {
  process.exitCode = 2;
}
