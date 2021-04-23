# HIE Botswana

Proof of Concept Environment Setup

# Components

### Notes
- Server container requires restart after initial setup for some reason. 
- Ran into issues with DB character set (https://talk.openmrs.org/t/ui-framework-error-while-attempting-to-access-registration-app/8734/6).
  Had to specify characterset and collation in docker setup.
- To create demo patients, you can set the `OMRS_CONFIG_ADD_DEMO_DATA` variable in the `openmrs/refapp/openmrs-server.env` file
  or set the `createDemoPatientsOnNextStartup` global property to the number of patients you want to create and restart the 
  container.

### OpenCR

### OpenCR FHIR Server

### OpenHIM
- http://openhim.org/docs/installation/docker

### SHR HAPI JPA Server
