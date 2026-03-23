import { render, screen } from '@testing-library/react'
import Home from './page'

describe('Home page', () => {
  it('renders something on the page', () => {
    render(<Home />)
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})