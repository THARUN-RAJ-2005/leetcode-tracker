import { useRouter } from "next/router";
import { useState, useEffect, useCallback, useRef } from "react";
import Head from "next/head";
import { MEMBER_DISPLAY } from "@/students_list";

// ── Types ──────────────────────────────────────────────────────────────────────
interface LeaderboardEntry  { username: string; solve_count: number; }
interface WeeklyEntry       { username: string; total_solves: number; }
interface DailyBreakdownRow { username: string; date: string; solve_count: number; }
interface SyncResult { username:string; todayCount:number; backfilledDates:string[]; status:"ok"|"error"; error?:string; }
interface ApiData {
  todayStr:string; weekStart:string; weekEnd:string; members:string[];
  todayLeaderboard:LeaderboardEntry[]; weeklyLeaderboard:WeeklyEntry[]; nextRefreshMs:number;
}
interface BatchEvent {
  batchIndex:number; totalBatches:number; batchResults:SyncResult[];
  todayLeaderboard:LeaderboardEntry[]; weeklyLeaderboard:WeeklyEntry[];
  todayStr:string; weekStart:string; weekEnd:string; members:string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const DN = MEMBER_DISPLAY as Record<string,string>;
function dn(u:string){ return DN[u]||u; }
function fmt(d:string){
  return new Date(d+"T00:00:00Z").toLocaleDateString("en-IN",{weekday:"short",month:"short",day:"numeric",timeZone:"UTC"});
}

// Color scale: 0=red, 1-2=orange, 3-4=amber, 5-7=lime, 8+=green
function sc(n:number){ return n===0?"#ef4444":n<=2?"#f97316":n<=4?"#eab308":n<=7?"#84cc16":"#22c55e"; }
function sbg(n:number){ return n===0?"rgba(239,68,68,.15)":n<=2?"rgba(249,115,22,.15)":n<=4?"rgba(234,179,8,.15)":n<=7?"rgba(132,204,22,.15)":"rgba(34,197,94,.15)"; }
function sbd(n:number){ return n===0?"rgba(239,68,68,.4)":n<=2?"rgba(249,115,22,.4)":n<=4?"rgba(234,179,8,.4)":n<=7?"rgba(132,204,22,.4)":"rgba(34,197,94,.4)"; }
function hue(v:number,max:number){ return `hsl(${Math.round((v/Math.max(max,1))*120)},85%,52%)`; }
function cs(v:number):React.CSSProperties{
  if(v===0) return {background:"var(--bg)",color:"var(--border)"};
  return {background:sbg(v),color:sc(v),border:`1px solid ${sbd(v)}`,fontWeight:v>=5?700:400};
}

// Dedup + sort (fix duplicates)
function dedupeAndSort(rows:LeaderboardEntry[]):LeaderboardEntry[]{
  const m=new Map<string,LeaderboardEntry>();
  for(const r of rows) m.set(r.username,r);
  return [...m.values()].sort((a,b)=>b.solve_count-a.solve_count||a.username.toLowerCase().localeCompare(b.username.toLowerCase()));
}
function dedupeAndSortWeekly(rows:WeeklyEntry[]):WeeklyEntry[]{
  const m=new Map<string,WeeklyEntry>();
  for(const r of rows) m.set(r.username,r);
  return [...m.values()].sort((a,b)=>b.total_solves-a.total_solves||a.username.toLowerCase().localeCompare(b.username.toLowerCase()));
}

// ── Leaderboard Row ────────────────────────────────────────────────────────────
function LeaderRow({entry,globalRank,prevRank,justUpdated,max,type}:{
  entry:LeaderboardEntry|WeeklyEntry; globalRank:number; prevRank:number|null;
  justUpdated:boolean; max:number; type:"today"|"week";
}){
  const count = type==="today"?(entry as LeaderboardEntry).solve_count:(entry as WeeklyEntry).total_solves;
  const rankChange = prevRank!==null ? prevRank-globalRank : 0;

  // Rank display: top 3 = medal emoji, rest = #N
  const rankDisplay = globalRank===1?"🥇":globalRank===2?"🥈":globalRank===3?"🥉":`#${globalRank}`;
  const isMedal = globalRank<=3;

  // Full name: everything bold uppercase
  const fullName = dn(entry.username).trim().toUpperCase();

  const barPct = max>0?(count/max)*100:0;
  const barColor = hue(count,max);

  return(
    <div className={`lr${justUpdated?" lr-flash":""}${rankChange>0?" lr-up":rankChange<0?" lr-down":""}`}>

      {/* Rank column */}
      <div className="lr-rank-col">
        <span className={`lr-rank-txt${isMedal?" lr-medal":""}`}>{rankDisplay}</span>
        {rankChange!==0&&(
          <span className={`lr-delta ${rankChange>0?"d-up":"d-down"}`}>
            {rankChange>0?`↑${rankChange}`:`↓${Math.abs(rankChange)}`}
          </span>
        )}
      </div>

      {/* Name + bar column */}
      <div className="lr-body">
        <span className="lr-fullname">{fullName}</span>
        <span className="lr-username">{entry.username}</span>
        {/* Progress bar under name */}
        <div className="lr-bar-track">
          <div className="lr-bar-fill" style={{width:`${barPct}%`,background:barColor}}/>
        </div>
      </div>

      {/* Score column */}
      <div className="lr-score-col">
        <span className="lr-score-badge" style={{color:sc(count),background:sbg(count),border:`1px solid ${sbd(count)}`}}>
          {count}
        </span>
        <span className="lr-solved-lbl">solved</span>
      </div>

    </div>
  );
}

// ── Board Section ──────────────────────────────────────────────────────────────
function BoardSection({type,rows,prevRows,updatedUsernames,loadMore,hasMore,loadingMore,search,setSearch,total}:{
  type:"today"|"week"; rows:(LeaderboardEntry|WeeklyEntry)[]; prevRows:(LeaderboardEntry|WeeklyEntry)[];
  updatedUsernames:Set<string>; loadMore:()=>void; hasMore:boolean; loadingMore:boolean;
  search:string; setSearch:(s:string)=>void; total:number;
}){
  const max = Math.max(1,...rows.map((r)=>type==="today"?(r as LeaderboardEntry).solve_count:(r as WeeklyEntry).total_solves));
  const globalRankMap = new Map(rows.map((r,i)=>[r.username,i+1]));
  const prevRankMap   = new Map(prevRows.map((r,i)=>[r.username,i+1]));

  const q = search.toLowerCase();
  const displayed = q
    ? rows.filter((r)=>r.username.toLowerCase().includes(q)||dn(r.username).toLowerCase().includes(q))
    : rows;

  return(
    <div>
      {/* Search */}
      <div className="search-wrap">
        <div className="search-box">
          <span className="s-icon">⌕</span>
          <input className="s-input" placeholder="Search by name or username..."
            value={search} onChange={(e)=>setSearch(e.target.value)}/>
          {search&&<button className="s-clear" onClick={()=>setSearch("")}>✕</button>}
        </div>
        <span className="s-count">
          {search?`${displayed.length} result${displayed.length!==1?"s":""} — global ranks shown`
            :`${rows.length} of ${total} members`}
        </span>
      </div>

      {/* Column header */}
      <div className="lr-header">
        <span>RANK</span>
        <span>CODER</span>
        <span>{type==="today"?"TODAY":"WEEKLY"}</span>
      </div>

      {/* Rows */}
      <div className="lr-list">
        {displayed.map((u)=>(
          <LeaderRow key={u.username} entry={u}
            globalRank={globalRankMap.get(u.username)??0}
            prevRank={prevRankMap.get(u.username)??null}
            justUpdated={updatedUsernames.has(u.username)}
            max={max} type={type}/>
        ))}
        {displayed.length===0&&<p className="no-data">No results for "{search}"</p>}
      </div>

      {(hasMore||loadingMore)&&!search&&(
        <div className="lmr">
          {loadingMore
            ?<span className="load-spin"><span className="mini-spin"/>Loading…</span>
            :<button className="lm-btn" onClick={loadMore}>↓ LOAD NEXT 20</button>}
        </div>
      )}
    </div>
  );
}

// ── History Tab ────────────────────────────────────────────────────────────────
function HistoryTab({members,weekStart,weekEnd}:{members:string[];weekStart:string;weekEnd:string;}){
  const [allRows,setAllRows]     =useState<DailyBreakdownRow[]>([]);
  const [total,setTotal]         =useState(0);
  const [loading,setLoading]     =useState(false);
  const [error,setError]         =useState<string|null>(null);
  const [search,setSearch]       =useState("");
  const [exporting,setExporting] =useState<"csv"|"pdf"|null>(null);
  const loadedRef=useRef(false);

  const load=useCallback(async()=>{
    setLoading(true);setError(null);
    try{
      const res=await fetch(`/api/history?start=${weekStart}&end=${weekEnd}`);
      if(!res.ok) throw new Error(`Error ${res.status}`);
      const data=await res.json();
      setAllRows(data.rows||[]);setTotal(data.total||0);
    }catch(e){setError(e instanceof Error?e.message:"Failed");}
    finally{setLoading(false);}
  },[weekStart,weekEnd]);

  useEffect(()=>{if(!loadedRef.current){loadedRef.current=true;load();}},[load]);

  const q=search.toLowerCase();
  const filtered=q?allRows.filter((r)=>r.username.toLowerCase().includes(q)||dn(r.username).toLowerCase().includes(q)):allRows;

  const dateSet=new Set<string>();
  for(const r of filtered) dateSet.add(r.date);
  const days=[...dateSet].sort((a,b)=>a.localeCompare(b));
  const matMap:Record<string,number>={};
  for(const r of filtered) matMap[`${r.username}__${r.date}`]=r.solve_count;

  const memberList=search?[...new Set(filtered.map((r)=>r.username))]:members;
  const memberRows=memberList
    .map((m)=>({m,total:days.reduce((s,d)=>s+(matMap[`${m}__${d}`]||0),0)}))
    .sort((a,b)=>b.total-a.total||a.m.toLowerCase().localeCompare(b.m.toLowerCase()));

  async function exportCsv(){
    setExporting("csv");
    try{
      const res=await fetch(`/api/history?export=csv&start=${weekStart}&end=${weekEnd}${search?`&search=${encodeURIComponent(search)}`:""}`);
      const blob=await res.blob();
      const a=document.createElement("a");
      a.href=URL.createObjectURL(blob);a.download=`lc-history-${weekStart}-${weekEnd}.csv`;a.click();
      URL.revokeObjectURL(a.href);
    }finally{setExporting(null);}
  }

  async function exportPdf(){
    setExporting("pdf");
    try{
      const res=await fetch(`/api/history?export=pdf&start=${weekStart}&end=${weekEnd}${search?`&search=${encodeURIComponent(search)}`:""}`);
      const data=await res.json();
      const rows:DailyBreakdownRow[]=data.rows;
      const dE=[...new Set(rows.map((r)=>r.date))].sort();
      const mE=[...new Set(rows.map((r)=>r.username))];
      const mMap:Record<string,number>={};
      for(const r of rows) mMap[`${r.username}__${r.date}`]=r.solve_count;
      const sorted=mE.map((m)=>({m,tot:dE.reduce((s,d)=>s+(mMap[`${m}__${d}`]||0),0)}))
        .sort((a,b)=>b.tot-a.tot||a.m.toLowerCase().localeCompare(b.m.toLowerCase()));
      const win=window.open("","_blank");if(!win) return;
      win.document.write(`<html><head><title>LC History</title>
        <style>body{font-family:sans-serif;font-size:10px;padding:12px;}
        table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ccc;padding:3px 6px;text-align:center;}
        th{background:#111;color:#fff;font-weight:700;}.nm{text-align:left;white-space:nowrap;}.z{color:#ccc;}</style>
        </head><body>
        <h2 style="margin-bottom:8px;">LeetCode History: ${weekStart} → ${weekEnd}</h2>
        <table><thead><tr><th>S.No</th><th class="nm">Name</th>${dE.map((d)=>`<th>${d}</th>`).join("")}<th>Total</th></tr></thead>
        <tbody>${sorted.map(({m,tot},idx)=>
          `<tr><td>${idx+1}</td><td class="nm">${dn(m)}</td>${dE.map((d)=>{const v=mMap[`${m}__${d}`]||0;return`<td class="${v===0?"z":""}">${v||"·"}</td>`;}).join("")}<td><b>${tot}</b></td></tr>`
        ).join("")}</tbody></table></body></html>`);
      win.document.close();win.print();
    }finally{setExporting(null);}
  }

  return(
    <section className="hist-section">
      <div className="hist-toolbar">
        <div className="search-box" style={{flex:1,maxWidth:440}}>
          <span className="s-icon">⌕</span>
          <input className="s-input" placeholder="Search by name or username..."
            value={search} onChange={(e)=>setSearch(e.target.value)}/>
          {search&&<button className="s-clear" onClick={()=>setSearch("")}>✕</button>}
        </div>
        <div className="hist-right">
          <span className="hist-count">
            {loading?"Loading…":<><strong>{memberRows.length}</strong> members · <strong>{days.length}</strong> dates</>}
          </span>
          <div className="legend-row">
            {[{l:"0",n:0},{l:"1–2",n:1},{l:"3–4",n:3},{l:"5–7",n:5},{l:"8+",n:8}].map(({l,n})=>(
              <span key={l} className="h-pill" style={{color:sc(n),background:sbg(n),border:`1px solid ${sbd(n)}`}}>{l}</span>
            ))}
          </div>
          <div className="export-btns">
            <button className="exp-btn csv-btn" onClick={exportCsv} disabled={!!exporting||loading}>{exporting==="csv"?"…":"⬇ CSV"}</button>
            <button className="exp-btn pdf-btn" onClick={exportPdf} disabled={!!exporting||loading}>{exporting==="pdf"?"…":"⬇ PDF"}</button>
          </div>
        </div>
      </div>

      {error&&<p className="h-err">⚠ {error}</p>}

      {loading?(
        <div className="h-loading"><span className="mini-spin"/>Loading all records…</div>
      ):days.length===0?(
        <p className="no-data">{search?"No results.":"No history yet."}</p>
      ):(
        <div className="mat-outer">
          <table className="mat">
            <thead>
              <tr>
                <th className="th-sticky th-sn">S.No</th>
                <th className="th-sticky th-name">CODER</th>
                {days.map((d)=><th key={d} className="th-date">{fmt(d)}</th>)}
                <th className="th-sticky-right th-total">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {memberRows.map(({m,total:rt},idx)=>(
                <tr key={m}>
                  <td className="td-sticky mat-sn">{idx+1}</td>
                  <td className="td-sticky mat-name">
                    {dn(m)}<span className="mat-lc">{m}</span>
                  </td>
                  {days.map((d)=>{const v=matMap[`${m}__${d}`]||0;return<td key={d} className="mat-cell" style={cs(v)}>{v>0?v:"·"}</td>;})}
                  <td className="td-sticky-right mat-total" style={{color:sc(Math.min(rt,8)),fontWeight:700}}>{rt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function Home(){
  const router=useRouter();
  const [data,setData]                         =useState<ApiData|null>(null);
  const [todayRows,setTodayRows]               =useState<LeaderboardEntry[]>([]);
  const [weekRows,setWeekRows]                 =useState<WeeklyEntry[]>([]);
  const [prevTodayRows,setPrevTodayRows]       =useState<LeaderboardEntry[]>([]);
  const [prevWeekRows,setPrevWeekRows]         =useState<WeeklyEntry[]>([]);
  const [updatedToday,setUpdatedToday]         =useState<Set<string>>(new Set());
  const [updatedWeek,setUpdatedWeek]           =useState<Set<string>>(new Set());
  const [loading,setLoading]                   =useState(true);
  const [streamProgress,setStreamProgress]     =useState<{done:number;total:number}|null>(null);
  const [streamDone,setStreamDone]             =useState(false);
  const [error,setError]                       =useState<string|null>(null);
  const [lastRefresh,setLastRefresh]           =useState<string|null>(null);
  const [tab,setTab]                           =useState<"today"|"week"|"history">("today");
  const [authChecked,setAuthChecked]           =useState(false);
  const [isAdmin,setIsAdmin]                   =useState(false);
  const [nextMs,setNextMs]                     =useState<number|null>(null);
  const [todayHasMore,setTodayHasMore]         =useState(false);
  const [weekHasMore,setWeekHasMore]           =useState(false);
  const [todayTotal,setTodayTotal]             =useState(0);
  const [weekTotal,setWeekTotal]               =useState(0);
  const [loadingMoreToday,setLoadingMoreToday] =useState(false);
  const [loadingMoreWeek,setLoadingMoreWeek]   =useState(false);
  const [todayPage,setTodayPage]               =useState(0);
  const [weekPage,setWeekPage]                 =useState(0);
  const [searchToday,setSearchToday]           =useState("");
  const [searchWeek,setSearchWeek]             =useState("");
  const timerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const cdRef   =useRef<ReturnType<typeof setInterval>|null>(null);
  const esRef   =useRef<EventSource|null>(null);

  function flashUpdated(names:string[],setter:(s:Set<string>)=>void){
    setter(new Set(names));setTimeout(()=>setter(new Set()),2200);
  }

  const loadFromDb=useCallback(async()=>{
    try{
      const res=await fetch("/api/sync");
      if(res.status===401){router.replace("/login");return;}
      if(!res.ok) throw new Error(`Error ${res.status}`);
      const json:ApiData=await res.json();
      setData(json);
      const td=dedupeAndSort(json.todayLeaderboard);
      const wd=dedupeAndSortWeekly(json.weeklyLeaderboard);
      setTodayRows(td);setWeekRows(wd);
      setPrevTodayRows(td);setPrevWeekRows(wd);
      setTodayTotal(json.todayLeaderboard.length);setWeekTotal(json.weeklyLeaderboard.length);
      setTodayHasMore(json.todayLeaderboard.length<196);setWeekHasMore(json.weeklyLeaderboard.length<196);
      setLastRefresh(new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}));
      const ms=json.nextRefreshMs??20*60*1000;
      setNextMs(ms);
      if(cdRef.current) clearInterval(cdRef.current);
      let rem=ms;
      cdRef.current=setInterval(()=>{rem-=1000;if(rem<=0){clearInterval(cdRef.current!);setNextMs(null);}else setNextMs(rem);},1000);
    }catch(e){setError(e instanceof Error?e.message:"Failed to load");}
    finally{setLoading(false);}
  },[router]);

  const openStream=useCallback(()=>{
    if(esRef.current) esRef.current.close();
    setStreamDone(false);setStreamProgress(null);
    const es=new EventSource("/api/sync/stream");
    esRef.current=es;

    es.addEventListener("batch",(e)=>{
      const p:BatchEvent=JSON.parse(e.data);
      setStreamProgress({done:p.batchIndex+1,total:p.totalBatches});
      const updated=p.batchResults.filter((r)=>r.status==="ok").map((r)=>r.username);
      const nt=dedupeAndSort(p.todayLeaderboard);
      const nw=dedupeAndSortWeekly(p.weeklyLeaderboard);
      setPrevTodayRows((prev)=>prev.length?prev:nt);
      setPrevWeekRows((prev)=>prev.length?prev:nw);
      setTodayRows(nt);setWeekRows(nw);
      setTodayTotal(nt.length);setWeekTotal(nw.length);
      setTodayHasMore(nt.length<196);setWeekHasMore(nw.length<196);
      flashUpdated(updated,setUpdatedToday);flashUpdated(updated,setUpdatedWeek);
      setLastRefresh(new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}));
      setTimeout(()=>{setPrevTodayRows(nt);setPrevWeekRows(nw);},2300);
    });

    es.addEventListener("complete",()=>{
      setStreamDone(true);setStreamProgress(null);
      es.close();esRef.current=null;
      if(timerRef.current) clearTimeout(timerRef.current);
      timerRef.current=setTimeout(()=>{loadFromDb();openStream();},20*60*1000);
    });

    es.addEventListener("error",()=>{es.close();esRef.current=null;setStreamDone(true);});
  },[loadFromDb]);

  useEffect(()=>{
    fetch("/api/auth/me").then((r)=>r.json()).then((d)=>{
      if(!d.loggedIn){router.replace("/login");return;}
      setAuthChecked(true);setIsAdmin(d.user?.isAdmin||false);
      loadFromDb().then(()=>openStream());
    }).catch(()=>router.replace("/login"));
    return()=>{
      if(timerRef.current) clearTimeout(timerRef.current);
      if(cdRef.current) clearInterval(cdRef.current);
      if(esRef.current) esRef.current.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  function manualRefresh(){
    if(esRef.current){esRef.current.close();esRef.current=null;}
    setLoading(true);setStreamDone(false);setTodayPage(0);setWeekPage(0);
    setTodayRows([]);setWeekRows([]);
    loadFromDb().then(()=>openStream());
  }

  async function loadMoreToday(){
    setLoadingMoreToday(true);
    try{
      const next=todayPage+1;
      const res=await fetch(`/api/leaderboard?type=today&page=${next}`);
      if(!res.ok) return;
      const d=await res.json();
      setTodayRows((prev)=>dedupeAndSort([...prev,...d.rows]));
      setTodayPage(next);setTodayHasMore(d.hasMore);setTodayTotal(d.total);
    }finally{setLoadingMoreToday(false);}
  }

  async function loadMoreWeek(){
    setLoadingMoreWeek(true);
    try{
      const next=weekPage+1;
      const res=await fetch(`/api/leaderboard?type=week&page=${next}`);
      if(!res.ok) return;
      const d=await res.json();
      setWeekRows((prev)=>dedupeAndSortWeekly([...prev,...d.rows]));
      setWeekPage(next);setWeekHasMore(d.hasMore);setWeekTotal(d.total);
    }finally{setLoadingMoreWeek(false);}
  }

  function fmtCd(ms:number){const m=Math.floor(ms/60000),s=Math.floor((ms%60000)/1000);return`${m}:${String(s).padStart(2,"0")}`;}

  if(!authChecked) return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#0d0d0d"}}>
      <div style={{width:32,height:32,border:"2px solid #2a2d35",borderTopColor:"#00e5a0",borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const pct=streamProgress?Math.round((streamProgress.done/streamProgress.total)*100):0;

  return(
    <>
      <Head>
        <title>LeetCode Progress Tracker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      </Head>
      <div className="root">

        {/* Header */}
        <header className="header">
          <div className="hl">
            <span className="logo-lc">[LC]</span>
            <span className="title">Progress Tracker</span>
            <span className="sub-tag">196 Members</span>
          </div>
          <div className="hr">
            {nextMs&&<span className="cd-badge">↻ {fmtCd(nextMs)}</span>}
            {lastRefresh&&<span className="last-ref">Updated {lastRefresh}</span>}
            <button className={`btn-outline${loading?" btn-dim":""}`} onClick={manualRefresh}
              disabled={loading||!!streamProgress}>
              {loading?"Loading…":streamProgress?`Syncing ${pct}%`:"↻ Refresh"}
            </button>
            {isAdmin&&<button className="btn-outline btn-cyan" onClick={()=>router.push("/admin")}>⚙ Admin</button>}
            <button className="btn-ghost" onClick={async()=>{await fetch("/api/auth/logout",{method:"POST"});router.replace("/login");}}>Logout</button>
          </div>
        </header>

        {/* Sync progress bar */}
        {streamProgress&&(
          <div className="prog-strip">
            <div className="prog-fill" style={{width:`${pct}%`}}/>
            <span className="prog-lbl">Syncing {streamProgress.done}/{streamProgress.total} — {pct}%</span>
          </div>
        )}
        {streamDone&&!streamProgress&&<div className="done-strip">✓ All profiles synced</div>}
        {error&&<div className="err-strip">⚠ {error}</div>}

        {loading&&(
          <div className="loading-screen">
            <div className="mini-spin" style={{width:40,height:40,borderWidth:3}}/>
            <p style={{marginTop:"1.2rem",color:"#00e5a0",fontSize:".9rem"}}>Loading leaderboard…</p>
            <p style={{marginTop:".4rem",color:"#6b7280",fontSize:".72rem"}}>Reading from database</p>
          </div>
        )}

        {!loading&&data&&(
          <main className="main">

            {/* Date info */}
            <div className="date-row">
              <span className="date-lbl">TODAY</span>
              <span className="date-val">{fmt(data.todayStr)}</span>
              <span className="date-sep">·</span>
              <span className="date-lbl">WEEK</span>
              <span className="date-val">{fmt(data.weekStart)} → {fmt(data.weekEnd)}</span>
            </div>

            {/* Tabs */}
            <div className="tabs">
              {(["today","week","history"] as const).map((t)=>(
                <button key={t} className={`tab${tab===t?" tab-active":""}`} onClick={()=>setTab(t)}>
                  {t==="today"?"TODAY'S BOARD":t==="week"?"WEEKLY BOARD":"FULL HISTORY"}
                </button>
              ))}
            </div>

            {tab==="today"&&(
              <BoardSection type="today" rows={todayRows} prevRows={prevTodayRows}
                updatedUsernames={updatedToday} loadMore={loadMoreToday}
                hasMore={todayHasMore} loadingMore={loadingMoreToday}
                search={searchToday} setSearch={setSearchToday} total={todayTotal}/>
            )}
            {tab==="week"&&(
              <BoardSection type="week" rows={weekRows} prevRows={prevWeekRows}
                updatedUsernames={updatedWeek} loadMore={loadMoreWeek}
                hasMore={weekHasMore} loadingMore={loadingMoreWeek}
                search={searchWeek} setSearch={setSearchWeek} total={weekTotal}/>
            )}
            {tab==="history"&&(
              <HistoryTab members={data.members} weekStart={data.weekStart} weekEnd={data.weekEnd}/>
            )}
          </main>
        )}
      </div>

      <style jsx global>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}

        :root{
          --bg:#0d0d0d;
          --surface:#181818;
          --surface2:#222222;
          --border:#2e2e2e;
          --text:#f0f0f0;
          --dim:#888;
          --accent:#00e5a0;
          --cyan:#00b8d4;
          --danger:#ef4444;
          --font:'Inter',system-ui,sans-serif;
        }

        body{background:var(--bg);color:var(--text);font-family:var(--font);min-height:100vh;overflow-x:hidden;}
        .root{min-height:100vh;}

        @keyframes spin{to{transform:rotate(360deg);}}
        @keyframes flash-row{0%,100%{background:inherit;}20%{background:rgba(0,229,160,.12);}65%{background:rgba(0,229,160,.04);}}
        @keyframes slide-up{from{transform:translateY(6px);opacity:.6;}to{transform:none;opacity:1;}}
        @keyframes slide-down{from{transform:translateY(-6px);opacity:.6;}to{transform:none;opacity:1;}}
        @keyframes badge-pop{0%,100%{transform:scale(1);}50%{transform:scale(1.2);}}

        /* HEADER */
        .header{
          display:flex;align-items:center;justify-content:space-between;
          padding:.85rem 2rem;background:var(--surface);
          border-bottom:1px solid var(--border);
          position:sticky;top:0;z-index:50;flex-wrap:wrap;gap:.5rem;
        }
        .hl{display:flex;align-items:center;gap:.7rem;}
        .logo-lc{font-size:1rem;font-weight:800;color:var(--accent);letter-spacing:.04em;}
        .title{font-size:1rem;font-weight:700;color:var(--text);}
        .sub-tag{font-size:.65rem;color:var(--dim);background:var(--surface2);border:1px solid var(--border);padding:.15rem .5rem;border-radius:99px;letter-spacing:.04em;}
        .hr{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;}
        .last-ref{font-size:.65rem;color:var(--dim);}
        .cd-badge{font-size:.65rem;color:var(--cyan);background:rgba(0,184,212,.08);border:1px solid rgba(0,184,212,.22);padding:.18rem .55rem;border-radius:4px;}

        .btn-outline{
          background:transparent;border:1px solid var(--accent);color:var(--accent);
          font-family:var(--font);font-size:.72rem;font-weight:600;
          padding:.38rem .9rem;cursor:pointer;border-radius:5px;transition:all .18s;
        }
        .btn-outline:hover:not(:disabled){background:var(--accent);color:#000;}
        .btn-outline.btn-dim{opacity:.5;cursor:not-allowed;}
        .btn-outline.btn-cyan{border-color:var(--cyan);color:var(--cyan);}
        .btn-outline.btn-cyan:hover{background:var(--cyan);color:#000;}
        .btn-ghost{
          background:transparent;border:1px solid var(--border);color:var(--dim);
          font-family:var(--font);font-size:.72rem;font-weight:500;
          padding:.38rem .9rem;cursor:pointer;border-radius:5px;transition:all .18s;
        }
        .btn-ghost:hover{border-color:var(--danger);color:var(--danger);}

        /* PROGRESS */
        .prog-strip{height:3px;background:var(--surface2);position:relative;}
        .prog-fill{height:100%;background:linear-gradient(90deg,var(--cyan),var(--accent));transition:width .5s ease;}
        .prog-lbl{position:absolute;right:1rem;top:5px;font-size:.58rem;color:var(--dim);}
        .done-strip{background:rgba(0,229,160,.06);border-bottom:1px solid rgba(0,229,160,.15);color:var(--accent);padding:.3rem 2rem;font-size:.65rem;font-weight:600;}
        .err-strip{background:rgba(239,68,68,.07);border-bottom:1px solid rgba(239,68,68,.18);color:var(--danger);padding:.4rem 2rem;font-size:.78rem;}

        /* LOADING */
        .loading-screen{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;}

        /* MAIN */
        .main{max-width:900px;margin:0 auto;padding:1.8rem 1.5rem;}

        /* DATE ROW */
        .date-row{display:flex;align-items:center;gap:.6rem;margin-bottom:1.4rem;font-size:.72rem;flex-wrap:wrap;}
        .date-lbl{color:var(--cyan);font-weight:700;letter-spacing:.1em;font-size:.62rem;}
        .date-val{color:var(--text);}
        .date-sep{color:var(--border);}

        /* TABS — outlined active tab like screenshot */
        .tabs{display:flex;gap:.1rem;margin-bottom:1.5rem;border-bottom:1px solid var(--border);padding-bottom:0;}
        .tab{
          background:transparent;border:1px solid transparent;
          color:var(--dim);font-family:var(--font);font-size:.72rem;font-weight:600;
          letter-spacing:.08em;padding:.55rem 1.2rem;cursor:pointer;transition:all .15s;
          border-radius:4px 4px 0 0;margin-bottom:-1px;
        }
        .tab:hover{color:var(--text);}
        .tab-active{
          color:var(--accent);border-color:var(--accent);border-bottom-color:var(--bg);
          background:var(--bg);
        }

        /* SEARCH */
        .search-wrap{display:flex;align-items:center;justify-content:space-between;gap:.8rem;padding:.2rem 0 1rem;flex-wrap:wrap;}
        .search-box{
          display:flex;align-items:center;gap:.6rem;
          background:var(--surface);border:1px solid var(--border);
          padding:.6rem 1rem;flex:1;max-width:460px;border-radius:6px;
          transition:border-color .2s;
        }
        .search-box:focus-within{border-color:var(--accent);}
        .s-icon{color:var(--dim);font-size:1rem;line-height:1;}
        .s-input{
          flex:1;background:transparent;border:none;outline:none;
          color:var(--dim);font-family:var(--font);font-size:.82rem;font-weight:400;
        }
        .s-input::placeholder{color:var(--dim);opacity:.7;}
        .s-clear{background:transparent;border:none;color:var(--dim);cursor:pointer;font-size:.8rem;line-height:1;padding:0;}
        .s-clear:hover{color:var(--danger);}
        .s-count{font-size:.65rem;color:var(--dim);}

        /* LEADERBOARD HEADER */
        .lr-header{
          display:grid;grid-template-columns:90px 1fr 120px;
          background:var(--surface2);border:1px solid var(--border);border-bottom:none;
          font-size:.62rem;font-weight:700;letter-spacing:.1em;color:var(--dim);
          padding:.5rem 0;
        }
        .lr-header span:nth-child(1){text-align:center;padding:0 .5rem;}
        .lr-header span:nth-child(2){padding:0 1rem;}
        .lr-header span:nth-child(3){text-align:center;}

        /* LEADERBOARD LIST */
        .lr-list{border:1px solid var(--border);}

        /* LEADERBOARD ROW — 3 columns: rank | name+bar | score */
        .lr{
          display:grid;grid-template-columns:90px 1fr 120px;
          align-items:center;background:var(--surface);
          border-bottom:1px solid var(--border);
          transition:background .18s;
          min-height:72px;
        }
        .lr:last-child{border-bottom:none;}
        .lr:hover{background:var(--surface2);}
        .lr-flash{animation:flash-row 2.2s ease;}
        .lr-up{animation:slide-up .4s ease;}
        .lr-down{animation:slide-down .4s ease;}

        /* Rank col */
        .lr-rank-col{
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          gap:3px;padding:.8rem .4rem;border-right:1px solid var(--border);height:100%;
        }
        .lr-rank-txt{font-size:1.2rem;font-weight:800;color:var(--dim);letter-spacing:-.01em;line-height:1;}
        .lr-medal{font-size:1.5rem;line-height:1;}
        .lr-delta{font-size:.58rem;font-weight:700;padding:.1rem .3rem;border-radius:3px;}
        .d-up{color:#22c55e;background:rgba(34,197,94,.12);}
        .d-down{color:#ef4444;background:rgba(239,68,68,.12);}

        /* Name + bar col */
        .lr-body{
          padding:.85rem 1rem;display:flex;flex-direction:column;gap:4px;
          border-right:1px solid var(--border);min-width:0;overflow:hidden;
        }
        .lr-fullname{
          font-size:.95rem;font-weight:700;color:var(--text);
          letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        }
        .lr-username{font-size:.7rem;color:var(--dim);font-weight:400;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .lr-bar-track{width:100%;height:5px;background:var(--surface2);border-radius:3px;overflow:hidden;margin-top:6px;}
        .lr-bar-fill{height:100%;border-radius:3px;transition:width .9s ease,background .8s ease;}

        /* Score col */
        .lr-score-col{
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          gap:4px;padding:.8rem .5rem;
        }
        .lr-score-badge{
          font-size:1.25rem;font-weight:800;
          width:44px;height:44px;
          display:flex;align-items:center;justify-content:center;
          border-radius:6px;border:1px solid;
          transition:all .3s;
        }
        .lr-flash .lr-score-badge{animation:badge-pop .4s ease;}
        .lr-solved-lbl{font-size:.62rem;color:var(--dim);font-weight:500;letter-spacing:.04em;}

        /* Load more */
        .lmr{display:flex;align-items:center;justify-content:center;padding:.9rem;background:var(--surface);border:1px solid var(--border);border-top:none;}
        .lm-btn{background:transparent;border:1px solid var(--border);color:var(--dim);font-family:var(--font);font-size:.72rem;font-weight:600;padding:.5rem 2rem;cursor:pointer;border-radius:5px;transition:all .18s;}
        .lm-btn:hover{border-color:var(--accent);color:var(--accent);}
        .load-spin{display:flex;align-items:center;gap:.5rem;font-size:.72rem;color:var(--dim);}
        .mini-spin{display:inline-block;width:14px;height:14px;border:1.5px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0;}
        .no-data{color:var(--dim);font-size:.82rem;padding:2.5rem;text-align:center;background:var(--surface);border:1px solid var(--border);}

        /* HISTORY */
        .hist-section{display:flex;flex-direction:column;gap:1rem;}
        .hist-toolbar{
          display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;
          gap:.8rem;padding:.75rem 1rem;background:var(--surface);border:1px solid var(--border);border-radius:6px;
        }
        .hist-right{display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;}
        .hist-count{font-size:.68rem;color:var(--dim);}
        .hist-count strong{color:var(--text);}
        .legend-row{display:flex;gap:.3rem;}
        .h-pill{font-size:.62rem;font-weight:700;padding:.18rem .45rem;border-radius:4px;}
        .export-btns{display:flex;gap:.4rem;}
        .exp-btn{background:transparent;font-family:var(--font);font-size:.67rem;font-weight:600;padding:.35rem .8rem;cursor:pointer;transition:all .18s;border-radius:4px;}
        .exp-btn:disabled{opacity:.45;cursor:not-allowed;}
        .csv-btn{border:1px solid rgba(0,229,160,.4);color:var(--accent);}
        .csv-btn:hover:not(:disabled){background:rgba(0,229,160,.08);}
        .pdf-btn{border:1px solid rgba(0,184,212,.4);color:var(--cyan);}
        .pdf-btn:hover:not(:disabled){background:rgba(0,184,212,.08);}
        .h-err{color:var(--danger);font-size:.75rem;padding:.55rem;background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.2);border-radius:4px;}
        .h-loading{display:flex;align-items:center;gap:.6rem;padding:1.5rem;color:var(--dim);font-size:.78rem;}

        /* MATRIX */
        .mat-outer{overflow-x:auto;border:1px solid var(--border);border-radius:6px;}
        .mat{border-collapse:collapse;font-size:.72rem;width:max-content;min-width:100%;}
        .mat th,.mat td{padding:.5rem .65rem;text-align:center;border:1px solid var(--border);white-space:nowrap;}
        .mat thead th{background:var(--surface2);color:var(--dim);font-weight:700;font-size:.6rem;letter-spacing:.07em;}
        .th-sticky,.td-sticky{position:sticky;left:0;z-index:3;background:var(--surface2);}
        .th-sticky-right,.td-sticky-right{position:sticky;right:0;z-index:3;background:var(--surface2);}
        .th-sn{min-width:50px;}.th-name{text-align:left;min-width:180px;}.th-date{min-width:80px;}.th-total{min-width:58px;}
        .mat-sn{text-align:center;font-size:.68rem;color:var(--dim);font-weight:600;min-width:50px;background:var(--surface2)!important;}
        .mat-name{text-align:left;font-weight:600;color:var(--text);min-width:180px;background:var(--surface)!important;display:flex;flex-direction:column;gap:2px;padding:.5rem .65rem;}
        .mat-lc{font-size:.57rem;color:var(--dim);font-weight:400;}
        .mat-cell{transition:background .2s;min-width:80px;}
        .mat-total{font-weight:700;min-width:58px;font-size:.85rem;background:var(--surface)!important;}

        @media(max-width:600px){
          .header{padding:.75rem 1rem;}
          .main{padding:1rem;}
          .lr{grid-template-columns:68px 1fr 90px;min-height:62px;}
          .lr-rank-col{padding:.6rem .3rem;}
          .lr-rank-txt{font-size:1rem;}
          .lr-medal{font-size:1.2rem;}
          .lr-score-badge{width:36px;height:36px;font-size:1rem;}
        }
      `}</style>
    </>
  );
}
