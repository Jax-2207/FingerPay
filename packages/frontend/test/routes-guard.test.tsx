// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute, PublicOnlyRoute } from '../src/components/ProtectedRoute.js';
import * as AuthContextModule from '../src/auth/AuthContext.js';

describe('Frontend Route Guards', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });
  it('redirects unauthenticated users to /login', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      profile: null,
      loading: false,
      refreshProfile: vi.fn(),
      logout: vi.fn(),
      signIn: vi.fn(),
      signUp: vi.fn(),
      error: null,
      clearError: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>Dashboard Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Login Page')).toBeDefined();
  });

  it('redirects pending users to /pending', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { uid: 'user-1' } as never,
      profile: {
        uid: 'user-1',
        name: 'Student One',
        email: 'student@campus.edu',
        prn: 'PRN-001',
        role: 'user',
        status: 'pending',
        walletAddress: '0x123',
        balance: '0',
        passkeyRegistered: false,
        pinSet: false,
      },
      loading: false,
      refreshProfile: vi.fn(),
      logout: vi.fn(),
      signIn: vi.fn(),
      signUp: vi.fn(),
      error: null,
      clearError: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/pending" element={<div>Pending Page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>Dashboard Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Pending Page')).toBeDefined();
  });

  it('redirects approved users without passkey/pin to /onboarding', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { uid: 'user-1' } as never,
      profile: {
        uid: 'user-1',
        name: 'Student One',
        email: 'student@campus.edu',
        prn: 'PRN-001',
        role: 'user',
        status: 'approved',
        walletAddress: '0x123',
        balance: '50',
        passkeyRegistered: false,
        pinSet: false,
      },
      loading: false,
      refreshProfile: vi.fn(),
      logout: vi.fn(),
      signIn: vi.fn(),
      signUp: vi.fn(),
      error: null,
      clearError: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/onboarding" element={<div>Onboarding Page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>Dashboard Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Onboarding Page')).toBeDefined();
  });

  it('allows access to protected routes when user is fully onboarded', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { uid: 'user-1' } as never,
      profile: {
        uid: 'user-1',
        name: 'Student One',
        email: 'student@campus.edu',
        prn: 'PRN-001',
        role: 'user',
        status: 'approved',
        walletAddress: '0x123',
        balance: '150',
        passkeyRegistered: true,
        pinSet: true,
      },
      loading: false,
      refreshProfile: vi.fn(),
      logout: vi.fn(),
      signIn: vi.fn(),
      signUp: vi.fn(),
      error: null,
      clearError: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>Dashboard Protected Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Dashboard Protected Page')).toBeDefined();
  });

  it('redirects onboarded authenticated users away from public auth pages', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { uid: 'user-1' } as never,
      profile: {
        uid: 'user-1',
        name: 'Student One',
        email: 'student@campus.edu',
        prn: 'PRN-001',
        role: 'user',
        status: 'approved',
        walletAddress: '0x123',
        balance: '100',
        passkeyRegistered: true,
        pinSet: true,
      },
      loading: false,
      refreshProfile: vi.fn(),
      logout: vi.fn(),
      signIn: vi.fn(),
      signUp: vi.fn(),
      error: null,
      clearError: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/" element={<div>Home Page</div>} />
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<div>Login Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Home Page')).toBeDefined();
  });
});
