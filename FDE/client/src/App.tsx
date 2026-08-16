import {useEffect,useState} from "react";
import {Bar,BarChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis} from "recharts";

type Row=Record<string,number|string|null>;
type Data=any;
const pct=(v:number|null)=>v==null?"—":`${v.toFixed(1)}%`;
const inr=(v:number|null)=>v==null?"—":new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0,notation:v>999999?"compact":"standard"}).format(v);
const number=(v:number|null)=>v==null?"—":new Intl.NumberFormat("en-IN",{maximumFractionDigits:0}).format(v);

function Metric({label,value,detail,tone}:{label:string;value:string;detail:string;tone?:string}){return <div className={`metric ${tone??""}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>}
function Table({rows,kind="service"}:{rows:Row[];kind?:"service"|"late"}){return <div className="table"><div className="tr th"><span>Name</span><span>{kind==="late"?"Late >2h":"Case fill"}</span><span>Volume</span></div>{rows.map((r,i)=><div className="tr" key={`${r.id??r.name}-${i}`}><span><b>{String(r.name)}</b></span><span className={Number(kind==="late"?r.late_pct:r.case_fill)<80||kind==="late"?"bad":""}>{pct(Number(kind==="late"?r.late_pct:r.case_fill))}</span><span>{number(Number(kind==="late"?r.deliveries:r.orders))}</span></div>)}</div>}

export default function App(){
 const [region,setRegion]=useState("all"),[data,setData]=useState<Data>(),[error,setError]=useState(""),[loading,setLoading]=useState(true);

 const [question,setQuestion]=useState("Five outlets with lowest case fill rate last month"),[answer,setAnswer]=useState<any>(),[asking,setAsking]=useState(false);
 
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError("");fetch(`/api/dashboard?region=${region}`,{signal:controller.signal}).then(async r=>{if(!r.ok){const body=await r.json().catch(()=>null);throw Error(body?.error??`Analytics API returned ${r.status}`)}return r.json()}).then(setData).catch(e=>{if(e.name!=="AbortError")setError(`${e.message}. Make sure the root \"npm run dev\" command is running.`)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort()},[region]);
 
 const ask=async(e:React.FormEvent)=>{e.preventDefault();setAsking(true);try{const r=await fetch(`/api/ask?q=${encodeURIComponent(question)}&region=${region}`);setAnswer(await r.json())}finally{setAsking(false)}};
 
 console.log('loading 22',loading);

 if(loading)return <main className="state"><div className="spinner"/><h2>Loading the control tower…</h2><p>Aggregating 500k+ order lines in read-only SQLite.</p></main>;
 
 if(error)return <main className="state"><h2>Control tower unavailable</h2><p>{error}</p><button onClick={()=>location.reload()}>Retry</button></main>;
 
 const s=data.service,r=data.returns,c=data.coldChain,f=data.freight;
 
 return <div className="app">
  <header><div className="brand"><div className="mark">K</div><div><b>KESTREL PROVISIONS</b><span>Supply Chain Control Tower</span></div></div><div className="period"><span>REPORTING PERIOD</span><b>{data.context.quarter.label} · Apr–Jun 2026</b><small>Data through {data.context.reportDate}</small></div><label className="filter"><span>VIEW</span><select value={region} onChange={e=>setRegion(e.target.value)}><option value="all">All India</option>{data.regions.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label></header>
  <main>
   <section className="metrics">
    <Metric label="Each fill rate" value={pct(s.eachFill.value)} detail={`${number(s.eachFill.numerator)} / ${number(s.eachFill.denominator)} eaches`}/>
    <Metric label="Case fill rate" value={pct(s.caseFill.value)} detail={`${number(s.caseFill.numerator)} / ${number(s.caseFill.denominator)} cases`}/>
    <Metric label="OTIF" value={pct(s.otif.value)} detail={`${number(s.otif.numerator)} / ${number(s.otif.denominator)} orders`} tone="critical"/>
    <Metric label="Freight / delivered case" value={f.status==="available"?inr(f.value):"Unavailable"} detail={f.status==="available"?`${inr(f.numerator)} across ${number(f.denominator)} cases`:"Partner API not configured — no fuel-cost fallback"} tone={f.status==="available"?"":"muted"}/>
    <Metric label="Returns" value={pct(r.returnRate.value)} detail={`${inr(r.approvedValue)} approved / ${inr(r.deliveredValue)} delivered`}/>
   </section>
   <section className="attention panel"><div className="section-title"><div><span className="eyebrow">EXCEPTION QUEUE</span><h2>Needs attention</h2></div><p>Lowest service performance first. Outlet view uses last complete month; other views use the quarter.</p></div><div className="attention-grid"><div><h3>Lowest-fill outlets <em>June</em></h3><Table rows={data.attention.outlets}/></div><div><h3>Lowest-fill routes <em>Quarter</em></h3><Table rows={data.attention.routes}/></div><div><h3>Routes repeatedly &gt;2h late</h3><Table rows={data.attention.lateRoutes.slice(0,5)} kind="late"/></div></div></section>
   <section className="grid-2">
    <div className="panel"><div className="section-title"><div><span className="eyebrow">MONEY / RETURNS</span><h2>Leakage concentration</h2></div><b className="amount">{inr(r.approvedValue)}</b></div><div className="chart"><ResponsiveContainer><BarChart data={r.drivers} layout="vertical" margin={{left:10,right:25}}><CartesianGrid strokeDasharray="2 4" horizontal={false}/><XAxis type="number" hide/><YAxis dataKey="name" type="category" width={92} tick={{fontSize:11}}/><Tooltip formatter={(v)=>inr(Number(v))}/><Bar dataKey="value" fill="#c5643c" radius={[0,5,5,0]}/></BarChart></ResponsiveContainer></div><div className="callout">Leading reason <b>{String(r.reasons[0]?.name).replace(/^RT\d+_/,"").replaceAll("_"," ")}</b><span>{inr(Number(r.reasons[0]?.value))} approved</span></div></div>
    <div className="panel cold"><div className="section-title"><div><span className="eyebrow">COLD CHAIN</span><h2>Product integrity</h2></div><span className="snapshot">Snapshot {c.snapshotDate}</span></div><div className="cold-grid"><Metric label="Excursions / 100 chilled deliveries" value={c.excursionRate.value?.toFixed(1)??"—"} detail={`${number(c.excursionRate.numerator)} / ${number(c.excursionRate.denominator)} chilled deliveries`} tone="critical"/><Metric label="Near expiry ≤30 days" value={`${number(c.nearExpiryCases)} cases`} detail={`${number(c.nearExpiryBatches)} batches available`}/><Metric label="Chilled credit leakage" value={inr(c.coldCreditValue)} detail={`${number(c.coldCreditCount)} approved notes`}/></div></div>
   </section>
   <section className="panel ask"><div className="ask-copy"><span className="eyebrow">TRUSTED ANALYTICS</span><h2>Ask Kestrel</h2><p>Plain-English access to deterministic, reviewed queries. No generated SQL.</p><div className="chips">{["OTIF by region","Categories driving return value","Temperature excursions per 100 chilled deliveries","Routes >2 hours late"].map(q=><button key={q} onClick={()=>setQuestion(q)}>{q}</button>)}</div></div><div className="ask-box"><form onSubmit={ask}><input value={question} onChange={e=>setQuestion(e.target.value)} aria-label="Question"/><button disabled={asking}>{asking?"Working…":"Ask →"}</button></form>{answer&&<div className="answer"><b>{answer.title}</b><p>{answer.explanation}</p>{answer.rows?.length>0&&<div className="answer-rows">{answer.rows.slice(0,5).map((x:Row,i:number)=><div key={i}><span>{String(x.name??x.month??x.sku_code??`Result ${i+1}`)}</span><b>{x.case_fill!=null?pct(Number(x.case_fill)):x.otif!=null?pct(Number(x.otif)):x.value!=null?inr(Number(x.value)):x.excursions_per_100!=null?String(x.excursions_per_100):""}</b></div>)}</div>}</div>}</div></section>
  </main><footer>Definitions & assumptions are documented in README.md · Source database opened read-only · Freight never uses driver-entered fuel cost</footer>
 </div>
}
