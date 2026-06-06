document.addEventListener("DOMContentLoaded", () => {
    const container = document.createElement('div');
    container.className = 'shapes-container';
    document.body.appendChild(container);

    const shapes = ['▲', '◯', '✕', '◻'];
    const classes = ['triangle', 'circle', 'cross', 'square'];

    // Generate 20 falling shapes
    for (let i = 0; i < 20; i++) {
        const shape = document.createElement('div');
        const randIndex = Math.floor(Math.random() * shapes.length);
        shape.textContent = shapes[randIndex];
        shape.className = `ps-shape ${classes[randIndex]}`;
        
        const left = Math.random() * 100;
        const duration = 10 + Math.random() * 15; // 10 to 25 seconds (slow, smooth fall)
        const delay = Math.random() * 20;
        const size = 1.5 + Math.random() * 2;
        const opacity = 0.2 + Math.random() * 0.4;

        shape.style.left = `${left}vw`;
        shape.style.animationDuration = `${duration}s`;
        shape.style.animationDelay = `-${delay}s`;
        shape.style.fontSize = `${size}rem`;
        shape.style.opacity = opacity;

        container.appendChild(shape);
    }
});
