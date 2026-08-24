import express from "express";
import cors from "cors";
import { analytics } from "./services/analytics.js";
import { answerWithGemini } from "./services/gemini.js";
import { assertReadOnly } from "./db.js";

export const app = express();
app.use(cors()); app.use(express.json());
const region = (value: unknown) => value === undefined || value === "" || value === "all" ? null : Number(value);

app.get("/api/health", (_req,res) => { assertReadOnly(); res.json({status:"ok",database:"read-only"}); });
app.get("/api/dashboard", (req,res,next) => { try { const regionId=region(req.query.region); res.json(analytics.getDashboard(regionId)); } catch(e){next(e);} });
const chat = async (req: express.Request, res: express.Response, next: express.NextFunction) => { try {
  const q=String(req.body?.question??""); if(!q.trim()) return res.status(400).json({error:"Question is required"});
  const regionId=region(req.body?.region);
  res.json(await answerWithGemini(q,regionId));
} catch(e){next(e);} };
app.post("/api/chat", chat);
app.post("/api/ask", chat);
app.use((error: unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{ console.error(error); const message=error instanceof Error?error.message:"Analytics request failed"; res.status(message.includes("Question")?400:500).json({error:message}); });
