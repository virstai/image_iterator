'use strict';

const registry = {
  generate: require('./generate'),
};

function get(type) {
  const step = registry[type];
  if (!step) throw new Error(`Unknown step type "${type}". Valid: ${Object.keys(registry).join(', ')}`);
  return step;
}

module.exports = { get, types: Object.keys(registry) };
