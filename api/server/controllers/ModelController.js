const {loadDefaultModels, loadConfigModels} = require('~/server/services/Config');

/**
 * @param {ServerRequest} req
 */
const getModelsConfig = async (req) => {
  // Can't use cache here because we need to dynamically load models based on permissions
  return await loadModels(req);
};

/**
 * Loads the models from the config.
 * @param {ServerRequest} req - The Express request object.
 * @returns {Promise<TModelsConfig>} The models config.
 */
async function loadModels(req) {
  // Can't cache this because we need to dynamically load models based on
  const defaultModelsConfig = await loadDefaultModels(req);
  const customModelsConfig = await loadConfigModels(req);
  return { ...defaultModelsConfig, ...customModelsConfig};
}

async function modelController(req, res) {
  const modelConfig = await loadModels(req);
  res.send(modelConfig);
}

module.exports = {modelController, loadModels, getModelsConfig};
