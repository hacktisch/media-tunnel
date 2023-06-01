require("dotenv").config();
const Koa = require("koa");
const router = require("./router");
//const corsMiddleware = require('@koa/cors'); //enable if needed

const app = new Koa();
//app.proxy = true;

app
   //.use(corsMiddleware())
   .use(router.routes())
   .use(router.allowedMethods());

app.listen(4444, () => console.log("running on port 4444"));
