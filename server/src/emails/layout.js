// Email design system – table-based HTML that renders the same in Gmail, Outlook,
// Apple Mail and Yahoo. 600px wide, inline styles only, system fonts.
// Style reference: clean fintech receipts (lots of white, one headline, one number,
// one button). Brand: green #0a7d3e, gold #ffc20e, ink #1b1e25.

export const BRAND = {
  name: 'LetBetAfrika',
  green: '#0a7d3e', greenDark: '#06612f', gold: '#ffc20e', ink: '#1b1e25',
  text: '#1c1f23', muted: '#6b7280', line: '#e5e7eb', bg: '#f3f4f6', card: '#ffffff',
  red: '#e5163a', amber: '#b45309', amberBg: '#fef3c7', greenBg: '#e6f4ec', redBg: '#fde8ec',
  site: process.env.SITE_URL || 'https://letbetafrika.com',
  support: process.env.SUPPORT_EMAIL || 'support@letbetafrika.com',
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CUR = { NG: { sym: '₦', code: 'NGN', locale: 'en-NG' }, GH: { sym: 'GH₵', code: 'GHS', locale: 'en-GH' } };
export const money = (n, cc = 'NG') => { const c = CUR[cc] || CUR.NG; return c.sym + Number(n || 0).toLocaleString(c.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
export const fmtDate = d => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/* ---------- blocks ---------- */
const B = BRAND;
const td = (inner, style = '') => `<td style="${style}">${inner}</td>`;
const row = (inner, style = '') => `<tr>${td(inner, style)}</tr>`;

export const h1 = text => row(`<h1 style="margin:0;font-family:${B.font};font-size:26px;line-height:32px;font-weight:700;color:${B.ink};letter-spacing:-.3px">${esc(text)}</h1>`, 'padding:0 0 12px');
export const p = (text, opts = {}) => row(`<p style="margin:0;font-family:${B.font};font-size:16px;line-height:24px;color:${opts.muted ? B.muted : B.text}">${text}</p>`, `padding:0 0 ${opts.gap ?? 16}px`);
export const small = text => row(`<p style="margin:0;font-family:${B.font};font-size:13px;line-height:20px;color:${B.muted}">${text}</p>`, 'padding:0 0 12px');

/** Big number hero, e.g. the amount of a deposit. */
export const amount = (label, value, sub, tone = 'ink') => {
  const color = tone === 'green' ? B.green : tone === 'red' ? B.red : B.ink;
  return row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:22px 16px;border:1px solid ${B.line};border-radius:12px;background:#fafafa">
    <div style="font-family:${B.font};font-size:13px;line-height:18px;color:${B.muted};text-transform:uppercase;letter-spacing:.6px">${esc(label)}</div>
    <div style="font-family:${B.font};font-size:38px;line-height:46px;font-weight:700;color:${color};letter-spacing:-.5px;margin-top:4px">${esc(value)}</div>
    ${sub ? `<div style="font-family:${B.font};font-size:14px;line-height:20px;color:${B.muted};margin-top:4px">${esc(sub)}</div>` : ''}
  </td></tr></table>`, 'padding:4px 0 20px');
};

/** Key/value details card. rows: [[label, value, {bold}]] */
export const details = (rows, title) => row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${B.line};border-radius:12px;border-collapse:separate;overflow:hidden">
  ${title ? `<tr><td colspan="2" style="padding:12px 16px;background:#fafafa;border-bottom:1px solid ${B.line};font-family:${B.font};font-size:13px;font-weight:700;color:${B.muted};text-transform:uppercase;letter-spacing:.6px">${esc(title)}</td></tr>` : ''}
  ${rows.map(([k, v, o = {}], i) => `<tr>
    <td style="padding:12px 16px;font-family:${B.font};font-size:14px;line-height:20px;color:${B.muted};${i ? `border-top:1px solid ${B.line}` : ''}">${esc(k)}</td>
    <td align="right" style="padding:12px 16px;font-family:${B.font};font-size:14px;line-height:20px;color:${o.color || B.text};font-weight:${o.bold ? 700 : 500};${i ? `border-top:1px solid ${B.line}` : ''}">${o.raw ? v : esc(v)}</td>
  </tr>`).join('')}
</table>`, 'padding:0 0 20px');

/** Primary button (bulletproof: table + VML-free padding). */
export const button = (text, url, tone = 'green') => row(`<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="${tone === 'gold' ? B.gold : B.green}" style="border-radius:8px">
  <a href="${esc(url)}" style="display:inline-block;padding:14px 28px;font-family:${B.font};font-size:16px;line-height:20px;font-weight:700;color:${tone === 'gold' ? B.ink : '#ffffff'};text-decoration:none;border-radius:8px">${esc(text)}</a>
</td></tr></table>`, 'padding:4px 0 24px');

/** Horizontal status steps, e.g. Requested → Processing → Paid. */
export const steps = (labels, current) => row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  ${labels.map((l, i) => { const done = i <= current, now = i === current; return `<td align="center" width="${Math.floor(100 / labels.length)}%" style="padding:0 2px">
    <div style="height:6px;border-radius:3px;background:${done ? B.green : B.line}"></div>
    <div style="font-family:${B.font};font-size:12px;line-height:16px;margin-top:8px;color:${now ? B.green : done ? B.text : B.muted};font-weight:${now ? 700 : 500}">${esc(l)}</div>
  </td>`; }).join('')}
</tr></table>`, 'padding:0 0 22px');

/** Soft callout. tone: info|warn|success|danger */
export const note = (html, tone = 'info') => {
  const bg = { info: '#eef2ff', warn: B.amberBg, success: B.greenBg, danger: B.redBg }[tone];
  const col = { info: '#3730a3', warn: B.amber, success: B.greenDark, danger: '#9f1239' }[tone];
  return row(`<div style="padding:12px 16px;border-radius:10px;background:${bg};font-family:${B.font};font-size:14px;line-height:21px;color:${col}">${html}</div>`, 'padding:0 0 20px');
};

/** One-time code block. */
export const code = c => row(`<div style="text-align:center;padding:18px;border:2px dashed ${B.green};border-radius:12px;background:${B.greenBg}">
  <div style="font-family:${B.font};font-size:34px;line-height:40px;font-weight:700;letter-spacing:10px;color:${B.ink};padding-left:10px">${esc(c)}</div></div>`, 'padding:4px 0 20px');

export const divider = () => row(`<div style="height:1px;background:${B.line}"></div>`, 'padding:4px 0 20px');

/** Bet selections list for receipts. legs: [{match, market, pick, odd, result}] */
export const legs = list => row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${B.line};border-radius:12px;border-collapse:separate;overflow:hidden">
  ${list.map((l, i) => { const col = l.result === 'won' ? B.green : l.result === 'lost' ? B.red : B.muted; return `<tr>
    <td style="padding:12px 16px;${i ? `border-top:1px solid ${B.line}` : ''}">
      <div style="font-family:${B.font};font-size:15px;line-height:21px;font-weight:600;color:${B.text}">${esc(l.match)}</div>
      <div style="font-family:${B.font};font-size:13px;line-height:19px;color:${B.muted}">${esc(l.market)}: <span style="color:${B.text};font-weight:600">${esc(l.pick)}</span></div>
    </td>
    <td align="right" valign="top" style="padding:12px 16px;white-space:nowrap;${i ? `border-top:1px solid ${B.line}` : ''}">
      <div style="font-family:${B.font};font-size:15px;line-height:21px;font-weight:700;color:${B.text}">${Number(l.odd).toFixed(2)}</div>
      ${l.result ? `<div style="font-family:${B.font};font-size:12px;line-height:18px;font-weight:700;color:${col};text-transform:uppercase">${esc(l.result)}</div>` : ''}
    </td></tr>`; }).join('')}
</table>`, 'padding:0 0 20px');

/* ---------- page ---------- */
export function wrap({ title, preheader = '', body, footerNote, cc = 'NG' }) {
  const year = new Date().getFullYear();
  const country = cc === 'GH' ? 'Ghana' : 'Nigeria';
  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${esc(title)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  body{margin:0;padding:0;background:${B.bg}} table{border-spacing:0} img{border:0;display:block}
  a{color:${B.green}}
  @media (max-width:620px){ .wrap{width:100%!important} .pad{padding:24px 20px!important} .hero{font-size:32px!important} }
</style>
</head>
<body style="margin:0;padding:0;background:${B.bg}">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${B.bg}">${esc(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${B.bg}"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px">
    <!-- header -->
    <tr><td style="padding:0 0 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-family:${B.font};font-size:22px;line-height:28px;font-weight:800;font-style:italic;letter-spacing:-.3px;color:${B.ink}">LetBet<span style="color:${B.green}">Afrika</span></td>
        <td align="right" style="font-family:${B.font};font-size:12px;line-height:16px;color:${B.muted}">${country}</td>
      </tr></table>
    </td></tr>
    <!-- card -->
    <tr><td style="background:${B.card};border-radius:16px;border:1px solid ${B.line}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="height:6px;background:${B.green};border-radius:16px 16px 0 0;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td class="pad" style="padding:32px 36px 20px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table>
        </td></tr>
      </table>
    </td></tr>
    <!-- help -->
    <tr><td style="padding:20px 8px 0;font-family:${B.font};font-size:13px;line-height:20px;color:${B.muted}">
      ${footerNote ? `<p style="margin:0 0 10px">${footerNote}</p>` : ''}
      <p style="margin:0 0 10px">Need help? Reply to this email or write to <a href="mailto:${B.support}" style="color:${B.green};text-decoration:none">${B.support}</a>. We answer 24/7.</p>
    </td></tr>
    <!-- footer -->
    <tr><td style="padding:12px 8px 0;border-top:1px solid ${B.line};margin-top:8px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-family:${B.font};font-size:12px;line-height:18px;color:${B.muted}">
          <a href="${B.site}/#/acct/how" style="color:${B.muted};text-decoration:underline">How to play</a> &nbsp;·&nbsp;
          <a href="${B.site}/#/acct/limits" style="color:${B.muted};text-decoration:underline">Responsible gambling</a> &nbsp;·&nbsp;
          <a href="${B.site}/#/acct/help" style="color:${B.muted};text-decoration:underline">Help</a>
        </td>
        <td align="right" style="font-family:${B.font};font-size:12px;line-height:18px;color:${B.muted};white-space:nowrap">
          <span style="display:inline-block;border:1.5px solid ${B.muted};border-radius:50%;width:22px;height:22px;line-height:22px;text-align:center;font-size:9px;font-weight:700">18+</span>
        </td>
      </tr></table>
      <p style="margin:12px 0 0;font-family:${B.font};font-size:11px;line-height:17px;color:#9ca3af">You received this because you have a LetBetAfrika account. Betting can be addictive, please play responsibly. © ${year} LetBetAfrika ${country}. Licence pending.</p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

/** Plain-text fallback from a few lines. */
export const text = lines => lines.filter(Boolean).join('\n') + `\n\n— ${B.name}\n${B.support}`;
