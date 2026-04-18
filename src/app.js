export function renderApp() {
  const shell = document.createElement('main')
  shell.className = 'shell'
  shell.innerHTML = `
    <section class="hero">
      <p class="eyebrow">Run bootstrap</p>
      <h1>Amazon Seed 01</h1>
      <p class="lede">A minimal branch-ready shell for the run team.</p>
    </section>
  `

  return shell
}
