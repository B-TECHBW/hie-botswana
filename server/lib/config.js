const nconf = require('nconf');
const env = process.env.NODE_ENV || 'development';
let decisionRulesFile;
if(env === 'test') {
  decisionRulesFile = `${__dirname}/../config/decisionRulesTest.json`;
} else {
  decisionRulesFile = `${__dirname}/../config/decisionRules.json`;
}
nconf.argv()
  .env()
  .file(`${__dirname}/../config/config_shr_template.json`)
module.exports = nconf;