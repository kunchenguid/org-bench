export function showDamageNumber(x, y, amount, type) {
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
