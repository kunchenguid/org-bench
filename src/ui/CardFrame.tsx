export type Faction = 'ember' | 'verdant';

export type CardFrameProps = {
  faction: Faction;
  title: string;
  cost: number;
  kind: string;
  attack: number;
  health: number;
  rules: string;
  size?: 'standard' | 'compact';
};

export const cardFactionThemes: Record<Faction, { label: string; accent: string; summary: string }> = {
  ember: {
    label: 'Ashfall Covenant',
    accent: '#f4a259',
    summary: 'Fast pressure and direct damage',
  },
  verdant: {
    label: 'Verdant Loom',
    accent: '#7edb9c',
    summary: 'Resilience and attrition',
  },
};

function CardMotif(props: { faction: Faction }) {
  if (props.faction === 'ember') {
    return (
      <svg className="card-motif" data-motif="ember" viewBox="0 0 240 160" aria-hidden="true">
        <defs>
          <linearGradient id="ember-glow" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#ffd6a1" />
            <stop offset="100%" stopColor="#dd5849" />
          </linearGradient>
        </defs>
        <path d="M45 122c22-44 55-74 85-92-6 24 2 45 20 64 12 13 26 23 45 30-39 8-81 10-150-2Z" fill="url(#ember-glow)" opacity="0.9" />
        <path d="M133 27c14 31 10 57-12 76" fill="none" stroke="#fff4dc" strokeWidth="4" strokeLinecap="round" />
        <circle cx="86" cy="102" r="18" fill="rgba(255,244,220,0.18)" />
      </svg>
    );
  }

  return (
    <svg className="card-motif" data-motif="verdant" viewBox="0 0 240 160" aria-hidden="true">
      <defs>
        <linearGradient id="verdant-glow" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#dff9d6" />
          <stop offset="100%" stopColor="#3aa36d" />
        </linearGradient>
      </defs>
      <path d="M58 121c16-48 46-77 91-88-11 17-15 36-11 57 4 18 12 32 25 43-40 6-74 3-105-12Z" fill="url(#verdant-glow)" opacity="0.88" />
      <path d="M121 34c-24 22-37 48-39 78" fill="none" stroke="#efffe7" strokeWidth="4" strokeLinecap="round" />
      <path d="M138 49c-6 18-5 37 4 56" fill="none" stroke="#efffe7" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function CardFrame(props: CardFrameProps) {
  const theme = cardFactionThemes[props.faction];
  const sizeClass = props.size === 'compact' ? ' card-frame-compact' : '';

  return (
    <article className={`card-frame card-frame-${props.faction}${sizeClass}`}>
      <header className="card-topline">
        <span className="card-faction">{theme.label}</span>
        <span className="card-type">{props.kind}</span>
      </header>

      <div className="card-cost" aria-label={`Cost ${props.cost}`}>
        <span>{props.cost}</span>
      </div>

      <div className="card-art" style={{ '--card-accent': theme.accent }}>
        <CardMotif faction={props.faction} />
      </div>

      <div className="card-copy">
        <h3>{props.title}</h3>
        <p className="card-rules">{props.rules}</p>
      </div>

      <footer className="card-stats">
        <div className="stat-badge" aria-label={`Attack ${props.attack}`}>
          <strong>{props.attack}</strong>
          <span>Attack</span>
        </div>
        <div className="stat-badge" aria-label={`Health ${props.health}`}>
          <strong>{props.health}</strong>
          <span>Health</span>
        </div>
      </footer>
    </article>
  );
}
