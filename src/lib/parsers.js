'use strict';

function parsePromptResponse(raw) {
  return raw.trim();
}

function parseReview(raw) {
  const verdictMatch   = raw.match(/VERDICT:\s*(ACCEPT|REJECT)/i);
  const diagnosisMatch = raw.match(/DIAGNOSIS:\s*(.+)/i);
  return {
    verdict:   verdictMatch   ? verdictMatch[1].toUpperCase() : 'REJECT',
    diagnosis: diagnosisMatch ? diagnosisMatch[1].trim()      : raw.trim(),
  };
}

module.exports = { parsePromptResponse, parseReview };
