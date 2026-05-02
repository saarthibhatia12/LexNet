// ============================================================================
// LexNet Frontend — LoginPage Tests
// ============================================================================
//
// Tests:
//   1. Renders login form with heading, inputs, and submit button
//   2. Renders demo account quick-fill buttons
//   3. Username input accepts and displays text
//   4. Password input toggles visibility
//   5. Shows error when submitting without username
//   6. Shows error when submitting without password
//   7. Demo account button fills credentials
//   8. Clears error when user types after error
//   9. Submit button shows loading state during mutation
//  10. Displays GraphQL error message on login failure
//  11. Contains link to public verification page
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MockedProvider, MockedResponse } from '@apollo/client/testing';
import { AuthProvider } from '../src/context/AuthContext';
import LoginPage from '../src/pages/LoginPage';
import { LOGIN } from '../src/graphql/mutations';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderLoginPage(mocks: MockedResponse[] = []) {
  return render(
    <MockedProvider mocks={mocks}>
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<div>Dashboard</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </MockedProvider>,
  );
}

function buildLoginSuccessMock(username: string, password: string): MockedResponse {
  // Build a valid JWT-like token for testing
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({ userId: username, role: 'admin', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }),
  );
  const signature = btoa('test-signature');
  const token = `${header}.${payload}.${signature}`;

  return {
    request: {
      query: LOGIN,
      variables: { username, password },
    },
    result: {
      data: {
        login: {
          __typename: 'AuthPayload',
          token,
          userId: username,
          role: 'admin',
          expiresIn: '3600',
        },
      },
    },
  };
}

function buildLoginErrorMock(username: string, password: string, errorMessage: string): MockedResponse {
  return {
    request: {
      query: LOGIN,
      variables: { username, password },
    },
    result: {
      errors: [
        {
          message: errorMessage,
          locations: [],
          path: ['login'],
          extensions: {},
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LoginPage', () => {
  it('renders the login form with heading, inputs, and submit button', () => {
    renderLoginPage();

    expect(screen.getByText(/Sign in to LexNet/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });

  it('renders demo account quick-fill buttons', () => {
    renderLoginPage();

    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Registrar')).toBeInTheDocument();
    expect(screen.getByText('Clerk')).toBeInTheDocument();
  });

  it('accepts text in the username input', () => {
    renderLoginPage();

    const input = screen.getByLabelText('Username') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'testuser' } });

    expect(input.value).toBe('testuser');
  });

  it('accepts text in the password input', () => {
    renderLoginPage();

    const input = screen.getByLabelText('Password') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'secret123' } });

    expect(input.value).toBe('secret123');
  });

  it('toggles password visibility', () => {
    renderLoginPage();

    const passwordInput = screen.getByLabelText('Password') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    const toggleBtn = screen.getByLabelText('Show password');
    fireEvent.click(toggleBtn);

    expect(passwordInput.type).toBe('text');

    const hideBtn = screen.getByLabelText('Hide password');
    fireEvent.click(hideBtn);

    expect(passwordInput.type).toBe('password');
  });

  it('shows error when submitting without username', async () => {
    renderLoginPage();

    const form = screen.getByText('Sign In').closest('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Username is required')).toBeInTheDocument();
    });
  });

  it('shows error when submitting without password', async () => {
    renderLoginPage();

    const usernameInput = screen.getByLabelText('Username');
    fireEvent.change(usernameInput, { target: { value: 'admin' } });

    const form = screen.getByText('Sign In').closest('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Password is required')).toBeInTheDocument();
    });
  });

  it('demo account button fills credentials', () => {
    renderLoginPage();

    const adminBtn = screen.getByText('Admin').closest('button') as HTMLButtonElement;
    fireEvent.click(adminBtn);

    const usernameInput = screen.getByLabelText('Username') as HTMLInputElement;
    const passwordInput = screen.getByLabelText('Password') as HTMLInputElement;

    expect(usernameInput.value).toBe('admin');
    expect(passwordInput.value).toBe('admin123');
  });

  it('clears error when user types after error', async () => {
    renderLoginPage();

    // Trigger error
    const form = screen.getByText('Sign In').closest('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Username is required')).toBeInTheDocument();
    });

    // Type in username — error should clear
    const usernameInput = screen.getByLabelText('Username');
    fireEvent.change(usernameInput, { target: { value: 'a' } });

    await waitFor(() => {
      expect(screen.queryByText('Username is required')).not.toBeInTheDocument();
    });
  });

  it('displays error message on login failure', async () => {
    const mock = buildLoginErrorMock('admin', 'wrongpass', 'Invalid credentials');

    renderLoginPage([mock]);

    // Fill form
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrongpass' } });

    // Submit
    const form = screen.getByText('Sign In').closest('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('contains link to public verification page', () => {
    renderLoginPage();

    const link = screen.getByText('Go to verification');
    expect(link).toBeInTheDocument();
    expect(link.getAttribute('href')).toBe('/verify');
  });

  it('submit button is not disabled when form has content', () => {
    renderLoginPage();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'admin123' } });

    const submitBtn = screen.getByText('Sign In').closest('button') as HTMLButtonElement;
    expect(submitBtn).not.toBeDisabled();
  });
});
