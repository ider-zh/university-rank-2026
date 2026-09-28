import { useEffect,useRef,useState } from 'react';
import type { Locale } from '../lib/catalog-types';
type Metric={value:number|null;field:string;unit:string;sourceFile:string|null;reportingYear:string|null};
type Safety={year:number;campusId:string;campusName:string;category:string;geography:string;facility?:string;conflict?:boolean;sourceFile:string;metrics:{key:string;value:number|null}[]};
type Institution={unitid:string;name:string;mappingVersion:string;outcomes:Record<string,Metric>;safety:Safety[]};
type Data={id:string;release:string;institutions:Institution[];sources:{scorecard:string;safety:string;safetyArchive:string}};
const labels:Record<string,string>={
  'Murder/Non-negligent manslaughter':'谋杀／非过失杀人','Negligent manslaughter':'过失杀人','Rape':'强奸','Fondling':'猥亵','Incest':'乱伦','Statutory rape':'法定强奸',
  'Robbery':'抢劫','Aggravated assault':'严重袭击','Burglary':'入室盗窃','Motor vehicle theft':'机动车盗窃','Arson':'纵火',
  'Domestic violence':'家庭暴力','Dating violence':'约会暴力','Stalking':'跟踪骚扰','Illegal weapons possession':'非法持有武器','Drug law violations':'毒品法规违规','Liquor law violations':'酒类法规违规',
  'Simple assault':'普通袭击','Larceny-theft':'盗窃','Intimidation':'恐吓','Destruction/damage/ vandalism of property':'破坏财产','Total Fires':'报告火灾数',
};
const categories:Record<string,string>={Criminal_Offenses:'刑事案件',VAWA_Offenses:'暴力与骚扰（VAWA）',Disciplinary_Actions:'纪律处分',Hate_Crimes:'仇恨犯罪',Fires:'宿舍火灾'};
const geographies:Record<string,string>={campus:'校内',housing:'学生宿舍（校内子集）',noncampus:'校外学校物业',public:'公共区域'};
export default function UsSupplement({id,release,locale}:{id:string;release:string;locale:Locale}){
  const zh=locale==='zh';const section=useRef<HTMLElement>(null);
  const [visible,setVisible]=useState(false);const [data,setData]=useState<Data|null>(null);const [error,setError]=useState(false);const [attempt,setAttempt]=useState(0);
  const [unit,setUnit]=useState('');const [campus,setCampus]=useState('');const [year,setYear]=useState('');const [geography,setGeography]=useState('campus');const [category,setCategory]=useState('Criminal_Offenses');
  useEffect(()=>{if(!section.current)return;const observer=new IntersectionObserver(([entry])=>{if(entry.isIntersecting){setVisible(true);observer.disconnect();}},{rootMargin:'250px'});observer.observe(section.current);return()=>observer.disconnect();},[]);
  useEffect(()=>{
    if(!visible)return;const controller=new AbortController();setError(false);setData(null);
    fetch(`/us-data/${release}/${id}.json`,{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error();return r.json();}).then(value=>{if(value.id!==id||value.release!==release)throw Error();setData(value);}).catch(e=>{if(e.name!=='AbortError')setError(true);});
    return()=>controller.abort();
  },[visible,id,release,attempt]);
  const institution=data?.institutions.find(i=>i.unitid===unit)||data?.institutions[0];
  const campusOptions=[...new Map(institution?.safety.map(r=>[r.campusId,r.campusName])||[]).entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true}));
  const selectedCampus=campusOptions.some(([id])=>id===campus)?campus:campusOptions[0]?.[0];
  const campusRows=institution?.safety.filter(r=>r.campusId===selectedCampus)||[];
  const years=[...new Set(campusRows.map(r=>r.year))].sort((a,b)=>b-a);
  const selectedYear=years.includes(Number(year))?Number(year):years[0];
  const rows=campusRows.filter(r=>r.year===selectedYear&&r.geography===geography&&r.category===category);
  const format=(value:number|null,kind:string)=>value===null?(zh?'未披露／无数据':'Not available'):kind==='percent'?`${value.toFixed(2)}%`:new Intl.NumberFormat(locale,{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
  const selectClass='mt-2 w-full rounded border border-line bg-white px-3 py-2 text-sm';
  return <section ref={section} className="border-t border-line py-9" aria-label={zh?'美国校园安全与就业数据':'US campus safety and student outcomes'}>
    <h2 className="text-lg font-semibold">{zh?'美国校园安全与就业数据':'US campus safety & student outcomes'}</h2>
    {!data&&!error&&<p className="mt-5 text-sm text-muted" role="status">{zh?'正在读取本校补充资料…':'Loading this institution’s source data…'}</p>}
    {error&&<div role="alert" className="mt-5 text-sm"><p>{zh?'补充数据加载失败，学校基础资料仍可使用。':'Supplemental data could not be loaded.'}</p><button className="mt-3 underline" onClick={()=>setAttempt(a=>a+1)}>{zh?'重试':'Retry'}</button></div>}
    {data&&!institution&&<p className="mt-5 text-sm text-muted">{zh?'当前没有可匹配的美国教育部机构数据；这不代表零事件或零收入。':'No matching federal institution data is available; this does not mean zero incidents or earnings.'}</p>}
    {institution&&<>
      <p className="mt-3 text-xs leading-6 text-muted">{institution.name} · UNITID {institution.unitid} · {zh?'映射版本':'Mapping version'} {institution.mappingVersion}</p>
      {data!.institutions.length>1&&<label className="mt-4 block text-sm">{zh?'统计机构':'Reporting institution'}<select className={selectClass} value={institution.unitid} onChange={e=>{setUnit(e.target.value);setCampus('');setYear('');}}>{data!.institutions.map(i=><option value={i.unitid} key={i.unitid}>{i.name} · {i.unitid}</option>)}</select></label>}
      <h3 className="mt-7 font-medium">{zh?'就业相关：收入与学生债务':'Career-related earnings & student debt'}</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries({median6:zh?'入学 6 年后收入中位数':'Median earnings 6 years after entry',median10:zh?'入学 10 年后收入中位数':'Median earnings 10 years after entry',debt:zh?'毕业生联邦贷款债务中位数':'Median federal debt of graduates',repayment3:zh?'进入还款 3 年后的还款率':'3-year repayment rate'}).map(([key,label])=>{
          const m=institution.outcomes[key];return <div key={key} className="rounded-xl border border-line bg-white/60 p-5"><p className="text-xs leading-5 text-muted">{label}</p><p className="mt-3 text-2xl tabular-nums">{format(m.value,m.unit)}</p><p className="mt-3 break-all text-[10px] text-muted">{m.field}</p></div>;
        })}
      </div>
      <p className="mt-4 text-xs leading-6 text-muted">{zh?'收入指标针对接受联邦资助、已工作且不再在读的原学生，按入学后年数统计，不是毕业起薪，也不是就业率或个人薪资保证。6 年与 10 年指标不据此计算同一人群的薪资涨幅。未提供可核验的就业率。':'Earnings cover federally aided former students working and not enrolled, measured after entry—not starting graduate salaries, an employment rate, or an individual forecast. The 6- and 10-year values are not used to infer a cohort’s earnings growth.'}</p>
      <details className="mt-3 text-xs leading-6 text-muted"><summary className="cursor-pointer underline">{zh?'指标口径、年份与来源':'Definitions, years & sources'}</summary><p className="mt-2">{zh?'还款率指进入还款后 3 年内至少偿还 1 美元本金的借款人比例。金额保留本地源文件美元口径，未按当前年份换算。Most-Recent-Cohorts 文件未保存各指标的独立统计年份，不能把文件名或导出日期当作观测年份。':'Repayment measures borrowers paying down at least $1 of principal within 3 years. Dollar amounts retain source-file values. The local most-recent-cohorts file does not preserve separate observation years; its filename or export date is not the observation year.'}</p><ul className="mt-2">{Object.values(institution.outcomes).map(m=><li key={m.field}>{m.field}: {m.sourceFile|| (zh?'无可用源值':'No source value')} {m.reportingYear?`(${m.reportingYear} 文件)`:''}</li>)}</ul><a className="underline" href={data!.sources.scorecard} target="_blank" rel="noreferrer">College Scorecard ↗</a></details>
      <details className="group mt-9 rounded-xl border border-line p-4 sm:p-5" data-campus-safety>
      <summary className="cursor-pointer rounded font-medium focus-visible:outline-2 focus-visible:outline-offset-4">
        {zh?'校园安全报告':'Campus safety reports'}
        <span className="ml-3 text-xs font-normal text-muted group-open:hidden">{zh?'展开查看':'View report'}</span>
        <span className="ml-3 hidden text-xs font-normal text-muted group-open:inline">{zh?'收起':'Collapse'}</span>
      </summary>
      <p className="mt-3 text-xs leading-6 text-muted">{zh?'以下是历史报告数量，不是安全评分。宿舍属于校内子集，地点与类别不得相加推算不重复事件总数；不同学校的规模和报告方式也不同。空白保留为“无数据”，仅明确填报的 0 显示为零。':'Historical reported counts, not a safety score. Housing is a subset of on-campus reporting; locations and categories are not additive unique incidents. School size and reporting practices differ. Missing values are not zero.'}</p>
      {!campusRows.length?<p className="mt-4 text-sm text-muted">{zh?'暂无可匹配的校园安全记录。':'No matching campus safety records.'}</p>:<>
        <div className="my-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs">{zh?'校区':'Campus'}<select className={selectClass} value={selectedCampus} onChange={e=>{setCampus(e.target.value);setYear('');}}>{campusOptions.map(([id,name])=><option key={id} value={id}>{name||id}</option>)}</select></label>
          <label className="text-xs">{zh?'来源年份':'Source year'}<select className={selectClass} value={selectedYear} onChange={e=>setYear(e.target.value)}>{years.map(y=><option key={y}>{y}</option>)}</select></label>
          <label className="text-xs">{zh?'地点口径':'Geography'}<select className={selectClass} value={geography} onChange={e=>setGeography(e.target.value)}>{Object.entries(geographies).map(([key,value])=><option key={key} value={key}>{zh?value:key}</option>)}</select></label>
          <label className="text-xs">{zh?'报告类别':'Category'}<select className={selectClass} value={category} onChange={e=>{setCategory(e.target.value);if(e.target.value==='Fires')setGeography('housing');}}>{Object.entries(categories).map(([key,value])=><option key={key} value={key}>{zh?value:key.replaceAll('_',' ')}</option>)}</select></label>
        </div>
        {rows.some(r=>r.conflict)&&<p className="mb-3 text-xs text-amber-800">{zh?'部分源记录存在数值冲突，已标为无数据，未擅自选择或相加。':'Conflicting source values are shown as unavailable, not selected or summed.'}</p>}
        {!rows.length?<p className="text-sm text-muted">{zh?'该组合暂无记录，不按零处理。':'No records for this selection; not treated as zero.'}</p>:<>
          <p className="mb-2 text-xs text-muted">{zh?'报告项目 · 数量（不合计）':'Reported items · counts (not summed)'}{category==='Fires'&&(zh?' · 按宿舍列出，可滚动查看':' · By residence; scroll for more')}</p>
          <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-line" tabIndex={0} role="region" aria-label={zh?'安全报告明细':'Safety report details'}>
            <dl className="grid grid-cols-1 gap-px bg-line/60 sm:grid-cols-2 xl:grid-cols-3">
              {rows.flatMap((r,i)=>r.metrics.map(m=><div className="flex min-w-0 items-center justify-between gap-3 bg-white px-3 py-2.5" key={`${i}-${m.key}`}>
                <dt className="min-w-0 break-words text-xs leading-5">{r.facility|| (zh?labels[m.key]||m.key:m.key)}</dt>
                <dd className={`shrink-0 text-sm font-semibold tabular-nums ${m.value===null||m.value===0?'text-muted':'text-ink'}`}>{m.value===null?(zh?'无数据':'N/A'):m.value.toLocaleString(locale)}</dd>
              </div>))}
            </dl>
          </div>
        </>}
      </>}
      <p className="mt-4 break-words text-xs leading-6 text-muted">{zh?'本地来源包':'Local source archive'}: {data!.sources.safetyArchive}. <a className="underline" href={data!.sources.safety} target="_blank" rel="noreferrer">{zh?'美国教育部校园安全数据':'US Department of Education campus safety data'} ↗</a></p>
      </details>
    </>}
  </section>;
}
