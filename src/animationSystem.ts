export function showDamageNumber(x: number, y: number, amount: number, type: string): { play: () => void } {
  const element = document.createElement('div');
  element.classList.add('damage-number');
  element.style.left = `${x}px`;
  element.style.top = `${y}px`;
  document.body.appendChild(element);

  return {
    play: () => {
      setTimeout(() => {
        element.remove();
      }, 1000);
    }
  };
}
