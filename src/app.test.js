import { describe, expect, it } from 'vitest'

import { renderApp } from './app'

describe('renderApp', () => {
  it('renders a shell with project framing copy', () => {
    const app = renderApp()

    expect(app.querySelector('h1')?.textContent).toBe('Amazon Seed 01')
    expect(app.textContent).toContain('A minimal branch-ready shell for the run team.')
  })
})
