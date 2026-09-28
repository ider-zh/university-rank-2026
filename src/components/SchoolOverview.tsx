import type { Locale } from '../lib/catalog-types';
export interface Overview { id:string;release:string;sourceSnapshot:string;paragraphs:Record<Locale,string[]>;polish?:{summary:string;model:string;status:string;sourceUrls:string[]} }
export function overviewText(value:Overview|null|undefined,locale:Locale){
  const language=value?.paragraphs[locale]?.length?locale:(value?.paragraphs.en?.length?'en':'zh');
  return {paragraphs:value?.paragraphs[language]||[],language:language as Locale};
}
export function overviewTeaser(value:Overview|null|undefined,locale:Locale){
  if(locale==='zh'&&value?.polish)return {text:value.polish.summary,language:'zh' as Locale};
  const {paragraphs,language}=overviewText(value,locale);
  const text=paragraphs[0]||'';
  const limit=language==='zh'?250:650;
  if(text.length<=limit)return {text,language};
  const sentences=text.match(language==='zh'?/[^。！？]+[。！？]?/g:/[^.!?]+[.!?]?/g)||[];
  let summary='';
  for(const sentence of sentences){if(summary.length+sentence.length>limit)break;summary+=sentence;}
  return {text:summary||text.slice(0,limit)+'…',language};
}
export default function SchoolOverview({value,locale,sourceUrl}:{value:Overview|null|undefined;locale:Locale;sourceUrl:string|null}){
  const {paragraphs,language}=overviewText(value,locale);
  if(!paragraphs.length)return null;
  const zh=locale==='zh';
  return <section className="border-t border-line py-9" aria-label={zh?'学校详细介绍':'Detailed university introduction'}>
    <h2 className="mb-5 text-lg font-semibold">{zh?'学校详细介绍':'About the university'}</h2>
    {language!==locale&&<p className="mb-4 text-xs text-muted">{zh?'以下展示英文来源资料。':'The following content is presented in its source language.'}</p>}
    <div lang={language} className="max-w-4xl space-y-4 text-sm leading-8 text-muted md:text-base">
      {paragraphs.slice(0,2).map((p,i)=><p key={i}>{p}</p>)}
      {paragraphs.length>2&&<details><summary className="cursor-pointer text-sm font-medium text-ink">{zh?'展开更多历史、学科与校园介绍':'More history, academics and campus information'}</summary><div className="mt-4 space-y-4">{paragraphs.slice(2).map((p,i)=><p key={i}>{p}</p>)}</div></details>}
    </div>
    <p className="mt-5 text-xs leading-6 text-muted">{zh?(value?.polish?`资料来源：百科快照 ${value.sourceSnapshot}。由 ${value.polish.model} 检查、润色并二次审校，人工事实核验待完成。了解学校近况可查阅其官方网站。`:`资料来源：百科快照 ${value?.sourceSnapshot}，保留原文的历史年份与观点，中文统一为简体。了解学校近况可查阅其官方网站。`):`Source: encyclopedia snapshot ${value?.sourceSnapshot}, with the original dates and perspectives retained. Visit the university’s official website for current information.`}
      {(zh&&value?.polish?value.polish.sourceUrls:sourceUrl?[sourceUrl]:[]).map((url,i)=><span key={url}> <a className="underline" href={url} target="_blank" rel="noreferrer">{zh?`原文与修订历史${i?' '+(i+1):''}`:'Source and revision history'} ↗</a></span>)}
      {' · '}<a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer" className="underline">CC BY-SA</a>
    </p>
  </section>;
}
