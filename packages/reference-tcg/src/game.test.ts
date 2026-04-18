import assert from "node:assert/strict";
import test from "node:test";

import {
  createEncounter,
  createStarterDeck,
  endTurn,
  playCard,
} from "./index.js";

test("createStarterDeck provides a broader 20-card pool for the public site", () => {
  const deck = createStarterDeck();
  const uniqueCards = new Map(deck.map((card) => [card.name, card]));
  const creatureCount = deck.filter((card) => card.type === "creature").length;
  const spellCount = deck.filter((card) => card.type === "spell").length;

  assert.equal(deck.length, 20);
  assert.equal(uniqueCards.size >= 8, true);
  assert.equal(creatureCount >= 8, true);
  assert.equal(spellCount >= 8, true);
});

test("createEncounter initializes the required duel zones and visible stats", () => {
  const encounter = createEncounter();

  assert.equal(encounter.turn, 1);
  assert.equal(encounter.activePlayer, "player");
  assert.equal(encounter.player.hp, 20);
  assert.equal(encounter.enemy.hp, 16);
  assert.equal(encounter.player.resources.current, 1);
  assert.equal(encounter.player.resources.max, 1);
  assert.equal(encounter.player.hand.length, 4);
  assert.equal(encounter.player.deck.length, 16);
  assert.deepEqual(encounter.player.discard, []);
  assert.deepEqual(encounter.player.battlefield, []);
  assert.equal(encounter.enemy.hand.length, 4);
  assert.equal(encounter.enemy.deck.length, 16);
  assert.deepEqual(encounter.enemy.discard, []);
  assert.deepEqual(encounter.enemy.battlefield, []);
});

test("playCard spends resources and moves creatures onto the battlefield", () => {
  const encounter = createEncounter({
    playerDeck: createStarterDeck(),
  });
  const card = encounter.player.hand.find(
    (entry) => entry.type === "creature" && entry.cost === 1,
  );

  assert.ok(card);

  const next = playCard(encounter, card.id);

  assert.equal(next.player.resources.current, 0);
  assert.equal(next.player.battlefield.length, 1);
  assert.equal(next.player.battlefield[0]?.id, card.id);
  assert.equal(
    next.player.hand.some((entry) => entry.id === card.id),
    false,
  );
});

test("playCard resolves spells immediately into the discard pile", () => {
  const encounter = createEncounter({
    playerDeck: [
      {
        id: "spark-1",
        name: "Spark Volley",
        type: "spell",
        cost: 1,
        damage: 3,
      },
      ...createStarterDeck().slice(0, 19),
    ],
  });
  const spell = encounter.player.hand.find((entry) => entry.id === "spark-1");

  assert.ok(spell);

  const next = playCard(encounter, spell.id);

  assert.equal(next.enemy.hp, 13);
  assert.equal(next.player.resources.current, 0);
  assert.equal(next.player.discard.at(-1)?.id, spell.id);
});

test("endTurn resolves enemy actions and advances to the next player turn", () => {
  const encounter = createEncounter();
  const played = playCard(
    encounter,
    encounter.player.hand.find(
      (entry) => entry.type === "creature" && entry.cost === 1,
    )!.id,
  );

  const next = endTurn(played);

  assert.equal(next.turn, 2);
  assert.equal(next.activePlayer, "player");
  assert.equal(next.player.resources.current, 2);
  assert.equal(next.player.resources.max, 2);
  assert.equal(next.player.hand.length >= 4, true);
  assert.equal(next.enemy.hp < played.enemy.hp, true);
  assert.equal(next.player.hp < played.player.hp, true);
});

test("endTurn declares victory when the enemy is defeated during combat", () => {
  const encounter = createEncounter({
    enemyHp: 2,
  });
  const played = playCard(
    encounter,
    encounter.player.hand.find(
      (entry) => entry.type === "creature" && entry.cost === 1,
    )!.id,
  );

  const next = endTurn(played);

  assert.equal(next.status, "victory");
  assert.equal(next.enemy.hp <= 0, true);
});
