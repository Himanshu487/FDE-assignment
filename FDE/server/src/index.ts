import "./config.js";
import { app } from "./app.js";
import { assertReadOnly } from "./db.js";

assertReadOnly();
const port=Number(process.env.PORT??4000);
app.listen(port,()=>console.log(`Kestrel API listening on http://localhost:${port}`));
