'use strict';
const fs = require('fs');
const csv = require('fast-csv');
const path = require('path');
const async = require('async');
const jsoncsv = require('json-csv');
const moment = require('moment')
const logger = require('../server/lib/winston');
const fhirWrapper = require('../server/lib/fhir')();
const config = require('../server/lib/config');

let noMatches = [];
let missing = [];

const allLinks = [];
const linkedToAllTrueAndOthers = [];
const linkedToAllTrueOnly = [];
const linkedToSomeTrue = [];
const hasMatchesButNoTrue = [];
const expectedToMatchButNoMatch = []
const notExpectedToMatchButMatched = [];
const notExpectedToMatchAndDidntMatch = []
const trueLinks = [];

const decisionRules2HTML = () => {
  const decisionRules = config.get('rules');
  let table =
    `<table border='1' cellspacing='0'>
    <tr>
      <th>#</th><th>Field</th><th>Algorithm</th><th>Threshold</th>
    </tr>`
  let counter = 1
  for (let decisionRule of decisionRules) {
    let totalFields = Object.keys(decisionRule).length
    let tr = `<tr><td rowspan=${totalFields}>${counter}</td>`
    let innerCounter = 1;
    for (const ruleField in decisionRule) {
      if (innerCounter > 1) {
        tr = `<tr>`
      }
      const rule = decisionRule[ruleField];
      let threshold
      if (!rule.threshold) {
        threshold = '-'
      } else {
        threshold = rule.threshold
      }
      tr += `<td>${ruleField}</td><td>${rule.algorithm}</td><td>${threshold}</td>`
      tr += `</tr>`
      table += tr
      innerCounter++
    }
    counter++
  }
  table += `</table>`
  return table
}
const arraysEqual = (array1, array2) => {
  if (array1.length != array2.length) {
    return false;
  }
  let hasAll = true;
  for (let arr1 of array1) {
    if (!array2.includes(arr1)) {
      hasAll = false;
    }
  }
  return hasAll;
};
const expectedToMatch = (checkingID) => {
  let expected = false;
  for (let trueLink of trueLinks) {
    let id1 = trueLink.rec_id_1;
    let id2 = trueLink.rec_id_2;
    if (id1) {
      id1 = id1.trim();
    }
    let id2Arr = [];
    if (id2) {
      id2 = id2.trim();
      id2Arr = id2.split(',');
      for (let index in id2Arr) {
        id2Arr[index] = id2Arr[index].trim();
      }
    }
    if (id1 === checkingID || id2Arr.includes(checkingID)) {
      expected = true;
    }
  }
  return expected
}
const uploadResults = (csvFile) => {
  fs.createReadStream(path.resolve(__dirname, '', csvFile))
    .pipe(
      csv.parse({
        headers: true,
      })
    )
    .on('error', error => console.error(error))
    .on('data', row => {
      trueLinks.push(row);
    })
    .on('end', () => {
      const processed = [];
      async.parallel({
        allLinks: callback => {
          fhirWrapper.getResource({
            resource: 'Patient',
          }, dbPatients => {
            const promises = [];
            for (let patient of dbPatients.entry) {
              promises.push(new Promise(resolve => {
                let linkedid1;
                for (let ident of patient.resource.identifier) {
                  if (ident.system === 'http://clientregistry.org/openmrs') {
                    linkedid1 = ident.value;
                  }
                }
                if (!patient.resource.link || (patient.resource.link && patient.resource.link.length === 0)) {
                  let expected = expectedToMatch(linkedid1)
                  if (!expected) {
                    notExpectedToMatchAndDidntMatch.push({
                      id1: linkedid1
                    })
                  }
                  return resolve();
                }
                const promise1 = [];
                let linkedIds2 = [];
                for (let link of patient.resource.link) {
                  promise1.push(new Promise(resolve => {
                    fhirWrapper.getResource({
                      resource: 'Patient',
                      id: link.other.reference.split('/').pop(),
                    }, linkedPatient => {
                      if (!linkedPatient.identifier) {
                        noIdentifier.push(linkedPatient);
                      } else {
                        let id2;
                        for (let ident of linkedPatient.identifier) {
                          if (
                            ident.system ===
                            'http://clientregistry.org/openmrs'
                          ) {
                            id2 = ident.value;
                          }
                        }
                        linkedIds2.push(id2);
                      }
                      resolve();
                    });
                  }));
                }
                Promise.all(promise1).then(() => {
                  let expected = expectedToMatch(linkedid1)
                  if (!expected) {
                    notExpectedToMatchButMatched.push({
                      id1: linkedid1,
                      id2: linkedIds2.join(', '),
                    });
                  }
                  let combinedId = [...[linkedid1], ...linkedIds2];
                  let isProcessed = processed.find(pr => {
                    return arraysEqual(pr, combinedId);
                  });
                  if (!isProcessed) {
                    processed.push(combinedId);
                    allLinks.push({
                      id1: linkedid1,
                      id2: linkedIds2.join(', '),
                    });
                  }
                  resolve();
                });
              }));
            }
            Promise.all(promises).then(() => {
              return callback(null);
            });
          });
        },
        one: callback => {
          const promises = [];
          for (let row of trueLinks) {
            promises.push(new Promise((resolve, reject) => {
              let trueId1 = row['rec_id_1'];
              let trueId2 = row['rec_id_2'];
              if (trueId1) {
                trueId1 = trueId1.trim();
              }
              let trueId2Arr = [];
              if (trueId2) {
                trueId2 = trueId2.trim();
                trueId2Arr = trueId2.split(',');
                for (let index in trueId2Arr) {
                  trueId2Arr[index] = trueId2Arr[index].trim();
                }
              }
              const query = `identifier=${trueId1}`;
              fhirWrapper.getResource({
                resource: 'Patient',
                query,
              }, dbPatients => {
                if (dbPatients.entry.length === 0) {
                  logger.error('Missing value found');
                  missing.push(trueId1);
                  resolve();
                } else if (dbPatients.entry.length === 1) {
                  const promise1 = [];
                  if (
                    !dbPatients.entry[0].resource.link ||
                    (dbPatients.entry[0].resource.link &&
                      dbPatients.entry[0].resource.link.length === 0)
                  ) {
                    let ident = dbPatients.entry[0].resource.identifier.find(identifier => {
                      return (identifier.system === 'http://clientregistry.org/openmrs');
                    });
                    // expected to have match but no match found
                    noMatches.push({
                      id1: ident.value,
                    });
                    if (ident.value === trueId1 || trueId2Arr.includes(ident.value)) {
                      expectedToMatchButNoMatch.push({
                        id1: trueId1
                      })
                    }
                    resolve();
                  } else {
                    let linkedIds2 = [];
                    for (let link of dbPatients.entry[0].resource.link) {
                      promise1.push(new Promise((resolve, reject) => {
                        fhirWrapper.getResource({
                          resource: 'Patient',
                          id: link.other.reference.split('/').pop(),
                        }, linkedPatient => {
                          if (!linkedPatient.identifier) {
                            noIdentifier.push(linkedPatient);
                          } else {
                            for (let ident of linkedPatient.identifier) {
                              if (ident.system === 'http://clientregistry.org/openmrs') {
                                linkedIds2.push(ident.value);
                              }
                            }
                          }
                          resolve();
                        });
                      }));
                    }
                    Promise.all(promise1).then(() => {
                      let allFound = true;
                      let someFound = false;
                      for (let trueId2 of trueId2Arr) {
                        let has = linkedIds2.includes(trueId2);
                        if (!has) {
                          allFound = false;
                        } else {
                          someFound = true;
                        }
                      }
                      if (allFound && linkedIds2.length === trueId2Arr.length) {
                        linkedToAllTrueOnly.push({
                          id1: trueId1,
                          id2: linkedIds2.join(', '),
                        });
                      }
                      if (allFound && linkedIds2.length > trueId2Arr.length) {
                        linkedToAllTrueAndOthers.push({
                          id1: trueId1,
                          id2: linkedIds2.join(', '),
                        });
                      }
                      if (someFound && !allFound) {
                        linkedToSomeTrue.push({
                          id1: trueId1,
                          id2: linkedIds2.join(', '),
                        });
                      }
                      if (!someFound) {
                        hasMatchesButNoTrue.push({
                          id1: trueId1,
                          id2: linkedIds2.join(', '),
                        });
                      }
                      resolve();
                    });
                  }
                } else {
                  logger.error(JSON.stringify(dbPatients.entry, 0, 2));
                  console.log('Multiple patients with same identifier');
                  resolve();
                }
              });
            }));
          }
          Promise.all(promises).then(() => {
            return callback(null);
          });
        },
      }, () => {
        let fields1 = [{
            name: 'id1',
            label: 'ID1',
          },
          {
            name: 'id2',
            label: 'ID2',
          }
        ];
        let date = moment().format('Y-MM-DDTHH:mm:ss')
        jsoncsv.buffered(allLinks, {
          fields: fields1
        }, (err, csv) => {
          fs.writeFile(`results/allLinks_${date}.csv`, csv, 'utf8', () => {});
        });

        jsoncsv.buffered(linkedToAllTrueOnly, {
          fields: fields1
        }, (err, csv) => {
          fs.writeFile(`results/Linked_to_all_true_matches_only_${date}.csv`, csv, 'utf8', () => {});
        });

        jsoncsv.buffered(linkedToAllTrueAndOthers, {
          fields: fields1,
        }, (err, csv) => {
          fs.writeFile(`results/Linked_to_all_the_true_matches_and_other_unexpected_matches_${date}.csv`, csv, 'utf8', () => {});
        });

        jsoncsv.buffered(linkedToSomeTrue, {
          fields: fields1,
        }, (err, csv) => {
          fs.writeFile(`results/Linked_to_atleast_one_true_matches_but_not_all_${date}.csv`, csv, 'utf8', () => {});
        });

        jsoncsv.buffered(
          hasMatchesButNoTrue, {
            fields: fields1,
          }, (err, csv) => {
            fs.writeFile(`results/Linked_to_some_matches_but_excluding_the_true_match_${date}.csv`, csv, 'utf8', () => {});
          }
        );

        jsoncsv.buffered(notExpectedToMatchButMatched, {
          fields: fields1,
        }, (err, csv) => {
          fs.writeFile(`results/Didnt_expect_to_have_matches_but_match_found_${date}.csv`, csv, 'utf8', () => {});
        });

        jsoncsv.buffered(expectedToMatchButNoMatch, {
          fields: fields1,
        }, (err, csv) => {
          fs.writeFile(`results/Expected_to_have_matches_but_matched_nothing_${date}.csv`, csv, 'utf8', () => {});
        });

        jsoncsv.buffered(noMatches, {
          fields: fields1,
        }, (err, csv) => {
          fs.writeFile(`results/All_no_matches_${date}.csv`, csv, 'utf8', () => {});
        });

        let TP = linkedToAllTrueOnly.length
        let FP = linkedToAllTrueAndOthers.length + notExpectedToMatchButMatched.length
        let TN = notExpectedToMatchAndDidntMatch.length
        let FN = linkedToSomeTrue.length + expectedToMatchButNoMatch.length
        let sensitivity = TP / (TP + FN)
        if (TP == 0) {
          sensitivity = 0
        }
        let specifity = TN / (TN + FP)
        if (TN == 0) {
          specifity = 0
        }

        let resultsTable =
          `<table border='1' cellspacing='0'>
          <tr>
            <th>True Positive (TP)</th><th>False Positive (FP)</th><th>True Negative (TN)</th><th>False Negative (FN)</th>
          </tr>
          <tr>
            <td>${TP}</td><td>${FP}</td><td>${TN}</td><td>${FN}</td>
          </tr>
        </table>`
        let rules = decisionRules2HTML()
        let matchDiagnostics =
          `<table border='1' cellspacing='0'>
          <tr>
            <th>Sensitivity</th><th>Specifity</th>
          </tr>
          <tr>
            <td>${sensitivity}</td><td>${specifity}</td>
          </tr>
        </table>`
        let table =
          `<br><table border='3' border='1' cellspacing='0' cellpadding='10'>
          <tr>
            <th><center> <b>Run Date ${date}</b></center></th>
          </tr>
          <tr>
            <td><center><b>Decision Rules</b>${rules}</center></td>
          </tr>
          <tr>
            <td><center><b>Match Diagnostics</b><br>${matchDiagnostics}</center></td>
          </tr>
          <tr>
            <td><center><b>Match Results</b><br>${resultsTable}</center></td>
          </tr>
        </table>`
        fs.appendFile('README.md', table, 'utf8', () => {})
      });
    });
}
module.exports = {
  uploadResults
}
uploadResults('./uganda_data_v21_20201501_true_links.csv')