// "A ISTN-SJ pelo mundo": the continents as dots and, on top, a light for
// every country where there is an ISTN — bigger where there are more places,
// a ring where the church meets online only.
//
// Countries, not churches: the map says where the ISTN is, and only the
// team's list says where each place is. A light is at the middle of its
// country; tapping it, or the country in the list below, filters the
// directory.
import { countryFlag, countryPresence } from '../directory.js';
import { escapeHtml } from '../html.js';
import { WORLD_DOTS } from '../world-dots.js';

// Roughly the middle of each country, in degrees (latitude, longitude).
const COUNTRY_POINTS = {
  AO: [-12.3, 17.6], BR: [-12, -51.5], PT: [39.6, -8], MZ: [-17.5, 35.3], DE: [51.2, 10.4], GB: [52.8, -1.6],
  FR: [46.6, 2.4], ST: [0.3, 6.7], US: [39.5, -98.5], CA: [56, -100], ZA: [-29, 25], CH: [46.8, 8.2],
  NO: [61, 9], CD: [-2.9, 23.6], CG: [-0.7, 15.2], TZ: [-6.4, 34.9], KE: [0.2, 37.9], SN: [14.5, -14.5],
  PL: [52, 19.4], ES: [40.2, -3.6], BE: [50.6, 4.6], NL: [52.2, 5.5], IT: [42.8, 12.6], CV: [15.1, -23.6],
  GW: [12, -15], NA: [-22.6, 17.1], ZM: [-13.5, 27.8], IE: [53.2, -8], LU: [49.8, 6.1]
};

let landPath = '';
function land() {
  if (landPath) return landPath;
  const parts = [];
  WORLD_DOTS.runs.forEach((row, index) => row.split(' ').filter(Boolean).forEach((run) => {
    const [first, length] = run.split('.').map(Number);
    for (let col = first; col < first + length; col += 1) parts.push(`M${col + 0.5} ${index + 0.5}h0`);
  }));
  landPath = parts.join('');
  return landPath;
}

const project = ([lat, lng]) => [(lng + 180) / WORLD_DOTS.step, (WORLD_DOTS.north - lat) / WORLD_DOTS.step];

export function worldMap(churches) {
  const presence = countryPresence(churches);
  const lights = presence.filter((entry) => COUNTRY_POINTS[entry.code])
    // Small ones last, so a big light never hides a small neighbour.
    .sort((a, b) => (b.physical + b.online) - (a.physical + a.online))
    .map((entry) => {
      const [x, y] = project(COUNTRY_POINTS[entry.code]);
      const radius = entry.physical ? Math.min(1.9, 0.72 + Math.sqrt(entry.physical) * 0.2) : 0.62;
      // Pointer only: the same choice is in the list of countries below, as
      // buttons, for the keyboard and screen readers.
      return `<g class="map-light ${entry.physical ? '' : 'is-online'}" data-action="church-country" data-country="${escapeHtml(entry.country)}">
        <title>${escapeHtml(`${entry.country}: ${countLabel(entry)}`)}</title>
        ${entry.physical ? `<circle class="map-glow" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(radius * 2.4).toFixed(2)}" />` : ''}
        <circle class="map-dot" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${radius.toFixed(2)}" />
        <circle class="map-hit" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${Math.max(2.2, radius + 1).toFixed(2)}" />
      </g>`;
    }).join('');

  const places = presence.reduce((sum, entry) => sum + entry.physical, 0);
  const online = presence.reduce((sum, entry) => sum + entry.online, 0);

  return `<section class="world-card" aria-labelledby="world-title">
    <div class="world-heading">
      <span class="eyebrow">Todas as nações</span>
      <h2 id="world-title">A ISTN-SJ pelo mundo</h2>
    </div>
    <dl class="world-stats">
      <div><dt>Países</dt><dd>${presence.length}</dd></div>
      <div><dt>Lugares de culto</dt><dd>${places}</dd></div>
      <div><dt>Igrejas online</dt><dd>${online}</dd></div>
    </dl>
    <svg class="world-map" viewBox="0 0 ${WORLD_DOTS.cols} ${WORLD_DOTS.rows}" role="img" aria-label="Mapa do mundo com os ${presence.length} países onde está a ISTN-SJ">
      <path class="map-land" d="${land()}" />
      ${lights}
    </svg>
    <p class="world-legend"><span class="legend-dot"></span>Presencial <span class="legend-ring"></span>Só online <span class="world-hint">Toque num país para ver as igrejas.</span></p>
    <ul class="country-chips" aria-label="Países">${presence.map((entry) => `<li><button type="button" data-action="church-country" data-country="${escapeHtml(entry.country)}" data-focus-key="country:${escapeHtml(entry.country)}">
      <span aria-hidden="true">${countryFlag(entry.code)}</span>${escapeHtml(entry.country)}<small>${entry.physical + entry.online}</small>
    </button></li>`).join('')}</ul>
  </section>`;
}

function countLabel(entry) {
  const parts = [];
  if (entry.physical) parts.push(entry.physical === 1 ? '1 lugar de culto' : `${entry.physical} lugares de culto`);
  if (entry.online) parts.push(entry.online === 1 ? '1 igreja online' : `${entry.online} igrejas online`);
  return parts.join(' e ');
}
