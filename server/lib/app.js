'use strict';
/*global process, __dirname*/
const express = require('express');
const bodyParser = require('body-parser');
const prerequisites = require('./prerequisites');
const medUtils = require('openhim-mediator-utils');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const https = require('https');
const fhirWrapper = require('./fhir')();
const cacheFHIR = require('./tools/cacheFHIR');
const logger = require('./winston');
const config = require('./config');
const mediatorConfig = require(`${__dirname}/../config/mediator`);

const userRouter = require('./routes/user');
const fhirRoutes = require('./routes/fhir');
const matchRoutes = require('./routes/match');
const configRoutes = require('./routes/config');

const serverOpts = {
  key: fs.readFileSync(`${__dirname}/../certificates/server_key.pem`),
  cert: fs.readFileSync(`${__dirname}/../certificates/server_cert.pem`),
  requestCert: true,
  rejectUnauthorized: false,
  ca: [fs.readFileSync(`${__dirname}/../certificates/server_cert.pem`)]
};

if (config.get('mediator:register')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;
}


let authorized = false;
/**
 * @returns {express.app}
 */
function appRoutes() {
  const app = express();
  app.set('trust proxy', true);
  app.use(bodyParser.json({
    limit: '10Mb',
    type: ['application/fhir+json', 'application/json+fhir', 'application/json']
  }));
  app.use('/crux', express.static(`${__dirname}/../gui`));

  const jwtValidator = function (req, res, next) {
    if (req.method == 'OPTIONS' ||
      req.path == '/user/authenticate'
    ) {
      authorized = true;
      return next();
    }
    // if (!req.path.startsWith('/ocrux')) {
    //   return next();
    // }
    if (!req.headers.authorization || req.headers.authorization.split(' ').length !== 2) {
      logger.error('Token is missing');
      res.set('Access-Control-Allow-Origin', '*');
      res.set('WWW-Authenticate', 'Bearer realm="Token is required"');
      res.set('charset', 'utf - 8');
      res.status(401).json({
        error: 'Token is missing',
      });
    } else {
      const tokenArray = req.headers.authorization.split(' ');
      const token = req.headers.authorization = tokenArray[1];
      jwt.verify(token, config.get('auth:secret'), (err, decoded) => {
        if (err) {
          logger.warn('Token expired');
          res.set('Access-Control-Allow-Origin', '*');
          res.set('WWW-Authenticate', 'Bearer realm="Token expired"');
          res.set('charset', 'utf - 8');
          res.status(401).json({
            error: 'Token expired',
          });
        } else {
          authorized = true;
          if (req.path == '/ocrux/isTokenActive/') {
            res.set('Access-Control-Allow-Origin', '*');
            res.status(200).send(true);
          } else {
            return next();
          }
        }
      });
    }
  };

  function certificateValidity(req, res, next) {
    if (req.path.startsWith('/ocrux')) {
      return next();
    }
    if(authorized) {
      return next();
    }
    const cert = req.connection.getPeerCertificate();
    if (req.client.authorized) {
      if (!cert.subject.CN) {
        logger.error(`Client has submitted a valid certificate but missing Common Name (CN)`);
        return res.status(400).send(`You have submitted a valid certificate but missing Common Name (CN)`);
      }
    } else if (cert.subject) {
      logger.error(`Client ${cert.subject.CN} has submitted an invalid certificate`);
      return res.status(403).send(`Sorry, you have submitted an invalid certificate, make sure that your certificate is signed by client registry`);
    } else {
      logger.error('Client has submitted request without certificate');
      return res.status(401).send(`Sorry, you need to provide a client certificate to continue.`);
    }
    next();
  }
  app.use(jwtValidator);
  if (!config.get('mediator:register')) {
    app.use(certificateValidity);
  }
  app.use('/user', userRouter);
  app.use('/fhir', fhirRoutes);
  app.use('/match', matchRoutes);
  app.use('/config', configRoutes);

  //this API is deprecated, use /fhir/Patient
  app.post('/Patient', (req, res) => {
    logger.info('Received a request to add new patient');
    const patient = req.body;
    if (!patient.resourceType ||
      (patient.resourceType && patient.resourceType !== 'Patient') ||
      !patient.identifier ||
      (patient.identifier && patient.identifier.length === 0)) {
      return res.status(400).json({
        resourceType: "OperationOutcome",
        issue: [{
          severity: "error",
          code: "processing",
          diagnostics: "Invalid patient resource submitted"
        }]
      });
    }
    const patientsBundle = {
      entry: [{
        resource: patient
      }]
    };
    let clientID;
    if (config.get('mediator:register')) {
      clientID = req.headers['x-openhim-clientid'];
    } else {
      const cert = req.connection.getPeerCertificate();
      clientID = cert.subject.CN;
    }
    addPatient(clientID, patientsBundle, (err, response, operationSummary) => {
      const auditBundle = createAddPatientAudEvent(operationSummary, req);
      fhirWrapper.saveResource({
        resourceData: auditBundle
      }, () => {
        logger.info('Audit saved successfully');
        if (err) {
          res.status(500).send();
        } else {
          res.setHeader('location', response.entry[0].response.location);
          res.status(201).send();
        }
      });
    });
  });

  //this API is deprecated, use /fhir
  app.post('/', (req, res) => {
    logger.info('Received a request to add new patients from a bundle');
    const patientsBundle = req.body;
    if (!patientsBundle.resourceType ||
      (patientsBundle.resourceType && patientsBundle.resourceType !== 'Bundle') ||
      !patientsBundle.entry || (patientsBundle.entry && patientsBundle.entry.length === 0)) {
      return res.status(400).json({
        resourceType: "OperationOutcome",
        issue: [{
          severity: "error",
          code: "processing",
          diagnostics: "Invalid bundle submitted"
        }]
      });
    }
    let clientID;
    if (config.get('mediator:register')) {
      clientID = req.headers['x-openhim-clientid'];
    } else {
      const cert = req.connection.getPeerCertificate();
      clientID = cert.subject.CN;
    }
    addPatient(clientID, patientsBundle, (err, response, operationSummary) => {
      if (err) {
        return res.status(500).send();
      }
      res.status(201).json(response);
    });
  });

  return app;
}

