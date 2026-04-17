import { cardGroups, keywordGlossary } from './card-reference';
import { starterDecks } from './card-data';

export function CardReferenceView() {
  return (
    <main class="cards-layout">
      <section class="panel">
        <p class="section-kicker">Starter decks</p>
        <h2>Launch decks</h2>
        <div class="deck-grid">
          {starterDecks.map((deck) => (
            <article class="deck-card" key={deck.id}>
              <h3>{deck.name}</h3>
              <p>{deck.summary}</p>
              <p class="deck-meta">20 cards · {deck.faction}</p>
            </article>
          ))}
        </div>
      </section>

      <section class="panel muted">
        <p class="section-kicker">Keyword glossary</p>
        <h2>Core mechanics</h2>
        <div class="keyword-grid">
          {keywordGlossary.map((entry) => (
            <article class="keyword-card" key={entry.keyword}>
              <h3>{entry.keyword}</h3>
              <p>{entry.explanation}</p>
            </article>
          ))}
        </div>
      </section>

      {cardGroups.map((group) => (
        <section class="panel" key={group.id}>
          <p class="section-kicker">Faction reference</p>
          <h2>{group.title}</h2>
          <p>{group.description}</p>
          <div class="card-grid">
            {group.cards.map((card) => (
              <article class="reference-card" key={card.id}>
                <div class="reference-topline">
                  <p class="section-kicker">{card.type}</p>
                  <span class="mana-badge">{card.cost}</span>
                </div>
                <h3>{card.name}</h3>
                <p class="stats-line">{card.stats}</p>
                <p>{card.text}</p>
                <p class="keyword-line">
                  {card.keywords.length > 0 ? `Keywords: ${card.keywords.join(', ')}` : 'Keywords: none'}
                </p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
