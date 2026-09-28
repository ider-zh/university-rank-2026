// Explicit semantic identity review: exact university article QID + named campus building.
// These remain candidates: acquisition must independently validate license, size and contact sheet.
import {readFile,writeFile} from 'node:fs/promises';
const path='archives/media-discovery/candidates.json';
const candidates=JSON.parse(await readFile(path,'utf8'));
const {release}=JSON.parse(await readFile('src/data/catalog.json','utf8'));
const schools=JSON.parse(await readFile(`public/data/${release}/ranking.json`,'utf8')).universities;
const normalize=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
const approved={
  Q49112:['Old campus.jpg','Sterling Memorial Library 2, September 1, 2008.jpg','Woolsey Hall Memorial Hall University Dining Hall Yale University.jpg','Vanderbilt Hall at Yale university.jpg','Yale Harkness Tower.JPG'],
  Q168756:['South Hall--UC Berkeley--Panoramic.jpg','Bancroft Library - University of California, Berkeley - DSC04902.JPG','Wheeler Hall, University of California, Berkeley.jpg'],
  Q174710:['Royce Hall post rain.jpg','Kerckhoff Hall, UCLA (2007).jpg','Powell Library, UCLA (10 December 2005).jpg','Royce Hall, vaulted arches, exterior, UCLA.jpg'],
  Q21578:['Cannon Green and Nassau Hall, Princeton University.jpg','Princeton University Graduate College, NJ - looking north.jpg','Pyne Hall, Princeton University.jpg'],
  Q131252:['University of Chicago campus panorama (2011).jpg','University of Chicago, Harper Library.jpg','University of Chicago July 2013 19 (Main Quadrangles).jpg'],
  Q168751:['Duke Chapel, West Campus, Duke University, Durham, NC (48960356548).jpg','Allen Building, West Campus, Duke University, Durham, NC (48960801602).jpg'],
  Q777403:['WUSTL Danforth Campus.jpg','WashU Danforth Campus.jpg','Danforth Campus banner - Washington University in St. Louis.jpg'],
  Q11942:['ETH Zurich from Polyterrace.jpg','ETH Zürich - Hauptgebäude - Unispital 2012-07-30 07-57-03 ShiftN.jpg'],
  Q336264:['Kyoto University Campus.jpg','Kyoto University Clock Tower.jpg'],
  Q190080:['Carnegie Mellon University as seen from the Cathedral of Learning.jpg','Carnegie Mellon Hamerschlag Hall and Scott Hall.jpg','Gates-Hillman Complex at Carnegie Mellon University 2.jpg'],
  Q868421:['Campus of the University of California, Irvine (aerial view, circa 2006).jpg','UC Irvine, Science Library.JPG','UC Irvine Reines Hall.jpg'],
  Q262760:['EPFL campus 2017.jpg'],
  Q501758:['UF Auditorium2.jpg','UFHistoricBuildingSleddHall.JPG','UF-LibraryWest.JPG'],
  Q838330:['Bascom Hall at Dusk.jpg','Bascom Mall, University of Wisconsin, Madison, WI - 54302232407.jpg'],
  Q1432030:['JLU library.jpg'],
  Q2281517:['Scuhuaxi.jpg'],
  Q1927705:['Downes Memorial Clock Tower, Trinity College Hartford.jpg','Trinity College Hartford Admissions building.jpg','TrinCollHartford.jpg'],
  Q2495841:['Anschutz Engineering Center UCCS.jpg','Columbine Hall UCCS.jpg'],
  Q10994963:['Green Chairs, Garhwal University.jpg'],
};
let count=0;
for(const c of candidates){if((approved[c.id]||[]).some(t=>`File:${t}`===c.title.replaceAll('_',' '))&&c.evidence.wikibaseItem===c.id){c.evidence.reviewedCampusIdentity=true;c.evidence.identityReview='Exact university Wikipedia article QID; manually selected title names its campus or university building. License/geometry and final visual review still required.';count++;}}
for(const c of candidates){
  if(c.evidence.reviewedCampusIdentity||c.evidence.wikibaseItem!==c.id)continue;
  const name=schools.find(u=>u.id===c.id)?.names.en;
  if(!name||!/\.jpe?g$/i.test(c.title)||!/campus|hall|building|library|gate|tower|quadrangle|courtyard|auditorium/i.test(c.title))continue;
  if(/portrait|logo|seal|painting|drawing|engraving|statue|visit|protest|ceremony|football|basketball|memorial to|staff|students|faculty in|researchers|working|forum|team|challenge|rendering|monument|interior|Walton Smith|Gable decoration|Qatar|Shenzhen|Yuen Campus|1915|Historic University of Florida Campus/i.test(c.title))continue;
  if(!normalize(c.title).includes(normalize(name)))continue;
  c.evidence.reviewedCampusIdentity=true;
  c.evidence.identityReview='University article Wikidata QID verified; filename explicitly includes the full university name and a campus/building term; known people, art, event, indoor and branch-campus distractions excluded. Final image review remains required.';
  count++;
}
await writeFile(path,JSON.stringify(candidates,null,2));
console.log(`Explicit campus identity-reviewed candidates: ${candidates.filter(c=>c.evidence.reviewedCampusIdentity).length}`);