/**
 * start - starts the mediator
 *
 * @param  {Function} callback a node style callback that is called once the
 * server is started
 */
function reloadConfig(data, callback) {
  const tmpFile = `${__dirname}/../config/tmpConfig.json`;
  fs.writeFile(tmpFile, JSON.stringify(data, 0, 2), err => {
    if (err) {
      throw err;
    }
    config.file(tmpFile);
    return callback();
  });
}

function start(callback) {
  if (config.get('mediator:register')) {
    logger.info('Running client registry as a mediator');
    medUtils.registerMediator(config.get('mediator:api'), mediatorConfig, err => {
      if (err) {
        logger.error('Failed to register this mediator, check your config');
        logger.error(err.stack);
        process.exit(1);
      }
      config.set('mediator:api:urn', mediatorConfig.urn);
      medUtils.fetchConfig(config.get('mediator:api'), (err, newConfig) => {
        if (err) {
          logger.info('Failed to fetch initial config');
          logger.info(err.stack);
          process.exit(1);
        }
        const env = process.env.NODE_ENV || 'development';
        const configFile = require(`${__dirname}/../config/config_${env}.json`);
        const updatedConfig = Object.assign(configFile, newConfig);
        reloadConfig(updatedConfig, () => {
          config.set('mediator:api:urn', mediatorConfig.urn);
          logger.info('Received initial config:', newConfig);
          logger.info('Successfully registered mediator!');
          prerequisites.init((err) => {
            if (err) {
              process.exit();
            }
            if (config.get("matching:tool") === "elasticsearch") {
              const runsLastSync = config.get("sync:lastFHIR2ESSync");
              cacheFHIR.fhir2ES({
                lastSync: runsLastSync
              }, (err) => {});
            }
          });
          const app = appRoutes();
          const server = app.listen(config.get('app:port'), () => {
            const configEmitter = medUtils.activateHeartbeat(config.get('mediator:api'));
            configEmitter.on('config', newConfig => {
              logger.info('Received updated config:', newConfig);
              const updatedConfig = Object.assign(configFile, newConfig);
              reloadConfig(updatedConfig, () => {
                prerequisites.init((err) => {
                  if (err) {
                    process.exit();
                  }
                  if (config.get("matching:tool") === "elasticsearch") {
                    const runsLastSync = config.get("sync:lastFHIR2ESSync");
                    cacheFHIR.fhir2ES({
                      lastSync: runsLastSync
                    }, (err) => {});
                  }
                });
                config.set('mediator:api:urn', mediatorConfig.urn);
              });
            });
            callback(server);
          });
        });
      });
    });
  } else {
    logger.info('Running client registry as a stand alone');
    const app = appRoutes();
    const server = https.createServer(serverOpts, app).listen(config.get('app:port'), () => {
      prerequisites.init((err) => {
        if (err) {
          process.exit();
        }
        if (config.get("matching:tool") === "elasticsearch") {
          const runsLastSync = config.get("sync:lastFHIR2ESSync");
          cacheFHIR.fhir2ES({
            lastSync: runsLastSync
          }, (err) => {});
        }
      });
      callback(server);
    });
  }
}

exports.start = start;

if (!module.parent) {
  // if this script is run directly, start the server
  start(() =>
    logger.info(`Server is running and listening on port: ${config.get('app:port')}`)
  );
}