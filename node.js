// Set options as a parameter, environment variable, or rc file.
require = require('esm')(module, {await: true})
module.exports = require('./src/index')
