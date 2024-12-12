# Fork Changes

Fork exists to restrict roles based on permissions afforded to a given e-mail.  

Implicated files:

- [`config.ts`](./packages/data-provider/src/config.ts) to add custom premium config options
- [`loadConfigModels.js`](./api/server/services/Config/loadConfigModels.js) to filter non-premium models, check if premium
- [`ModelController.js`](./api/server/controllers/ModelController.js) to remove model cache since we need to validate for each user each time
- [`validateModel.js`](./api/server/middleware/validateModel.js) to customize the error if someone tries to chat with a model they no longer have access to