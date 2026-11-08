// Minimal line-style weather icons, one per Home Assistant weather condition.
// They use currentColor, so they follow the text colour of the card.
export const WEATHER_ICONS = {
  "sunny": `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">
      <circle cx="50" cy="50" r="20" fill="currentColor" stroke="none"/>
      <g>${[0,45,90,135,180,225,270,315].map(a=>`<line x1="50" y1="14" x2="50" y2="2" transform="rotate(${a} 50 50)"/>`).join("")}</g>
    </svg>`,

  "clear-night": `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3">
      <path d="M62 20 A32 32 0 1 0 80 72 A26 26 0 0 1 62 20 Z" fill="currentColor" stroke="none"/>
      <g fill="currentColor" stroke="none">
        <circle cx="22" cy="30" r="2.2"/><circle cx="14" cy="55" r="1.6"/><circle cx="30" cy="70" r="1.8"/>
      </g>
    </svg>`,

  "partlycloudy": `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="35" cy="36" r="14" fill="currentColor" stroke="none"/>
      <g>${[0,60,120,180,240,300].map(a=>`<line x1="35" y1="14" x2="35" y2="6" transform="rotate(${a} 35 36)"/>`).join("")}</g>
      <path d="M40 78 H72 A14 14 0 0 0 72 50 A18 18 0 0 0 38 44 A13 13 0 0 0 40 78 Z" fill="#c9d3de" stroke="none" opacity="0.95"/>
    </svg>`,

  "cloudy": `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3">
      <path d="M25 75 H72 A16 16 0 0 0 70 44 A20 20 0 0 0 33 38 A15 15 0 0 0 25 75 Z" fill="currentColor" stroke="none"/>
    </svg>`,

  "fog": `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round">
      <path d="M30 58 A16 16 0 0 1 33 26 A20 20 0 0 1 68 30" />
      <line x1="14" y1="66" x2="86" y2="66"/>
      <line x1="20" y1="78" x2="80" y2="78"/>
      <line x1="28" y1="90" x2="72" y2="90"/>
    </svg>`,

  "rainy": `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">
      <path d="M25 60 H68 A15 15 0 0 0 66 31 A19 19 0 0 0 31 26 A14 14 0 0 0 25 60 Z" fill="currentColor" stroke="none"/>
      <line x1="35" y1="72" x2="30" y2="88"/>
      <line x1="50" y1="72" x2="45" y2="88"/>
      <line x1="65" y1="72" x2="60" y2="88"/>
    </svg>`,

  "pouring": `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">
      <path d="M22 55 H70 A16 16 0 0 0 68 26 A20 20 0 0 0 30 22 A15 15 0 0 0 22 55 Z" fill="currentColor" stroke="none"/>
      <line x1="30" y1="68" x2="24" y2="90"/>
      <line x1="45" y1="68" x2="39" y2="90"/>
      <line x1="60" y1="68" x2="54" y2="90"/>
      <line x1="75" y1="68" x2="69" y2="90"/>
    </svg>`,

  "snowy": `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
      <path d="M25 55 H68 A15 15 0 0 0 66 27 A19 19 0 0 0 31 23 A14 14 0 0 0 25 55 Z" fill="currentColor" stroke="none"/>
      <g transform="translate(0,10)">
        ${[ [36,78],[50,86],[64,78] ].map(([x,y])=>`
          <g transform="translate(${x} ${y})">
            <line x1="-7" y1="0" x2="7" y2="0"/><line x1="0" y1="-7" x2="0" y2="7"/>
            <line x1="-5" y1="-5" x2="5" y2="5"/><line x1="-5" y1="5" x2="5" y2="-5"/>
          </g>`).join("")}
      </g>
    </svg>`,

  "snowy-rainy": `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
      <path d="M25 55 H68 A15 15 0 0 0 66 27 A19 19 0 0 0 31 23 A14 14 0 0 0 25 55 Z" fill="currentColor" stroke="none"/>
      <line x1="34" y1="70" x2="30" y2="84"/>
      <g transform="translate(52 86)">
        <line x1="-7" y1="0" x2="7" y2="0"/><line x1="0" y1="-7" x2="0" y2="7"/>
        <line x1="-5" y1="-5" x2="5" y2="5"/><line x1="-5" y1="5" x2="5" y2="-5"/>
      </g>
      <line x1="70" y1="70" x2="66" y2="84"/>
    </svg>`,

  "lightning": `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3">
      <path d="M25 52 H68 A15 15 0 0 0 66 24 A19 19 0 0 0 31 20 A14 14 0 0 0 25 52 Z" fill="currentColor" stroke="none"/>
      <path d="M55 58 L38 82 H50 L44 96 L66 68 H54 Z" fill="#ffd65c" stroke="none"/>
    </svg>`,

  "lightning-rainy": `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
      <path d="M22 50 H65 A15 15 0 0 0 63 22 A19 19 0 0 0 28 18 A14 14 0 0 0 22 50 Z" fill="currentColor" stroke="none"/>
      <line x1="28" y1="64" x2="23" y2="80"/>
      <path d="M62 56 L48 78 H58 L52 92 L70 66 H60 Z" fill="#ffd65c" stroke="none"/>
    </svg>`,

  "hail": `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3">
      <path d="M25 55 H68 A15 15 0 0 0 66 27 A19 19 0 0 0 31 23 A14 14 0 0 0 25 55 Z" fill="currentColor" stroke="none"/>
      <circle cx="38" cy="78" r="5" fill="#bcd6ea" stroke="none"/>
      <circle cx="56" cy="86" r="5" fill="#bcd6ea" stroke="none"/>
      <circle cx="70" cy="74" r="5" fill="#bcd6ea" stroke="none"/>
    </svg>`,

  "windy": `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round">
      <path d="M12 35 H62 A10 10 0 1 0 52 20"/>
      <path d="M12 55 H78 A11 11 0 1 1 66 72"/>
      <path d="M20 78 H55"/>
    </svg>`,

  "windy-variant": `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round">
      <path d="M12 30 H58 A9 9 0 1 0 49 16" />
      <path d="M12 50 H74 A10 10 0 1 1 63 66" />
      <path d="M16 74 H50" />
      <circle cx="72" cy="78" r="12" fill="currentColor" stroke="none" opacity="0.9"/>
    </svg>`,

  "exceptional": `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4">
      <circle cx="50" cy="50" r="34"/>
      <line x1="50" y1="30" x2="50" y2="55" stroke-linecap="round"/>
      <circle cx="50" cy="68" r="2.5" fill="currentColor" stroke="none"/>
    </svg>`,
};

export function weatherIconSVG(condition) {
  return WEATHER_ICONS[condition] || WEATHER_ICONS["exceptional"];
}

// Small icons for the details and the extra sensors.
export const SENSOR_ICONS = {
  thermometer: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"><path d="M45 20 V62 A16 16 0 1 0 61 62 V20 A8 8 0 0 0 45 20 Z"/><circle cx="53" cy="76" r="6" fill="currentColor"/></svg>`,
  humidity: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="6"><path d="M50 12 C30 40 20 56 20 68 A30 30 0 0 0 80 68 C80 56 70 40 50 12 Z"/></svg>`,
  wind: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"><path d="M10 40 H55 A9 9 0 1 0 47 26"/><path d="M10 58 H68 A10 10 0 1 1 58 74"/></svg>`,
  pressure: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="6"><circle cx="50" cy="50" r="34"/><line x1="50" y1="50" x2="50" y2="28" stroke-linecap="round"/><line x1="50" y1="50" x2="65" y2="58" stroke-linecap="round"/></svg>`,
};
