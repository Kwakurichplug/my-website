/* =========================================================
   LetBetAfrika – SVG icon set: team crests, flags, sports
   ---------------------------------------------------------
   Crests are original badges drawn in each club's colours.
   When a licensed data feed is connected, swap LBA.crest()
   for the provider's logo URL – call sites stay the same.
   ========================================================= */
(() => {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let uid = 0;
  const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

  /* ---------- Sport icons (24×24 line icons) ---------- */
  const SPORT = {
    football: '<circle cx="12" cy="12" r="9"/><path d="M12 8l3 2.2-1.1 3.6h-3.8L9 10.2z"/><path d="M12 3v5M20.6 9.6l-5.6.6M17.4 19.3l-3.5-5.5M6.6 19.3l3.5-5.5M3.4 9.6l5.6.6"/>',
    basketball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.6 5.6c3 3 3 9.8 0 12.8M18.4 5.6c-3 3-3 9.8 0 12.8"/>',
    tennis: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6c3.6 3.6 3.6 9.2 0 12.8M18.4 5.6c-3.6 3.6-3.6 9.2 0 12.8"/>',
    icehockey: '<path d="M4 3l8 14h7a1.5 1.5 0 0 1 0 3h-8.5L3 5"/><ellipse cx="17" cy="8" rx="3" ry="1.4"/>',
    volleyball: '<circle cx="12" cy="12" r="9"/><path d="M12 12V3M12 12l7.8 4.5M12 12l-7.8 4.5M7 4.6c3 2 5 5 5 7.4M20.8 11c-3.3-.5-6.5.3-8.8 1M8.1 20.2c.5-3.4 2-6 3.9-8.2"/>',
    tabletennis: '<circle cx="10" cy="10" r="6.5"/><path d="M14.6 14.6L20 20"/><circle cx="18.5" cy="5.5" r="1.6"/>',
    esports: '<rect x="2.5" y="7" width="19" height="10" rx="5"/><path d="M7 10v4M5 12h4M15.5 11h.01M17.5 13h.01"/>',
    cricket: '<path d="M14 3l7 7-9 9-3-3z"/><path d="M9 16l-5 5"/><circle cx="6" cy="7" r="2"/>',
    rugby: '<ellipse cx="12" cy="12" rx="9.5" ry="5.5" transform="rotate(-45 12 12)"/><path d="M9.5 14.5l5-5M10.5 11.5l2 2M12.5 9.5l2 2"/>',
    handball: '<circle cx="12" cy="12" r="9"/><path d="M4 9c4 1.2 12 1.2 16 0M4 15c4-1.2 12-1.2 16 0M12 3c-2.4 5-2.4 13 0 18"/>',
    boxing: '<path d="M7 7a4 4 0 0 1 4-4h3a5 5 0 0 1 5 5v4a4 4 0 0 1-4 4H9.5A3.5 3.5 0 0 1 6 12.5V10"/><path d="M6 10a2 2 0 0 1 4 0v2M8 16v4h8v-4"/>',
    mma: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M8.5 12h7M12 8.5v7"/>',
    darts: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    vfootball: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/><circle cx="12" cy="10.5" r="3"/>',
    all: '<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 1.5 1 2 2 2 3 1-2 1-5 1-7z"/>',
  };
  const sport = id => `<svg class="sp-ic" viewBox="0 0 24 24" aria-hidden="true">${SPORT[id] || SPORT.all}</svg>`;

  /* ---------- Flags (24×16) ---------- */
  const tri = (a, b, c, vertical) => vertical
    ? `<rect width="8" height="16" fill="${a}"/><rect x="8" width="8" height="16" fill="${b}"/><rect x="16" width="8" height="16" fill="${c}"/>`
    : `<rect width="24" height="5.34" fill="${a}"/><rect y="5.33" width="24" height="5.34" fill="${b}"/><rect y="10.66" width="24" height="5.34" fill="${c}"/>`;
  const GLOBE = '<rect width="24" height="16" fill="#e6e9ed"/><g fill="none" stroke="#7d838c" stroke-width=".9"><circle cx="12" cy="8" r="5.5"/><path d="M6.5 8h11M12 2.5c-2.5 3-2.5 8 0 11M12 2.5c2.5 3 2.5 8 0 11"/></g>';
  const FLAG = {
    eng: '<rect width="24" height="16" fill="#fff"/><path d="M10.4 0h3.2v16h-3.2zM0 6.4h24v3.2H0z" fill="#CE1124"/>',
    es: '<rect width="24" height="16" fill="#AA151B"/><rect y="4" width="24" height="8" fill="#F1BF00"/>',
    it: tri('#009246', '#fff', '#CE2B37', true),
    de: tri('#000', '#DD0000', '#FFCE00'),
    fr: tri('#0055A4', '#fff', '#EF4135', true),
    ng: tri('#008751', '#fff', '#008751', true),
    gh: tri('#CE1126', '#FCD116', '#006B3F') + '<path d="M12 5.4l.75 2.1h2.2l-1.8 1.3.7 2.1-1.85-1.3-1.85 1.3.7-2.1-1.8-1.3h2.2z" fill="#000"/>',
    za: '<rect width="24" height="8" fill="#E03C31"/><rect y="8" width="24" height="8" fill="#001489"/><path d="M0 0L12 8 0 16M12 8h12" fill="none" stroke="#fff" stroke-width="5.4"/><path d="M0 0L12 8 0 16M12 8h12" fill="none" stroke="#007A4D" stroke-width="3.2"/><path d="M0 2.6L8.1 8 0 13.4z" fill="#FFB612"/><path d="M0 4.2L5.7 8 0 11.8z" fill="#000"/>',
    eu: '<rect width="24" height="16" fill="#003399"/>' + Array.from({ length: 12 }, (_, i) => { const a = i / 12 * Math.PI * 2; return `<circle cx="${(12 + Math.cos(a) * 4.6).toFixed(2)}" cy="${(8 + Math.sin(a) * 4.6).toFixed(2)}" r=".75" fill="#FFCC00"/>`; }).join(''),
    us: '<rect width="24" height="16" fill="#fff"/>' + Array.from({ length: 7 }, (_, i) => `<rect y="${(i * 2 * 16 / 13).toFixed(2)}" width="24" height="${(16 / 13).toFixed(2)}" fill="#B22234"/>`).join('') + '<rect width="10" height="8.6" fill="#3C3B6E"/>',
    world: GLOBE,
  };
  const flag = code => `<svg class="flg" viewBox="0 0 24 16" aria-hidden="true">${FLAG[code] || GLOBE}</svg>`;

  /* ---------- Crests ---------- */
  // [primary, secondary, pattern, shape, code]
  const T = {
    'Arsenal': ['#DB0007', '#fff', 'band', 'shield', 'ARS'], 'Chelsea': ['#034694', '#fff', 'plain', 'round', 'CHE'],
    'Liverpool': ['#C8102E', '#F6EB61', 'plain', 'shield', 'LIV'], 'Man City': ['#6CABDD', '#1C2C5B', 'plain', 'round', 'MCI'],
    'Man Utd': ['#DA291C', '#FBE122', 'plain', 'shield', 'MUN'], 'Tottenham': ['#132257', '#fff', 'band', 'shield', 'TOT'],
    'Newcastle': ['#241F20', '#fff', 'stripes', 'round', 'NEW'], 'Aston Villa': ['#670E36', '#95BFE5', 'halves', 'shield', 'AVL'],
    'Brighton': ['#0057B8', '#fff', 'stripes', 'round', 'BHA'], 'West Ham': ['#7A263A', '#1BB1E7', 'chevron', 'shield', 'WHU'],
    'Real Madrid': ['#fff', '#FEBE10', 'band', 'round', 'RMA'], 'Barcelona': ['#A50044', '#004D98', 'stripes', 'classic', 'BAR'],
    'Atletico Madrid': ['#CB3524', '#fff', 'stripes', 'shield', 'ATM'], 'Sevilla': ['#fff', '#D71920', 'band', 'shield', 'SEV'],
    'Villarreal': ['#FFE667', '#005187', 'plain', 'round', 'VIL'], 'Real Sociedad': ['#0067B1', '#fff', 'stripes', 'round', 'RSO'],
    'Valencia': ['#fff', '#EE3524', 'band', 'classic', 'VAL'], 'Betis': ['#00954C', '#fff', 'stripes', 'shield', 'BET'],
    'Inter': ['#010E80', '#111', 'stripes', 'round', 'INT'], 'AC Milan': ['#FB090B', '#111', 'stripes', 'shield', 'MIL'],
    'Juventus': ['#111', '#fff', 'stripes', 'shield', 'JUV'], 'Napoli': ['#12A0D7', '#fff', 'plain', 'round', 'NAP'],
    'Roma': ['#8E1F2F', '#F0BC42', 'halves', 'shield', 'ROM'], 'Lazio': ['#87D8F7', '#fff', 'band', 'badge', 'LAZ'],
    'Atalanta': ['#1E71B8', '#111', 'stripes', 'round', 'ATA'], 'Fiorentina': ['#482E92', '#fff', 'plain', 'classic', 'FIO'],
    'Bayern Munich': ['#DC052D', '#0066B2', 'quarters', 'round', 'FCB'], 'Dortmund': ['#FDE100', '#111', 'band', 'round', 'BVB'],
    'Leverkusen': ['#E32221', '#111', 'halves', 'shield', 'B04'], 'RB Leipzig': ['#DD0741', '#fff', 'sash', 'round', 'RBL'],
    'Frankfurt': ['#111', '#E1000F', 'band', 'shield', 'SGE'], 'Stuttgart': ['#fff', '#E32219', 'band', 'shield', 'VFB'],
    'PSG': ['#004170', '#DA291C', 'vband', 'round', 'PSG'], 'Marseille': ['#2FAEE0', '#fff', 'halves', 'shield', 'OM'],
    'Lyon': ['#fff', '#DA0812', 'band', 'round', 'OL'], 'Monaco': ['#E7182C', '#fff', 'hhalves', 'shield', 'ASM'],
    'Lille': ['#E01E13', '#20325F', 'plain', 'round', 'LOS'], 'Nice': ['#C8102E', '#111', 'stripes', 'shield', 'OGC'],
    'Enyimba': ['#0A47A1', '#fff', 'band', 'shield', 'ENY'], 'Rangers Intl': ['#D71920', '#fff', 'sash', 'shield', 'RAN'],
    'Kano Pillars': ['#FDB913', '#006400', 'band', 'round', 'KAN'], 'Rivers Utd': ['#0033A0', '#FFD100', 'chevron', 'shield', 'RIV'],
    'Shooting Stars': ['#0072CE', '#fff', 'hoops', 'round', '3SC'], 'Remo Stars': ['#7B2D8E', '#FFD100', 'plain', 'shield', 'REM'],
    'Plateau Utd': ['#C8102E', '#fff', 'chevron', 'round', 'PLA'], 'Lobi Stars': ['#002F6C', '#fff', 'band', 'shield', 'LOB'],
    'Asante Kotoko': ['#C8102E', '#fff', 'plain', 'shield', 'AKO'], 'Hearts of Oak': ['#C8102E', '#FFD100', 'quarters', 'round', 'HOA'],
    'Medeama': ['#FFD100', '#003DA5', 'band', 'shield', 'MED'], 'Aduana Stars': ['#FDB913', '#111', 'plain', 'round', 'ADU'],
    'Bechem Utd': ['#006B3F', '#fff', 'sash', 'shield', 'BEC'], 'Dreams FC': ['#00A651', '#FFD100', 'band', 'round', 'DRE'],
    'Mamelodi Sundowns': ['#FFD100', '#006B3F', 'band', 'round', 'MSU'], 'Orlando Pirates': ['#111', '#fff', 'band', 'shield', 'ORL'],
    'Kaizer Chiefs': ['#FFB612', '#111', 'plain', 'round', 'KAI'], 'SuperSport Utd': ['#0033A0', '#fff', 'stripes', 'shield', 'SSU'],
    'Stellenbosch': ['#7B1E2E', '#FFD100', 'band', 'shield', 'STE'], 'Cape Town City': ['#003DA5', '#FFD100', 'chevron', 'round', 'CTC'],
    'Benfica': ['#E83030', '#fff', 'plain', 'round', 'SLB'], 'Porto': ['#00428C', '#fff', 'stripes', 'shield', 'FCP'],
    'Ajax': ['#fff', '#D2122E', 'vband', 'round', 'AJA'], 'Celtic': ['#018749', '#fff', 'hoops', 'round', 'CEL'],
    'PSV': ['#ED1C24', '#fff', 'stripes', 'shield', 'PSV'], 'Club Brugge': ['#0068B7', '#111', 'stripes', 'shield', 'BRU'],
    'Galatasaray': ['#A90432', '#FDB912', 'halves', 'round', 'GAL'], 'Sporting CP': ['#008057', '#fff', 'hoops', 'shield', 'SCP'],
    'Lakers': ['#552583', '#FDB927', 'band', 'round', 'LAL'], 'Celtics': ['#007A33', '#fff', 'plain', 'round', 'BOS'],
    'Warriors': ['#1D428A', '#FFC72C', 'band', 'round', 'GSW'], 'Bucks': ['#00471B', '#EEE1C6', 'plain', 'round', 'MIL'],
    'Nuggets': ['#0E2240', '#FEC524', 'chevron', 'round', 'DEN'], 'Heat': ['#98002E', '#F9A01B', 'sash', 'round', 'MIA'],
    'Knicks': ['#006BB6', '#F58426', 'band', 'round', 'NYK'], 'Suns': ['#1D1160', '#E56020', 'sash', 'round', 'PHX'],
    'Olympiacos': ['#ED1C24', '#fff', 'stripes', 'shield', 'OLY'], 'Fenerbahce': ['#002D72', '#FFED00', 'stripes', 'round', 'FEN'],
    'Panathinaikos': ['#007A33', '#fff', 'plain', 'shield', 'PAO'], 'Al Ahly': ['#C8102E', '#fff', 'plain', 'shield', 'AHL'],
    'Rivers Hoopers': ['#0033A0', '#FFD100', 'band', 'round', 'RIV'], 'Petro de Luanda': ['#004B87', '#FFD100', 'sash', 'shield', 'PET'],
    'Rangers': ['#0038A8', '#CE1126', 'band', 'shield', 'NYR'], 'Bruins': ['#111', '#FFB81C', 'plain', 'round', 'BOS'],
    'Oilers': ['#041E42', '#FF4C00', 'band', 'round', 'EDM'], 'Avalanche': ['#6F263D', '#236192', 'halves', 'shield', 'COL'],
    'Panthers': ['#C8102E', '#041E42', 'chevron', 'shield', 'FLA'], 'Maple Leafs': ['#00205B', '#fff', 'plain', 'round', 'TOR'],
    'Brazil': ['#FEDD00', '#009C3B', 'band', 'shield', 'BRA'], 'Poland': ['#fff', '#DC143C', 'hhalves', 'shield', 'POL'],
    'Italy': ['#0066CC', '#fff', 'plain', 'shield', 'ITA'], 'USA': ['#0A3161', '#B31942', 'hoops', 'shield', 'USA'],
    'France': ['#002395', '#ED2939', 'vband', 'shield', 'FRA'], 'Japan': ['#fff', '#BC002D', 'plain', 'round', 'JPN'],
    'India': ['#0B5ED7', '#FF9933', 'band', 'shield', 'IND'], 'Australia': ['#FFCD00', '#00843D', 'band', 'shield', 'AUS'],
    'England': ['#fff', '#CE1124', 'vband', 'shield', 'ENG'], 'South Africa': ['#007A4D', '#FFB612', 'band', 'shield', 'RSA'],
    'Pakistan': ['#01411C', '#fff', 'plain', 'shield', 'PAK'], 'New Zealand': ['#111', '#fff', 'plain', 'shield', 'NZL'],
    'Argentina': ['#75AADB', '#fff', 'stripes', 'shield', 'ARG'],
    'Kiel': ['#fff', '#000', 'band', 'round', 'THW'], 'Veszprem': ['#E30613', '#fff', 'plain', 'shield', 'VES'],
    'Magdeburg': ['#00843D', '#E30613', 'halves', 'round', 'SCM'], 'Aalborg': ['#E30613', '#fff', 'band', 'shield', 'AAL'],
  };
  const PAL = ['#C8102E', '#0033A0', '#006B3F', '#5B2C83', '#D98E04', '#1a1a1a', '#00838F', '#E65100', '#1565C0', '#8E1F2F'];
  const PAT = ['plain', 'stripes', 'halves', 'sash', 'hoops', 'chevron', 'band', 'quarters'];
  const SHP = ['shield', 'round', 'badge', 'classic'];
  const SHAPE = {
    shield: 'M4 5h32v17c0 12.5-8 19.5-16 23C12 41.5 4 34.5 4 22z',
    badge: 'M20 3l16 5.5v14c0 11.5-7 18.5-16 22.5C11 41 4 34 4 22.5v-14z',
    round: 'M20 5a19 19 0 1 1 0 38a19 19 0 1 1 0-38z',
    classic: 'M4 4h12l4 3 4-3h12v18c0 12.5-8 19.5-16 23C12 41.5 4 34.5 4 22z',
  };
  const pattern = (p, a, b) => {
    const base = `<rect width="40" height="48" fill="${a}"/>`;
    switch (p) {
      case 'stripes': return base + `<path d="M8.5 0h5v48h-5zM17.5 0h5v48h-5zM26.5 0h5v48h-5z" fill="${b}"/>`;
      case 'halves': return base + `<rect x="20" width="20" height="48" fill="${b}"/>`;
      case 'hhalves': return base + `<rect y="24" width="40" height="24" fill="${b}"/>`;
      case 'sash': return base + `<path d="M-4 12L8 0l36 36-12 12z" fill="${b}"/>`;
      case 'hoops': return base + `<path d="M0 13h40v6H0zM0 25h40v6H0z" fill="${b}"/>`;
      case 'chevron': return base + `<path d="M0 12l20 12 20-12v8L20 32 0 20z" fill="${b}"/>`;
      case 'band': return base + `<rect y="18" width="40" height="10" fill="${b}"/>`;
      case 'vband': return base + `<rect x="14" width="12" height="48" fill="${b}"/>`;
      case 'quarters': return base + `<path d="M20 0h20v24H20zM0 24h20v24H0z" fill="${b}"/>`;
      default: return base;
    }
  };
  const PERSON = new Set(['tennis', 'tabletennis', 'boxing', 'mma', 'darts']);
  const codeOf = name => {
    const w = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    return (w.length > 1 ? w.map(x => x[0]).join('') : w[0].slice(0, 3)).slice(0, 3).toUpperCase();
  };
  const initials = name => name.replace(/\./g, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  function crest(name, sportId, big) {
    const h = hash(name);
    if (PERSON.has(sportId)) {
      const hue = h % 360;
      return `<svg class="crest${big ? ' big' : ''}" viewBox="0 0 40 48" aria-hidden="true"><circle cx="20" cy="24" r="18" fill="hsl(${hue} 45% 42%)" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/>${big ? `<text x="20" y="28.5" text-anchor="middle" font-family="Roboto,Arial,sans-serif" font-weight="700" font-size="13" fill="#fff">${esc(initials(name))}</text>` : `<circle cx="20" cy="19" r="5.5" fill="rgba(255,255,255,.85)"/><path d="M10.5 35c1.5-5.5 5-8 9.5-8s8 2.5 9.5 8" fill="rgba(255,255,255,.85)"/>`}</svg>`;
    }
    const t = T[name] || [PAL[h % PAL.length], ['#fff', '#FFD100', '#fff'][h % 3], PAT[(h >>> 3) % PAT.length], SHP[(h >>> 6) % SHP.length], codeOf(name)];
    const [a, b, p, s, code] = t;
    const id = 'lbc' + (++uid);
    return `<svg class="crest${big ? ' big' : ''}" viewBox="0 0 40 48" aria-hidden="true">
      <defs><clipPath id="${id}"><path d="${SHAPE[s]}"/></clipPath>
      <linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      <g clip-path="url(#${id})">${pattern(p, a, b)}<rect width="40" height="48" fill="url(#g${id})"/></g>
      <path d="${SHAPE[s]}" fill="none" stroke="rgba(0,0,0,.38)" stroke-width="2"/>
      <path d="${SHAPE[s]}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width=".8" transform="translate(20 24) scale(.86) translate(-20 -24)"/>
      ${big ? `<text x="20" y="${s === 'round' ? 28.5 : 27.5}" text-anchor="middle" font-family="Roboto,Arial,sans-serif" font-weight="900" font-size="${code.length > 2 ? 11 : 13}" letter-spacing=".3" fill="#fff" stroke="rgba(0,0,0,.55)" stroke-width="2.6" paint-order="stroke">${esc(code)}</text>` : ''}
    </svg>`;
  }

  const code = name => (T[name] && T[name][4]) || codeOf(name);
  window.LBA = { crest, flag, sport, code };
})();
