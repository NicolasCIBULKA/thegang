// Cartes : { rank: 2..14 (14 = As), suit: 'S' | 'H' | 'D' | 'C' }

export const SUITS = ['S', 'H', 'D', 'C'];
export const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣', X: '★' }; // X : Valet spécial sans couleur
export const RANK_LABELS = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: '10', 11: 'V', 12: 'D', 13: 'R', 14: 'A',
};

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) deck.push({ rank, suit });
  }
  return deck;
}

export function cardLabel(card) {
  return `${RANK_LABELS[card.rank]}${SUIT_SYMBOLS[card.suit]}`;
}
