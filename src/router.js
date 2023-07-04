const Router = require("koa-router");
const router = new Router();
const tunnelController = require("./controller/tunnel");

router.get("/:transformation/:url(.*)", tunnelController.serveMedia);

module.exports = router;
