const { EModelEndpoint, extractEnvVariable } = require('librechat-data-provider');
const { isUserProvided, normalizeEndpointName } = require('~/server/utils');
const { fetchModels } = require('~/server/services/ModelService');
const { getCustomConfig } = require('./getCustomConfig');
const axios = require('axios');

/**
 * Check if a user has premium access
 * @param req
 * @param checkEndpoint
 * @returns {Promise<boolean>}
 */
async function hasPremium(req, checkEndpoint) {
  const userEmail = req.user.email || '';
  if (!checkEndpoint) {
    return false;
  }
  try {
    const checkUrl = new URL(checkEndpoint);
    checkUrl.searchParams.set('email', userEmail);
    const premiumResponse = await axios.get(checkUrl.toString());
    return premiumResponse.data['hasPremium'] || false;
  } catch (e) {
    console.error('Error checking premium access:', e);
    return false;
  }
}

/**
 * Modify the return of the loadConfigModels function based on access tier.
 * @param req The req
 * @returns {Promise<void>} The modified return
 */
async function loadConfigModels(req) {
  /**
   * Config models in the format of Map<endpoint, modelName[]>
   * @type {{}|*}
   */
  const loadedModels = await loadConfigModels_Original(req);
  const customConfig = await getCustomConfig();

  /**
   * Record<endpointName, premiumOnlyModels[]>
   */
  const premiumEndpoints = customConfig.premiumEndpoints || {};

  // If not premium, get rid of premium endpoint models from selection
  if (!await hasPremium(req, customConfig?.premiumCheckUrl)) {
    for (const [endpoint, models] of Object.entries(premiumEndpoints)) {
      if (loadedModels[endpoint] !== undefined) {
        loadedModels[endpoint] = loadedModels[endpoint].filter(model => !models.includes(model));
      }
    }
  }

  return loadedModels;
}

/**
 * Load config endpoints from the cached configuration object
 * @function loadConfigModels
 * @param {Express.Request} req - The Express request object.
 */
async function loadConfigModels_Original(req) {
  const customConfig = await getCustomConfig();

  if (!customConfig) {
    return {};
  }

  const { endpoints = {} } = customConfig ?? {};
  const modelsConfig = {};
  const azureEndpoint = endpoints[EModelEndpoint.azureOpenAI];
  const azureConfig = req.app.locals[EModelEndpoint.azureOpenAI];
  const { modelNames } = azureConfig ?? {};

  if (modelNames && azureEndpoint) {
    modelsConfig[EModelEndpoint.azureOpenAI] = modelNames;
  }

  if (modelNames && azureEndpoint && azureEndpoint.plugins) {
    modelsConfig[EModelEndpoint.gptPlugins] = modelNames;
  }

  if (azureEndpoint?.assistants && azureConfig.assistantModels) {
    modelsConfig[EModelEndpoint.azureAssistants] = azureConfig.assistantModels;
  }

  if (!Array.isArray(endpoints[EModelEndpoint.custom])) {
    return modelsConfig;
  }

  const customEndpoints = endpoints[EModelEndpoint.custom].filter(
    (endpoint) =>
      endpoint.baseURL &&
      endpoint.apiKey &&
      endpoint.name &&
      endpoint.models &&
      (endpoint.models.fetch || endpoint.models.default),
  );

  /**
   * @type {Record<string, string[]>}
   * Map for promises keyed by unique combination of baseURL and apiKey */
  const fetchPromisesMap = {};
  /**
   * @type {Record<string, string[]>}
   * Map to associate unique keys with endpoint names; note: one key may can correspond to multiple endpoints */
  const uniqueKeyToEndpointsMap = {};
  /**
   * @type {Record<string, Partial<TEndpoint>>}
   * Map to associate endpoint names to their configurations */
  const endpointsMap = {};

  for (let i = 0; i < customEndpoints.length; i++) {
    const endpoint = customEndpoints[i];
    const { models, name: configName, baseURL, apiKey } = endpoint;
    const name = normalizeEndpointName(configName);
    endpointsMap[name] = endpoint;

    const API_KEY = extractEnvVariable(apiKey);
    const BASE_URL = extractEnvVariable(baseURL);

    const uniqueKey = `${BASE_URL}__${API_KEY}`;

    modelsConfig[name] = [];

    if (models.fetch && !isUserProvided(API_KEY) && !isUserProvided(BASE_URL)) {
      fetchPromisesMap[uniqueKey] =
        fetchPromisesMap[uniqueKey] ||
        fetchModels({
          user: req.user.id,
          baseURL: BASE_URL,
          apiKey: API_KEY,
          name,
          userIdQuery: models.userIdQuery,
        });
      uniqueKeyToEndpointsMap[uniqueKey] = uniqueKeyToEndpointsMap[uniqueKey] || [];
      uniqueKeyToEndpointsMap[uniqueKey].push(name);
      continue;
    }

    if (Array.isArray(models.default)) {
      modelsConfig[name] = models.default;
    }
  }

  const fetchedData = await Promise.all(Object.values(fetchPromisesMap));
  const uniqueKeys = Object.keys(fetchPromisesMap);

  for (let i = 0; i < fetchedData.length; i++) {
    const currentKey = uniqueKeys[i];
    const modelData = fetchedData[i];
    const associatedNames = uniqueKeyToEndpointsMap[currentKey];

    for (const name of associatedNames) {
      const endpoint = endpointsMap[name];
      modelsConfig[name] = !modelData?.length ? endpoint.models.default ?? [] : modelData;
    }
  }

  return modelsConfig;
}

module.exports = loadConfigModels;