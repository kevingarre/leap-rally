const test = require('node:test');
const assert = require('node:assert/strict');
const tools = require('../js/dealer-tools.js');

test('Händlerimport normalisiert die gelieferte Struktur und erhält führende Nullen', () => {
  const result = tools.normalizeDealerRows([{
    'MandatsNr.': '8030001', 'Site Code Vertrieb': '001', Händlername: ' Autohaus ',
    Adresse: ' Weg 1 ', Ort: ' Berlin ', PLZ: '10115'
  }], {'10115': true});
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.rows[0], {
    dealer_code:'8030001', site_code:'001', name:'Autohaus', address:'Weg 1', city:'Berlin', zip:'10115'
  });
});

test('verschobene und doppelte Händlerzeilen werden blockiert', () => {
  const result = tools.normalizeDealerRows([
    {'MandatsNr.':'1',Händlername:'A',Adresse:'X',Ort:'73430',PLZ:'Aalen'},
    {'MandatsNr.':'1',Händlername:'B',Adresse:'Y',Ort:'Berlin',PLZ:'10115'}
  ], {'10115':true});
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0].messages.join(' '), /fünfstellig/);
  assert.match(result.errors[1].messages.join(' '), /doppelt/);
});

test('EMEA-Export hat exakt 62 Spalten, UTF-8 und das freigegebene Zielmapping', () => {
  const result = tools.buildLeadCsv({
    profile:{constants:{BRAND:'VERALTET',COMMUNICATIONCHANNEL:'GAME'},model_mapping:tools.DEFAULT_MODELS},
    rows:[{lead_date:'2026-08-17T12:00:00Z',first_name:'Max',last_name:'Muster',zip:'10115',city:'Düsseldorf',
      email:'m@example.test',phone:'123',vehicle_interest:'b10',contact_intent:'angebot',
      consent_stay_in_touch:true,consent_better_offers:false,consent_partners:true,
      dealer_code:'803',dealer_site_code:'1',dealer_name:'Auto;Haus Nürnberg',dealer_address:'Weg 1',dealer_city:'Nürnberg',terms_version_at_entry:2,
      source_system:'wordpress',event_name:'TT Challenge',event_location:'Berlin'}]
  });
  const csv=result.csv;
  assert.equal(result.warnings.length,0);
  const lines=csv.replace(/^\uFEFF/,'').split('\r\n');
  assert.equal(lines.length,2);
  assert.equal(lines[0].split(';').length,62);
  const headers=lines[0].split(';');
  const cells=parseSemicolon(lines[1]);
  const value=k=>cells[headers.indexOf(k)];
  assert.equal(value('MODELCODE'),'B108');
  assert.equal(value('MODELDESCRIPTION'),'B10');
  assert.equal(value('CITY'),'Düsseldorf');
  assert.equal(value('DEALER'),'Auto;Haus Nürnberg');
  assert.equal(value('DEALERCITY'),'Nürnberg');
  assert.equal(value('DEALERSITE'),'001');
  assert.equal(value('CTA'),'RP');
  assert.equal(value('BRAND'),'LEAPMOTOR');
  assert.equal(value('MARKET'),'8803');
  assert.equal(value('CAMPAIGN'),'17646');
  assert.equal(value('OFFER'),'EARNED MEDIA');
  assert.equal(value('LEVEL1'),'EVENTS');
  assert.equal(value('LEVEL2'),'QR');
  assert.equal(value('LEVEL3'),'WWW');
  assert.equal(value('LEVEL4'),'LEAPMOTOR');
  assert.equal(headers.indexOf('PROCESSTYPE'),headers.indexOf('LEVEL4')+1);
  assert.equal(value('PROCESSTYPE'),'Lead Self');
  assert.equal(value('LANGUAGE'),'Tedesco');
  assert.equal(value('DISCLAIMERID'),'1699');
  assert.equal(value('MARKETINGEMAIL'),'1');
  assert.equal(value('PRIVACYPROFILATION'),'0');
  assert.equal(value('PRIVACYTHIRDPARTY'),'1');
  assert.equal(value('MARKETINGPHONE'),'');
  assert.equal(value('EVENTNAME'),'TT Challenge');
  assert.equal(value('EVENTLOCATION'),'Berlin');
  assert.equal(value('COMMUNICATIONCHANNEL'),'');
  assert.deepEqual(Array.from(Buffer.from(csv, 'utf8').subarray(0,3)), [0xef, 0xbb, 0xbf]);
  assert.ok(Buffer.from(csv, 'utf8').includes(Buffer.from('Düsseldorf', 'utf8')));
});

test('CTA unterscheidet Probefahrt und Angebot', () => {
  const base={lead_date:'2026-08-17T12:00:00Z',vehicle_interest:'b10',dealer_site_code:'000'};
  const result=tools.buildLeadCsv({rows:[Object.assign({},base,{contact_intent:'probefahrt'})]});
  const lines=result.csv.replace(/^\uFEFF/,'').split('\r\n'),headers=lines[0].split(';'),cells=parseSemicolon(lines[1]);
  assert.equal(cells[headers.indexOf('CTA')],'TD');
});

test('Export crasht NICHT bei fehlender Standortkennung, setzt Default 000 und warnt', () => {
  const base={lead_date:'2026-08-17T12:00:00Z',vehicle_interest:'b10',first_name:'Jieyue',last_name:'Shi',dealer_code:'8030160',dealer_name:'Gromes'};
  const result=tools.buildLeadCsv({rows:[Object.assign({},base,{dealer_site_code:''})]});
  const lines=result.csv.replace(/^\uFEFF/,'').split('\r\n'),headers=lines[0].split(';'),cells=parseSemicolon(lines[1]);
  assert.equal(cells[headers.indexOf('DEALERSITE')],'000');
  assert.equal(result.warnings.length,1);
  assert.equal(result.warnings[0].name,'Jieyue Shi');
  // NULL und nicht-numerisch ebenso robust
  const r2=tools.buildLeadCsv({rows:[Object.assign({},base,{dealer_site_code:null}),Object.assign({},base,{dealer_site_code:'ABC'})]});
  assert.equal(r2.warnings.length,2);
  const l2=r2.csv.replace(/^\uFEFF/,'').split('\r\n');
  assert.equal(parseSemicolon(l2[1])[headers.indexOf('DEALERSITE')],'000');
  assert.equal(parseSemicolon(l2[2])[headers.indexOf('DEALERSITE')],'000');
});

function parseSemicolon(line) {
  const out=[]; let cur='',quoted=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'&&quoted&&line[i+1]==='"'){cur+='"';i++;}
    else if(c==='"')quoted=!quoted;
    else if(c===';'&&!quoted){out.push(cur);cur='';}
    else cur+=c;
  }
  out.push(cur); return out;
}
