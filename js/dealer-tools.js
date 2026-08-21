(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LeapDealerTools = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var HEADERS = [
    'LEADDATE','NAME','SURNAME','ADDRESS','ZIPCODE','CITY','PROVINCECODE','COUNTRYCODE','MAIL','PHONE','MOBILE',
    'MARKETINGPOST','MARKETINGEMAIL','MARKETINGSMS','MARKETINGPHONE','MODELCODE','MODELDESCRIPTION','OWNBRANDCODE',
    'OWNMODELCODE','OWNBRANDDESCR','OWNMODELDESCR','EXTERNID','CAMPAIGN','OFFER','LEVEL1','LEVEL2','LEVEL3','LEVEL4',
    'PROCESSTYPE','BRAND','LANGUAGE','MARKET','CTA','NOTE','DEVICEUSED','DEALERCODE','DEALERCITY','DEALER','DEALERADDRESS',
    'DEALERSITE','DEALERMKT','DEALERPHONE','DEALERMAIL','APPOINTMENTDATE','APPNOTEDEALER','APPOINTMENTNOTES',
    'APPOINTEMENTSUBJECT','GENDER','COMPANYNAME','BUSINESSAREA','EVENTNAME','EVENTLOCATION','PRIVACYPROFILATION',
    'PRIVACYTHIRDPARTY','PRIVACYEXTRAUE','PRIVACYGEOLOCATION','BIRTHDATE','FLEETNUMBEROFOWNEDVEHICLES',
    'DISCLAIMERID','OWNEDCARVIN','VATNUMBER','COMMUNICATIONCHANNEL'
  ];
  var DEFAULT_MODELS = {
    b03x: { code: '485', description: 'B03X' }, b05: { code: '486', description: 'B05' },
    b10: { code: 'B108', description: 'B10' }, c10: { code: 'B118', description: 'C10' },
    t03: { code: '489', description: 'T03' }
  };
  var REQUIRED_EXPORT_CONSTANTS = {
    COUNTRYCODE: 'DE', CAMPAIGN: '17646', OFFER: 'EARNED MEDIA', LEVEL1: 'EVENTS', LEVEL2: 'QR',
    LEVEL3: 'WWW', LEVEL4: 'LEAPMOTOR', PROCESSTYPE: 'Lead Self', BRAND: 'LEAPMOTOR', LANGUAGE: 'Tedesco', MARKET: '8803',
    DISCLAIMERID: '1699', COMMUNICATIONCHANNEL: ''
  };
  var ALIASES = {
    dealer_code: ['MandatsNr.', 'MandatsNr', 'dealer_code'], site_code: ['Site Code Vertrieb', 'site_code'],
    name: ['Händlername', 'Haendlername', 'name'], address: ['Adresse', 'address'],
    city: ['Ort', 'city'], zip: ['PLZ', 'zip']
  };
  function text(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function pick(row, keys) { for (var i=0;i<keys.length;i++) if (row[keys[i]] !== undefined) return text(row[keys[i]]); return ''; }
  function normalizeDealerRows(rawRows, knownZips) {
    var rows=[], errors=[], warnings=[], seen={};
    (rawRows || []).forEach(function (raw, idx) {
      var r={}; Object.keys(ALIASES).forEach(function(k){r[k]=pick(raw,ALIASES[k]);});
      if (!Object.keys(r).some(function(k){return r[k];})) return;
      var line=idx+2, rowErrors=[];
      if (!r.dealer_code) rowErrors.push('MandatsNr. fehlt');
      if (!r.name) rowErrors.push('Händlername fehlt');
      if (!r.address) rowErrors.push('Adresse fehlt');
      if (!r.city) rowErrors.push('Ort fehlt');
      if (!/^\d{5}$/.test(r.zip)) rowErrors.push('PLZ muss fünfstellig sein');
      else if (knownZips && !knownZips[r.zip]) rowErrors.push('PLZ ist nicht im deutschen PLZ-Katalog');
      if (r.dealer_code && seen[r.dealer_code]) rowErrors.push('MandatsNr. ist doppelt (erste Zeile '+seen[r.dealer_code]+')');
      if (r.dealer_code) seen[r.dealer_code]=line;
      if (/^\d{1,3}$/.test(r.site_code)) r.site_code=r.site_code.padStart(3,'0');
      else rowErrors.push('Site Code Vertrieb muss dreistellig sein');
      if (rowErrors.length) errors.push({line:line,messages:rowErrors,row:r});
      rows.push(r);
    });
    return {rows:rows,errors:errors,warnings:warnings};
  }
  function csvCell(v) {
    var s=v===null||v===undefined?'':String(v).normalize('NFC');
    return /[;"\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
  }
  function boolValue(v, yes, no) { return v ? (yes || '1') : (no || '0'); }
  function formatDate(v) { if(!v)return ''; var d=new Date(v); return isNaN(d.getTime())?'':d.toISOString(); }
  function ctaValue(v) {
    var key=text(v).toLowerCase();
    if (key==='probefahrt'||key==='td') return 'TD';
    if (key==='angebot'||key==='rp') return 'RP';
    return '';
  }
  function dealerSiteCode(v) {
    var code=text(v);
    if (/^\d{1,3}$/.test(code)) return code.padStart(3,'0');
    throw new Error('Händler-Standortkennung fehlt oder ist nicht dreistellig.');
  }
  function buildLeadCsv(payload) {
    var profile=payload.profile||{}, constants=Object.assign({},profile.constants||{},REQUIRED_EXPORT_CONSTANTS), models=profile.model_mapping||DEFAULT_MODELS;
    var lines=[HEADERS.join(';')];
    (payload.rows||[]).forEach(function(r){
      var m=models[String(r.vehicle_interest||'').toLowerCase()]||{};
      var data={}; HEADERS.forEach(function(h){data[h]='';});
      Object.keys(constants).forEach(function(k){if(HEADERS.indexOf(k)>=0)data[k]=constants[k];});
      Object.assign(data,{
        LEADDATE:formatDate(r.lead_date),NAME:r.first_name||'',SURNAME:r.last_name||'',ZIPCODE:r.zip||'',CITY:r.city||'',
        MAIL:r.email||'',PHONE:r.phone||'',MARKETINGEMAIL:boolValue(r.consent_stay_in_touch,constants.CONSENT_TRUE,constants.CONSENT_FALSE),
        PRIVACYPROFILATION:boolValue(r.consent_better_offers,constants.CONSENT_TRUE,constants.CONSENT_FALSE),
        PRIVACYTHIRDPARTY:boolValue(r.consent_partners,constants.CONSENT_TRUE,constants.CONSENT_FALSE),
        MODELCODE:m.code||'',MODELDESCRIPTION:m.description||'',CTA:ctaValue(r.contact_intent),
        DEALERCODE:r.dealer_code||'',DEALERCITY:r.dealer_city||'',DEALER:r.dealer_name||'',
        DEALERADDRESS:r.dealer_address||'',DEALERSITE:dealerSiteCode(r.dealer_site_code),
        EVENTNAME:r.event_name||constants.EVENTNAME||'',EVENTLOCATION:r.event_location||constants.EVENTLOCATION||'',
        COMMUNICATIONCHANNEL:'', DISCLAIMERID:'1699'
      });
      lines.push(HEADERS.map(function(h){return csvCell(data[h]);}).join(';'));
    });
    return '\uFEFF'+lines.join('\r\n');
  }
  function workbookRows(workbook) {
    var first=workbook.SheetNames[0];
    return globalThis.XLSX.utils.sheet_to_json(workbook.Sheets[first],{defval:'',raw:false});
  }
  return { HEADERS:HEADERS, DEFAULT_MODELS:DEFAULT_MODELS, REQUIRED_EXPORT_CONSTANTS:REQUIRED_EXPORT_CONSTANTS, normalizeDealerRows:normalizeDealerRows,
    buildLeadCsv:buildLeadCsv, workbookRows:workbookRows, csvCell:csvCell };
});
