import test from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage
const makeStorage = () => {
    const store = new Map();
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        },
        clear() {
            store.clear();
        }
    };
};

global.localStorage = makeStorage();

import { truthService } from './truthService.ts';

test('verifyClaim identifies personal intent and returns 100% subjective truth', async () => {
    const result = await truthService.verifyClaim('I plan to learn software architecture');

    assert.equal(result.isTrue, true);
    assert.equal(result.isIntent, true);
    assert.equal(result.confidenceScore, 1.0);
    assert.ok(result.explanation.length > 0);
});

test('verifyClaim evaluates empirical claim and builds breakdown', async () => {
    const result = await truthService.verifyClaim('The earth is flat');

    assert.equal(result.isTrue, false);
    assert.ok(result.confidenceScore > 0.5);
    assert.ok(result.sources.length > 0);
    assert.ok(result.breakdown.knowledgeBaseScore > 0);
});

test('getTruthScore calculates blended truth score and returns badge', async () => {
    const scoreData = await truthService.getTruthScore('Water boils at 100c');

    assert.ok(scoreData.score >= 50);
    assert.ok(scoreData.badge !== undefined);
});

test('voteOnClaim records community vote in tandem', async () => {
    const consensus = await truthService.voteOnClaim('claim-123', true, 8);

    assert.equal(consensus.claimId, 'claim-123');
    assert.ok(consensus.consensusStatus !== undefined);
});

test('detectContradictions identifies false claims', async () => {
    const result = await truthService.detectContradictions('The earth is square');

    assert.ok(result.hasContradictions !== undefined);
    assert.ok(Array.isArray(result.contradictions));
});

test('evaluates political party assertions as 50% disputed value claims', async () => {
    const result = await truthService.verifyClaim('Republicans are the party of honesty');

    assert.equal(result.isTrue, null);
    assert.equal(result.isPoliticalAssertion, true);
    assert.equal(result.confidenceScore, 0.5);
    assert.ok(result.sources.some((s) => s.url.includes('politifact') || s.url.includes('factcheck')));
});
