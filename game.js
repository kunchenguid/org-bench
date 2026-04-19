const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    requestAnimationFrame(render);
}

render();

console.log('TCG scaffold initialized');