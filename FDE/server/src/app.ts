import express from "express";
import cors from "cors";
import { analytics } from "./services/analytics.js";
import { answerQuestion } from "./services/ask.js";
import { getFreight } from "./services/freight.js";
import { assertReadOnly } from "./db.js";

export const app = express();
app.use(cors()); app.use(express.json());
const region = (value: unknown) => value === undefined || value === "" || value === "all" ? null : Number(value);

app.get("/api/health", (_req,res) => { assertReadOnly(); res.json({status:"ok",database:"read-only"}); });
app.get("/api/dashboard", async (req,res,next) => { try { const regionId=region(req.query.region); const data=analytics.getDashboard(regionId); const freight=await getFreight(data.context.quarter,regionId); res.json({...data,freight}); } catch(e){next(e);} });
app.get("/api/ask", async (req,res,next) => { try {
  const q=String(req.query.q??""); if(!q.trim()) return res.status(400).json({error:"Question is required"});
  const regionId=region(req.query.region);
  if(q.toLowerCase().includes("freight") && q.toLowerCase().includes("warehouse")) {
    const context=analytics.getReportContext(); const freight=await getFreight(context.quarter,regionId);
    return res.json({intent:"freight_by_warehouse",title:"Freight cost per delivered case by warehouse",explanation:freight.status==="available"?"Partner invoice paise converted to INR and divided by historical-pack delivered cases.":"Freight is unavailable because the partner API is not configured or reachable. Fuel cost was not substituted.",columns:["name","value","cost","deliveredCases"],rows:freight.byWarehouse});
  }
  res.json(answerQuestion(q,regionId));
} catch(e){next(e);} });
app.use((error: unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{ console.error(error); res.status(500).json({error:"Analytics request failed"}); });
