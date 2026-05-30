'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { parseReview, parsePromptResponse } = require('../../src/lib/parsers');

test('parsePromptResponse returns trimmed raw text', () => {
  assert.equal(parsePromptResponse('  a cat on the moon  '), 'a cat on the moon');
});

test('parsePromptResponse preserves multi-line prompts', () => {
  const raw = 'masterpiece, best quality\nhigh resolution, detailed';
  assert.equal(parsePromptResponse(raw), raw);
});

test('parseReview extracts ACCEPT verdict', () => {
  const { verdict } = parseReview('Looks great.\nVERDICT: ACCEPT\nDIAGNOSIS: composition is solid');
  assert.equal(verdict, 'ACCEPT');
});

test('parseReview extracts REJECT verdict', () => {
  const { verdict } = parseReview('Missing elements.\nVERDICT: REJECT\nDIAGNOSIS: subject not visible');
  assert.equal(verdict, 'REJECT');
});

test('parseReview is case-insensitive for verdict', () => {
  const { verdict } = parseReview('verdict: accept\ndiagnosis: fine');
  assert.equal(verdict, 'ACCEPT');
});

test('parseReview extracts diagnosis text', () => {
  const { diagnosis } = parseReview('VERDICT: REJECT\nDIAGNOSIS: wrong colour palette');
  assert.equal(diagnosis, 'wrong colour palette');
});

test('parseReview defaults to REJECT when verdict is missing', () => {
  const { verdict } = parseReview('This image looks fine overall.');
  assert.equal(verdict, 'REJECT');
});

test('parseReview falls back to full text as diagnosis when DIAGNOSIS line is absent', () => {
  const { diagnosis } = parseReview('VERDICT: ACCEPT');
  assert.equal(diagnosis, 'VERDICT: ACCEPT');
});
