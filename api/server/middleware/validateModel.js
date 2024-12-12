const {ViolationTypes} = require('librechat-data-provider');
const {getModelsConfig} = require('~/server/controllers/ModelController');
const {handleError} = require('~/server/utils');
const {logViolation} = require('~/cache');
const {getCustomConfig} = require("~/server/services/Config/getCustomConfig");

/**
 * Validates the model of the request.
 *
 * @async
 * @param {Express.Request} req - The Express request object.
 * @param {Express.Response} res - The Express response object.
 * @param {Function} next - The Express next function.
 */
const validateModel = async (req, res, next) => {
  const {model, endpoint} = req.body;
  if (!model) {
    return handleError(res, {text: 'Model not provided'});
  }

  const modelsConfig = await getModelsConfig(req);
  const {premiumEndpoints, premiumErrorMessage} = await getCustomConfig();
  if (!modelsConfig) {
    return handleError(res, {text: 'Models not loaded'});
  }
  const availableModels = modelsConfig[endpoint];
  if (!availableModels) {
    return handleError(res, {text: 'Endpoint models not loaded'});
  }

  let validModel = !!availableModels.find((availableModel) => availableModel === model);

  if (validModel) {
    return next();
  }
  if (premiumEndpoints[endpoint] && premiumEndpoints[endpoint].includes(model)) {
    return handleError(res, {text: premiumErrorMessage || "No permission to use this model." });
  }
  const {ILLEGAL_MODEL_REQ_SCORE: score = 5} = process.env ?? {};

  const type = ViolationTypes.ILLEGAL_MODEL_REQUEST;
  const errorMessage = {
    type,
  };

  await logViolation(req, res, type, errorMessage, score);
  return handleError(res, {text: 'Illegal model request'});
};

module.exports = validateModel;
