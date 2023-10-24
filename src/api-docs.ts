/*
 * You are allowed to study this software for learning and local * development purposes only. Any other use without explicit permission by Mindgrep, is prohibited.
 * © 2022 Mindgrep Technologies Pvt Ltd
 */
import loadYaml from '@godspeedsystems/core/dist/core/yamlLoader';
import yaml from 'yaml';
import { PlainObject } from '@godspeedsystems/core';
import { logger } from '@godspeedsystems/core/dist/logger';
import fs from 'fs-extra';
import path from 'path';
import swaggerCommonPart from './basic-specs';

// add it here, because of circular dependency of logger
function removeNulls(obj: PlainObject) {
  const isArray = Array.isArray(obj);
  for (const k of Object.keys(obj)) {
    if (obj[k] === null) {
      if (isArray) {
        //@ts-ignore
        obj.splice(k, 1);
      } else {
        delete obj[k];
      }
    } else if (typeof obj[k] === 'object') {
      removeNulls(obj[k]);
    }
    //@ts-ignore
    if (isArray && obj.length === k) {
      removeNulls(obj);
    }
  }
  return obj;
}

export default async function generateSchema(
  eventsFolderPath: string,
  definitionsFolderPath: string,
  configPath: string
): Promise<PlainObject> {
  const eventsSchema: PlainObject = await loadEventsYaml(eventsFolderPath);
  const definitions: PlainObject = await loadYaml(definitionsFolderPath, false);

  let finalSpec: PlainObject = {};
  let swaggerSpecBase = JSON.parse(JSON.stringify(swaggerCommonPart));

  try {
    const swaggerfilePath = path.resolve(path.join(configPath, 'swagger.json'));
    if (fs.existsSync(swaggerfilePath)) {
      let swaggerSpecCustom = JSON.parse(fs.readFileSync(swaggerfilePath, 'utf-8'));
      swaggerSpecBase = { ...swaggerSpecBase, info: { ...swaggerSpecCustom.info } };
    }

    finalSpec = swaggerSpecBase;

    Object.keys(eventsSchema).forEach((event: any) => {
      let apiEndPoint = event.split('.')[2];
      apiEndPoint = apiEndPoint.replaceAll(/:([^\/]+)/g, '{$1}'); //We take :path_param. OAS3 takes {path_param}
      const method = event.split('.')[1];
      const eventSchema = eventsSchema[event];

      //Initialize the schema for this method, for given event
      let methodSpec: PlainObject = {
        summary: eventSchema.summary,
        description: eventSchema.description,
        requestBody: eventSchema.body || eventSchema.data?.schema?.body,
        parameters:
          eventSchema.parameters ||
          eventSchema.params ||
          eventSchema.data?.schema?.params,
        responses: eventSchema.responses,
      };

      //Set it in the overall schema
      finalSpec.paths[apiEndPoint] = {
        ...finalSpec.paths[apiEndPoint],
        [method]: methodSpec,
      };
    });
    // add definitions{models} in swagger specs
    finalSpec.definitions = definitions;
  } catch (error) {
    logger.error(error);
  }

  removeNulls(finalSpec);
  return finalSpec;
}

async function loadEventsYaml(path: string) {
  try {
    return await loadYaml(path, true);
  } catch (ex) {
    logger.error('Error in reading events YAMLs', ex);
    process.exit(1);
  }
}

if (require.main === module) {
  const eventPath = '/workspace/development/app/src/events';
  const definitionsPath = '/workspace/development/app/src/definitions';
  const configPath = '/workspace/development/app/config';
  generateSchema(eventPath, definitionsPath, configPath)
    .then((schema) => {
      fs.outputFile(
        '/workspace/development/app/docs/api-doc.yaml',
        yaml.stringify(schema),
        (err) => {
          if (err) {
            logger.error(
              'Error in generating /workspace/development/app/docs/api-doc.yaml file %o',
              err
            );
          } else {
            logger.info(
              '/workspace/development/app/docs/api-doc.yaml file is saved!'
            );
          }
        }
      );
    })
    .catch((e) => {
      logger.error('Error: %o', e);
    });
}