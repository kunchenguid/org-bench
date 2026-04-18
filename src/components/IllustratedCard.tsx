import { type Card, getFaction } from '../data/cards';

type IllustratedCardProps = {
  card: Card;
  surface: 'gallery' | 'play';
};

export function IllustratedCard({ card, surface }: IllustratedCardProps) {
  const faction = getFaction(card.faction);

  return (
    <article className={`illustrated-card ${card.faction} ${surface}`}>
      <div className="card-topline">
        <span className="card-faction">{faction.name}</span>
        <span className="card-cost">{card.cost}</span>
      </div>
      <div className="card-art" aria-label={card.artLabel} role="img" />
      <div className="card-body">
        <div className="card-heading">
          <h3>{card.name}</h3>
          <p>
            {card.type}
            {card.stats ? ` - ${card.stats}` : ''}
          </p>
        </div>
        <p className="card-rules">{card.rulesText}</p>
      </div>
    </article>
  );
}
