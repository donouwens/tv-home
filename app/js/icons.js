// Inline stroke icons (currentColor).
const wrap = (body, sw) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.8) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';

export const icons = {
  gamepad: wrap('<path d="M7 7h10a5 5 0 0 1 4.9 6l-.7 3.4a2.6 2.6 0 0 1-4.5 1.2L14.9 16H9.1l-1.8 1.6a2.6 2.6 0 0 1-4.5-1.2L2.1 13A5 5 0 0 1 7 7z"/><path d="M7.5 10v4M5.5 12h4"/><path d="M15.5 11h.01M18 13h.01"/>'),
  screen: wrap('<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'),
  play: wrap('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M10 9l5 3-5 3z"/>'),
  playSolid: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>',
  muted: wrap('<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M23 9l-6 6M17 9l6 6"/>'),
  sound: wrap('<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>'),
  // weather
  cloud: wrap('<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>', 1.6),
  sun: wrap('<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', 1.6),
  moon: wrap('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', 1.6),
  partly: wrap('<path d="M8 3.5v1.5M3.5 8H2M4.8 4.8l1 1M12.2 4.8l-1 1"/><path d="M5.6 11.2A4 4 0 0 1 11.7 6.6"/><path d="M18 12h-1a6 6 0 1 0-6 8h7a4 4 0 0 0 0-8z"/>', 1.6),
  rain: wrap('<path d="M18 9h-1.26A8 8 0 1 0 9 17h9a4 4 0 0 0 0-8z"/><path d="M8 20l-1 2M12 20l-1 2M16 20l-1 2"/>', 1.6),
  snow: wrap('<path d="M18 9h-1.26A8 8 0 1 0 9 17h9a4 4 0 0 0 0-8z"/><path d="M8 20.5h.01M12 21.5h.01M16 20.5h.01"/>', 2),
  fog: wrap('<path d="M4 9h16M2 13h20M5 17h14M8 21h8"/>', 1.6),
  storm: wrap('<path d="M18 9h-1.26A8 8 0 1 0 9 17h1"/><path d="M13 13l-2 4h3l-2 4"/>', 1.6)
};
