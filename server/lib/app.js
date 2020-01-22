'use strict';
const express = require('express');
const bodyParser = require('body-parser');
const async = require('async');
const uuid4 = require('uuid/v4');
const prerequisites = require('./prerequisites');
const medUtils = require('openhim-mediator-utils');
const fs = require('fs');
const https = require('https')
const fhirWrapper = require('./fhir')();
const medMatching = require('./medMatching')();
const esMatching = require('./esMatching')
const mixin = require('./mixin');
const logger = require('./winston');
const config = require('./config');
const mediatorConfig = require(`${__dirname}/../config/mediator`);

const serverOpts = {
  key: fs.readFileSync(`${__dirname}/../certificates/server_key.pem`),
  cert: fs.readFileSync(`${__dirname}/../certificates/server_cert.pem`),
  requestCert: true,
  rejectUnauthorized: false,
  ca: [fs.readFileSync(`${__dirname}/../certificates/server_cert.pem`)]
}

if (config.get('mediator:register')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;
}

/**
 * @returns {express.app}
 */
function appRoutes() {
  const app = express();
  app.use(bodyParser.json());

  function certificateValidity(req, res, next) {
    const cert = req.connection.getPeerCertificate()
    if (req.client.authorized) {
      if (!cert.subject.CN) {
        logger.error(`Client has submitted a valid certificate but missing Common Name (CN)`)
        return res.status(400).send(`You have submitted a valid certificate but missing Common Name (CN)`)
      }
    } else if (cert.subject) {
      logger.error(`Client ${cert.subject.CN} has submitted an invalid certificate`)
      return res.status(403).send(`Sorry you have submitted an invalid certificate, make sure that your certificate is signed by client registry`)
    } else {
      logger.error('Client has submitted request without certificate')
      return res.status(401).send(`Sorry, but you need to provide a client certificate to continue.`)
    }
    next()
  }
  if (!config.get('mediator:register')) {
    app.use(certificateValidity)
  }

  app.get('/test', (req, res) => {
    const cert = req.connection.getPeerCertificate()
    logger.error(cert.subject.CN)
    res.status(200).send('Done')
  })
  app.post('/addPatient', (req, res) => {
    logger.info('Received a request to add new patient');
    const patientsBundle = req.body;
    let clientID
    if (config.get('mediator:register')) {
      clientID = req.headers['x-openhim-clientid']
    } else {
      const cert = req.connection.getPeerCertificate()
      clientID = cert.subject.CN
    }
    if (!patientsBundle) {
      logger.error('Received empty request');
      res.status(400).send('Empty request body');
      return;
    }
    if (patientsBundle.resourceType !== 'Bundle') {
      logger.error('Request is not a bundle');
      res.status(400).send('Request is not a bundle');
      return;
    }
    const addLinks = (patients, callback) => {
      /**
       * this needs to be processed in series
       * Dont change it to parallel unless you know what you are doing
       * Parallel processing may overwrite links of the new patient if new patient is a match of another new patient in the patients array
       */
      async.eachSeries(patients.entry, (patient, nxtPatient) => {
        const patientEntry = {};
        patientEntry.entry = [{
          resource: patient.resource,
        }];
        let matchingTool
        if (config.get("matching:tool") === "mediator") {
          matchingTool = medMatching
        } else if (config.get("matching:tool") === "elasticsearch") {
          matchingTool = esMatching
        }
        matchingTool.performMatch({
          sourceResource: patient.resource,
          ignoreList: [patient.resource.id],
        }, matches => {
          async.series([
            callback => {
              if (matches.entry.length === 0) {
                return callback(null)
              }
              // link all matches to the new patient
              const linkReferences = [];
              for (const match of matches.entry) {
                linkReferences.push(`Patient/${match.resource.id}`);
              }
              fhirWrapper.linkPatients({
                patients: patientEntry,
                linkReferences,
              }, () => {
                return callback(null);
              });
            },
            callback => {
              // link new patient to all matches
              if (matches.entry.length === 0) {
                return callback(null)
              }
              fhirWrapper.linkPatients({
                patients: matches,
                linkReferences: [`Patient/${patient.resource.id}`],
              }, () => {
                return callback(null);
              });
            },
          ], () => {
            return nxtPatient();
          });
        });
      }, () => {
        return callback();
      });
    };

    logger.info('Searching to check if the patient exists');
    async.eachSeries(patientsBundle.entry, (newPatient, nxtPatient) => {
      const existingPatients = {};
      existingPatients.entry = [];
      let validSystem = newPatient.resource.identifier && newPatient.resource.identifier.find(identifier => {
        let uri = config.get("systems:" + clientID + ":uri")
        return identifier.system === uri
      });
      if (!validSystem) {
        logger.error('Patient resource has no identifiers registered by client registry, stop processing');
        return nxtPatient();
      }

      // const query = `identifier=${validSystem.system}|${validSystem.value}`;
      const query = `identifier=${validSystem.value}`;
      fhirWrapper.getResource({
        resource: 'Patient',
        query,
      }, dbPatients => {
        existingPatients.entry = existingPatients.entry.concat(dbPatients.entry);
        if (existingPatients.entry.length === 0) {
          logger.info(`Patient ${JSON.stringify(newPatient.resource.identifier)} doesnt exist, adding to the database`);
          newPatient.resource.id = uuid4();
          const bundle = {};
          bundle.entry = [{
            resource: newPatient.resource,
            request: {
              method: 'PUT',
              url: `Patient/${newPatient.resource.id}`,
            },
          }];
          bundle.type = 'batch';
          bundle.resourceType = 'Bundle';
          fhirWrapper.saveResource({
            resourceData: bundle,
          }, () => {
            const newPatientEntry = {};
            newPatientEntry.entry = [{
              resource: newPatient.resource,
            }];
            addLinks(newPatientEntry, () => {
              return nxtPatient();
            });
          });
        } else if (existingPatients.entry.length > 0) {
          logger.info(`Patient ${JSON.stringify(newPatient.resource.identifier)} exists, updating database records`);
          async.series([
            /**
             * overwrite with this new Patient all existing CR patients who has same identifier as the new patient
             * This will also break all links, links will be added after matching is done again due to updates
             */
            callback => {
              const bundle = {};
              bundle.type = 'batch';
              bundle.resourceType = 'Bundle';
              bundle.entry = [];
              for (const existingPatient of existingPatients.entry) {
                const id = existingPatient.resource.id;
                existingPatient.resource = Object.assign({},
                  newPatient.resource
                );
                existingPatient.resource.id = id;
                bundle.entry.push({
                  resource: existingPatient.resource,
                  request: {
                    method: 'PUT',
                    url: `Patient/${existingPatient.resource.id}`,
                  },
                });
              }
              logger.info('Breaking all links of the new patient to other patients');
              fhirWrapper.saveResource({
                resourceData: bundle,
              }, () => {
                callback(null);
              });
            },
            /**
             * Drop links to every CR patient who is linked to this new patient
             */
            callback => {
              const bundle = {};
              bundle.type = 'batch';
              bundle.resourceType = 'Bundle';
              bundle.entry = [];
              const promises = [];
              for (const existingPatient of existingPatients.entry) {
                promises.push(new Promise(resolve => {
                  const link = `Patient/${existingPatient.resource.id}`;
                  const query = `link=${link}`;
                  fhirWrapper.getResource({
                    resource: 'Patient',
                    query,
                  }, dbLinkedPatients => {
                    for (const linkedPatient of dbLinkedPatients.entry) {
                      for (const index in linkedPatient.resource.link) {
                        if (linkedPatient.resource.link[index].other.reference === link) {
                          linkedPatient.resource.link.splice(index, 1);
                          bundle.entry.push({
                            resource: linkedPatient.resource,
                            request: {
                              method: 'PUT',
                              url: `Patient/${linkedPatient.resource.id}`,
                            },
                          });
                        }
                      }
                    }
                    resolve();
                  });
                }));
              }
              Promise.all(promises).then(() => {
                if (bundle.entry.length > 0) {
                  logger.info(`Breaking ${bundle.entry.length} links of patients pointing to new patient`);
                  fhirWrapper.saveResource({
                    resourceData: bundle,
                  }, () => {
                    return callback(null);
                  });
                } else {
                  return callback(null);
                }
              }).catch(err => {
                callback(null);
                throw err;
              });
            },
          ], () => {
            addLinks(existingPatients, () => {
              return nxtPatient();
            });
          });
        }
      });
    }, () => {
      logger.info('Done adding patient');
      res.status(200).send('Done');
    });
  });

  app.get('/breakMatch', (req, res) => {
    let id1 = req.query.id1
    let id2 = req.query.id2
    const promises = []
    promises.push(new Promise((resolve) => {
      fhirWrapper.getResource({
        resource: 'Patient',
        id: id1
      }, (resourceData) => {
        resolve(resourceData)
      })
    }))

    promises.push(new Promise((resolve) => {
      fhirWrapper.getResource({
        resource: 'Patient',
        id: id2
      }, (resourceData) => {
        resolve(resourceData)
      })
    }))

    Promise.all(promises).then((resourcesData) => {
      let resourceData1 = resourcesData[0]
      let resourceData2 = resourcesData[1]
      if (!Array.isArray(resourceData1.link) || !Array.isArray(resourceData2.link)) {
        return res.status(500).send()
      }
      let matchBroken = false
      let id1Reference = resourceData1.resourceType + '/' + resourceData1.id
      let id2Reference = resourceData2.resourceType + '/' + resourceData2.id
      for (let linkIndex in resourceData1.link) {
        if (resourceData1.link[linkIndex].other.reference === id2Reference) {
          resourceData1.link.splice(linkIndex, 1)
          matchBroken = true
        }
      }

      for (let linkIndex in resourceData2.link) {
        if (resourceData2.link[linkIndex].other.reference === resourceData1.resourceType + '/' + resourceData1.id) {
          resourceData2.link.splice(linkIndex, 1)
          matchBroken = true
        }
      }

      if (matchBroken) {
        if (!resourceData1.meta.extension) {
          resourceData1.meta.extension = []
        }
        let extExist1 = resourceData1.meta.extension.find((extension) => {
          return extension.url === config.get("systems:brokenMatch:uri") && extension.valueReference.reference === id2Reference
        })
        if (!extExist1) {
          resourceData1.meta.extension.push({
            url: config.get("systems:brokenMatch:uri"),
            valueReference: {
              reference: id2Reference
            }
          })
        }

        if (!resourceData2.meta.extension) {
          resourceData2.meta.extension = []
        }
        let extExist2 = resourceData2.meta.extension.find((extension) => {
          return extension.url === config.get("systems:brokenMatch:uri") && extension.valueReference.reference === id1Reference
        })
        if (!extExist2) {
          resourceData2.meta.extension.push({
            url: config.get("systems:brokenMatch:uri"),
            valueReference: {
              reference: id1Reference
            }
          })
        }
      }

      const bundle = {};
      bundle.entry = [];
      bundle.type = 'batch';
      bundle.resourceType = 'Bundle';
      bundle.entry.push({
        resource: resourceData1,
        request: {
          method: 'PUT',
          url: id1Reference
        }
      }, {
        resource: resourceData2,
        request: {
          method: 'PUT',
          url: id2Reference
        }
      })

      fhirWrapper.saveResource({
        resourceData: bundle
      }, (err, body) => {
        if (err) {
          res.status(500).send()
        } else {
          res.status(200).send()
        }
      })

    })
  })
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
          if (!config.get('app:installed')) {
            prerequisites.loadResources((err) => {
              if (!err) {
                mixin.updateConfigFile(['app', 'installed'], true, () => {});
              }
            });
          }
          const app = appRoutes();
          const server = app.listen(config.get('app:port'), () => {
            const configEmitter = medUtils.activateHeartbeat(config.get('mediator:api'));
            configEmitter.on('config', newConfig => {
              logger.info('Received updated config:', newConfig);
              const updatedConfig = Object.assign(configFile, newConfig);
              reloadConfig(updatedConfig, () => {
                if (!config.get('app:installed')) {
                  prerequisites.loadResources((err) => {
                    if (!err) {
                      mixin.updateConfigFile(['app', 'installed'], true, () => {});
                    }
                  });
                }
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
      if (!config.get('app:installed')) {
        prerequisites.loadResources((err) => {
          if (!err) {
            mixin.updateConfigFile(['app', 'installed'], true, () => {});
          }
        });
      }
      callback(server)
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