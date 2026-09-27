import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'

const { resetPasswordForEmail, signUp } = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  signUp: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      resetPasswordForEmail,
      signInWithPassword: vi.fn(),
      signUp,
    },
  },
}))

describe('LoginPage account recovery and registration', () => {
  beforeEach(() => {
    resetPasswordForEmail.mockReset().mockResolvedValue({ error: null })
    signUp.mockReset().mockResolvedValue({ data: { session: null }, error: null })
  })

  it('requests a recovery email with the reset-password callback URL', async () => {
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('EMAIL'), { target: { value: 'viewer@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'FORGOT PASSWORD?' }))

    await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledWith('viewer@example.com', {
      redirectTo: `${window.location.origin}/reset-password`,
    }))
    expect(await screen.findByText(/a recovery link is on its way/i)).toBeInTheDocument()
  })

  it('shows a success toast after creating an account that needs email confirmation', async () => {
    render(<LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: 'CREATE ACCOUNT' }))
    fireEvent.change(screen.getByLabelText('EMAIL'), { target: { value: 'viewer@example.com' } })
    fireEvent.change(screen.getByLabelText('PASSWORD'), { target: { value: 'a-secure-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'CREATE ACCOUNT' }))

    await waitFor(() => expect(signUp).toHaveBeenCalled())
    expect(await screen.findByText(/account created. check your email/i)).toBeInTheDocument()
  })
})
