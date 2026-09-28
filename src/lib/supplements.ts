import { existsSync,readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { catalogRelease } from './catalog';
import type { Overview } from '../components/SchoolOverview';
export function overviewFor(id:string):Overview|null{
  if(!/^Q[1-9]\d*$/.test(id))return null;
  const file=resolve(process.cwd(),'public/overviews',catalogRelease,`${id}.json`);
  return existsSync(file)?JSON.parse(readFileSync(file,'utf8')):null;
}
