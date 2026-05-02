const normalizer = require('./normalizer');
const generator = require('./generator');

module.exports = {
  ...normalizer,
  ...generator
};
