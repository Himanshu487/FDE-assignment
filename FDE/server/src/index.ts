import "./config.js";
import { app } from "./app.js";
import { assertReadOnly } from "./db.js";

assertReadOnly();
const port=Number(process.env.PORT??4000);
const geminiModel = process.env.GEMINI_MODEL || "gemini-3.6-flash";
console.info(`[Ask Kestrel] Gemini status: ${process.env.GEMINI_API_KEY ? `configured (${geminiModel})` : "NOT CONFIGURED — add GEMINI_API_KEY to FDE/.env"}`);
app.listen(port,()=>console.log(`Kestrel API listening on http://localhost:${port}`));
