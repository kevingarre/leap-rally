(function () {
  'use strict';
  var cfg = window.LeapmotorDealer;
  if (!cfg) return;

  function init() {
    var form = document.getElementById('form_leaptischte26') || document.querySelector('form input[name="form_id"][value="' + cfg.formId + '"]')?.form;
    if (!form) return;
    var zip = form.querySelector('[name="item_meta[' + cfg.zipField + ']"]');
    var city = form.querySelector('[name="item_meta[' + cfg.cityField + ']"]');
    if (!zip) return;

    zip.type = 'text';
    zip.inputMode = 'numeric';
    zip.pattern = '[0-9]{5}';
    zip.maxLength = 5;
    zip.setAttribute('autocomplete', 'postal-code');

    if (city) {
      var cityContainer = city.closest('.frm_form_field');
      if (cityContainer) cityContainer.hidden = true;
    }

    var output = document.createElement('div');
    output.className = 'leapmotor-dealer-result';
    output.setAttribute('aria-live', 'polite');
    zip.closest('.frm_form_field')?.appendChild(output);
    var controller;

    async function lookup() {
      var value = zip.value.trim();
      output.textContent = '';
      if (!/^[0-9]{5}$/.test(value)) return;
      if (controller) controller.abort();
      controller = new AbortController();
      output.textContent = cfg.labels.loading;
      try {
        var response = await fetch(cfg.endpoint + '?zip=' + encodeURIComponent(value), { credentials: 'same-origin', signal: controller.signal });
        if (!response.ok) throw new Error('lookup');
        var dealer = await response.json();
        if (city) city.value = dealer.lead_city || '';
        output.textContent = cfg.labels.prefix + ' ' + dealer.name + ', ' + dealer.city + ' · ca. ' + dealer.distance_km + ' km';
      } catch (error) {
        if (error.name !== 'AbortError') output.textContent = cfg.labels.error;
      }
    }
    zip.addEventListener('input', function () { zip.value = zip.value.replace(/\D/g, '').slice(0, 5); if (zip.value.length === 5) lookup(); else output.textContent = ''; });
    zip.addEventListener('blur', lookup);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
