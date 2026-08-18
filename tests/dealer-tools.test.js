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

test('EMEA-Export hat exakt 61 Spalten und das freigegebene Modellmapping', () => {
  const csv = tools.buildLeadCsv({
    profile:{constants:{COUNTRYCODE:'DE',BRAND:'LEAP',LANGUAGE:'DE'},model_mapping:tools.DEFAULT_MODELS},
    rows:[{lead_date:'2026-08-17T12:00:00Z',first_name:'Max',last_name:'Muster',zip:'10115',city:'Berlin',
      email:'m@example.test',phone:'123',vehicle_interest:'b10',contact_intent:'angebot',
      consent_stay_in_touch:true,consent_better_offers:false,consent_partners:true,
      dealer_code:'803',dealer_site_code:'001',dealer_name:'Auto;Haus',dealer_address:'Weg 1',dealer_city:'Berlin',terms_version_at_entry:2,
      source_system:'wordpress',event_name:'TT Challenge',event_location:'Berlin'}]
  });
  const lines=csv.replace(/^\uFEFF/,'').split('\r\n');
  assert.equal(lines.length,2);
  assert.equal(lines[0].split(';').length,61);
  const headers=lines[0].split(';');
  const cells=parseSemicolon(lines[1]);
  const value=k=>cells[headers.indexOf(k)];
  assert.equal(value('MODELCODE'),'B108');
  assert.equal(value('MODELDESCRIPTION'),'B10');
  assert.equal(value('DEALER'),'Auto;Haus');
  assert.equal(value('MARKETINGEMAIL'),'1');
  assert.equal(value('PRIVACYPROFILATION'),'0');
  assert.equal(value('PRIVACYTHIRDPARTY'),'1');
  assert.equal(value('MARKETINGPHONE'),'');
  assert.equal(value('EVENTNAME'),'TT Challenge');
  assert.equal(value('EVENTLOCATION'),'Berlin');
  assert.equal(value('COMMUNICATIONCHANNEL'),'GEWINNSPIEL');
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
