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

const port = process.env.PORT || 8080;

app.listen(port, '0.0.0.0', () => console.log(`Server running on port ${port}`));
