// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from '../src/pages/Dashboard.js';
import { Pay } from '../src/pages/Pay.js';
import { History } from '../src/pages/History.js';
import { Profile } from '../src/pages/Profile.js';
import { Scan } from '../src/pages/Scan.js';
import { api } from '../src/api.js';
import * as AuthContextModule from '../src/auth/AuthContext.js';
import * as PasskeyModule from '../src/passkey.js';

describe('Student Application Pages and Workflows', () => {
  let queryClient: QueryClient;

  const mockProfile = {
    uid: 'user-101',
    name: 'Jay Wani',
    email: 'jay@campus.edu',
    prn: 'PRN-2024-001',
    role: 'user',
    status: 'approved' as const,
    walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
    balance: '175',
    passkeyRegistered: true,
    pinSet: true,
  };

  const mockLogout = vi.fn();
  const mockRefreshProfile = vi.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { uid: 'user-101' } as never,
      profile: mockProfile,
      loading: false,
      refreshProfile: mockRefreshProfile,
      logout: mockLogout,
      signIn: vi.fn(),
      signUp: vi.fn(),
      error: null,
      clearError: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders student dashboard with on-chain balance, PRN, and recent transactions', async () => {
    vi.spyOn(api, 'getHistory').mockResolvedValue({
      transactions: [
        {
          id: 'tx-1',
          merchantName: 'Campus Canteen',
          category: 'food',
          amount: '40',
          status: 'confirmed',
          txHash: '0xabcdef123456',
        },
      ],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // CPC balance displayed
    expect(screen.getByText('175')).toBeDefined();
    expect(screen.getByText('CampusCoin (CPC) Balance')).toBeDefined();
    // PRN displayed
    expect(screen.getByText('PRN-2024-001')).toBeDefined();
    // Quick action buttons
    expect(screen.getByText('Scan & Pay')).toBeDefined();
    expect(screen.getByText('Analytics')).toBeDefined();

    // Recent transaction loaded
    await waitFor(() => {
      expect(screen.getByText('Campus Canteen')).toBeDefined();
      expect(screen.getByText('-40 CPC')).toBeDefined();
    });
  });

  it('renders payment request screen and enforces explicit student approval', async () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 120;
    vi.spyOn(api, 'getPaymentIntent').mockResolvedValue({
      id: '0xintent999',
      intentId: '0xintent999',
      merchantUid: 'merch-1',
      merchantAddress: '0x9999999999999999999999999999999999999999',
      merchantName: 'College Bookstore',
      category: 'stationery',
      amount: '85',
      expiry: futureExpiry,
      status: 'created',
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/pay/0xintent999']}>
          <Routes>
            <Route path="/pay/:intentId" element={<Pay />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Verifies merchant details and amount are displayed
    await waitFor(() => {
      expect(screen.getByText('College Bookstore')).toBeDefined();
      expect(screen.getByText('85')).toBeDefined();
      expect(screen.getByText('Approve & Pay 85 CPC')).toBeDefined();
      expect(screen.getByText('Cancel')).toBeDefined();
    });
  });

  it('handles expired payment intent and prevents payment approval', async () => {
    const pastExpiry = Math.floor(Date.now() / 1000) - 30; // expired
    vi.spyOn(api, 'getPaymentIntent').mockResolvedValue({
      id: '0xexpired',
      intentId: '0xexpired',
      merchantUid: 'merch-1',
      merchantAddress: '0x9999999999999999999999999999999999999999',
      merchantName: 'College Bookstore',
      amount: '50',
      expiry: pastExpiry,
      status: 'expired',
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/pay/0xexpired']}>
          <Routes>
            <Route path="/pay/:intentId" element={<Pay />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/This payment request has expired/i)).toBeDefined();
      expect(screen.queryByText(/Approve & Pay/i)).toBeNull();
    });
  });

  it('completes passkey verification, PIN entry, and confirms payment', async () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 120;
    vi.spyOn(api, 'getPaymentIntent').mockResolvedValue({
      id: '0xvalid',
      intentId: '0xvalid',
      merchantUid: 'merch-1',
      merchantAddress: '0x9999999999999999999999999999999999999999',
      merchantName: 'Campus Canteen',
      amount: '30',
      expiry: futureExpiry,
      status: 'created',
    });

    vi.spyOn(api, 'getPaymentAuthOptions').mockResolvedValue({
      challengeId: 'challenge-uuid-1',
      options: { challenge: 'abc' },
    });

    vi.spyOn(PasskeyModule, 'authenticateWithPasskey').mockResolvedValue({
      challengeId: 'challenge-uuid-1',
      response: { id: 'key-1', rawId: 'key-1' } as never,
    });

    const confirmPaymentSpy = vi.spyOn(api, 'confirmPayment').mockResolvedValue({
      status: 'confirmed',
      txHash: '0xdeadbeef1234567890abcdef',
      intentId: '0xvalid',
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/pay/0xvalid']}>
          <Routes>
            <Route path="/pay/:intentId" element={<Pay />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Approve & Pay 30 CPC')).toBeDefined();
    });

    // Student taps Pay
    fireEvent.click(screen.getByText('Approve & Pay 30 CPC'));

    // PIN modal opens after WebAuthn passkey step
    await waitFor(() => {
      expect(screen.getByText('Enter Security PIN')).toBeDefined();
    });

    const pinInput = screen.getByPlaceholderText('••••');
    fireEvent.change(pinInput, { target: { value: '5678' } });

    // Submit PIN
    fireEvent.click(screen.getByText('Authorize'));

    await waitFor(() => {
      expect(confirmPaymentSpy).toHaveBeenCalledWith('0xvalid', {
        challengeId: 'challenge-uuid-1',
        pin: '5678',
        assertion: { id: 'key-1', rawId: 'key-1' },
      });
      expect(screen.getByText('Payment Confirmed!')).toBeDefined();
      expect(screen.getByText(/30 CPC transferred to Campus Canteen/i)).toBeDefined();
    });
  });

  it('renders transaction history and filters by status', async () => {
    vi.spyOn(api, 'getHistory').mockResolvedValue({
      transactions: [
        {
          id: 'tx-1',
          merchantName: 'Campus Canteen',
          amount: '25',
          status: 'confirmed',
          category: 'food',
        },
        {
          id: 'tx-2',
          merchantName: 'Stationery Store',
          amount: '50',
          status: 'refunded',
          type: 'refund',
          category: 'supplies',
        },
      ],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <History />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Campus Canteen')).toBeDefined();
      expect(screen.getByText('Stationery Store')).toBeDefined();
    });

    // Filter by refunded button
    fireEvent.click(screen.getByRole('button', { name: /^refunded$/i }));

    await waitFor(() => {
      expect(screen.queryByText('Campus Canteen')).toBeNull();
      expect(screen.getByText('Stationery Store')).toBeDefined();
      expect(screen.getByText('+50 CPC')).toBeDefined();
    });
  });

  it('renders student profile and performs sign out', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Profile />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('Jay Wani')).toBeDefined();
    expect(screen.getByText('PRN-2024-001')).toBeDefined();
    expect(screen.getByText('200 CPC')).toBeDefined();
    expect(screen.getByText('500 CPC')).toBeDefined();

    // Click Sign Out
    fireEvent.click(screen.getByText('Sign Out'));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('validates manual intent submission and navigates to pay screen on valid ID', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/scan']}>
          <Routes>
            <Route path="/scan" element={<Scan />} />
            <Route
              path="/pay/:intentId"
              element={<div data-testid="pay-screen">Pay Screen Loaded</div>}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('Scan Merchant QR')).toBeDefined();
    expect(screen.getByPlaceholderText('e.g. 0x8a9b... or /pay/0x...')).toBeDefined();

    const input = screen.getByPlaceholderText('e.g. 0x8a9b... or /pay/0x...');
    const submitBtn = screen.getByText('Proceed to Payment');

    // Submit valid path
    fireEvent.change(input, {
      target: { value: 'https://fingerpay.campus.edu/pay/0x1234567890abcdef' },
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('pay-screen')).toBeDefined();
    });
  });

  it('rejects invalid manual intent payloads with error alert', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/scan']}>
          <Routes>
            <Route path="/scan" element={<Scan />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const input = screen.getByPlaceholderText('e.g. 0x8a9b... or /pay/0x...');
    const submitBtn = screen.getByText('Proceed to Payment');

    // Submit invalid payload
    fireEvent.change(input, { target: { value: 'bad intent string' } });
    fireEvent.click(submitBtn);

    expect(
      screen.getByText('Please enter a valid payment intent ID or payment URL.'),
    ).toBeDefined();
  });
});
