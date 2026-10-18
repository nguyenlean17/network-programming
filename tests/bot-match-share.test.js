import assert from 'node:assert/strict';
import { matchShareSummary, resultCardSvg, setupResultSharing } from '../js/matchShare.js';

const data = { status: 'COMPLETED', matchKind: 'PRACTICE', matchId: 'test-1', totalPlies: 28,
  result: { winner: 'P2', reason: 'GOAL_REACHED' },
  players: { p1: { botName: '<script>alert("x")</script>', ownerName: 'Private email never included' }, p2: { botName: 'Fox & Leaf' } } };
const summary = matchShareSummary(data, 'https://contest.example/match.html?token=secret');
assert.equal(summary.url, 'https://contest.example/match.html?id=test-1');
assert.match(summary.text, /P2 · Fox & Leaf thắng/);
assert.match(summary.text, /Trận luyện tập/);
assert.ok(!summary.text.includes('secret') && !summary.text.includes('Private email'));
const svg = resultCardSvg(summary);
assert.ok(!svg.includes('<script>'));
assert.match(svg, /&lt;script&gt;/); assert.match(svg, /Fox &amp; Leaf/);
for (const status of ['RUNNING', 'QUEUED', 'FAILED']) assert.equal(matchShareSummary({ ...data, status }, 'https://contest.example'), null);
assert.equal(matchShareSummary({ ...data, result: { winner: null, reason: 'RUNNER_ERROR' } }, 'https://contest.example'), null);
assert.equal(matchShareSummary({ ...data, result: { winner: 'P3' } }, 'https://contest.example'), null);
assert.match(matchShareSummary({ ...data, matchKind: 'QUALIFICATION', result: { winner: null, reason: 'MOVE_LIMIT' } }, 'https://contest.example').text, /Hai bot hòa nhau/);

const elements = new Map();
const element = () => ({ hidden: true, events: {}, addEventListener(event, handler) { this.events[event] = handler; }, focus() {}, select() { this.selected = true; } });
const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
let copied;
const update = setupResultSharing({ document: { getElementById: get },
  navigator: { clipboard: { writeText: async value => { copied = value; } } }, location: { origin: 'https://contest.example' } });
update({ ...data, status: 'RUNNING' });
assert.equal(get('result-share').hidden, true);
update(data); assert.equal(get('result-share').hidden, false);
assert.equal(get('share-bots').textContent.includes('<script>'), true, 'names remain text');
await get('copy-result').events.click(); assert.equal(copied, summary.text);
const fallbackUpdate = setupResultSharing({ document: { getElementById: get }, navigator: {}, location: { origin: 'https://contest.example' } });
fallbackUpdate(data); await get('copy-result').events.click();
assert.equal(get('share-text').hidden, false); assert.equal(get('share-text').selected, true);
assert.equal(get('share-text').value, summary.text);
console.log('✓ Share only completed results, correct winner/draw, canonical replay URL, safe SVG and clipboard fallback');
