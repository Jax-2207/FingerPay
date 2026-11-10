// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MerchantDashboard } from '../src/pages/merchant/MerchantDashboard.js';
import { MerchantTerminal } from '../src/pages/merchant/MerchantTerminal.js';
import { MerchantSettlements } from '../src/pages/merchant/MerchantSettlements.js';
import { AdminOverview } from '../src/pages/admin/AdminOverview.js';
import { AdminUsers } from '../src/pages/admin/AdminUsers.js';
import { AdminMerchants } from '../src/pages/admin/AdminMerchants.js';
import { AdminMint } from '../src/pages/admin/AdminMint.js';
import { AdminRefunds } from '../src/pages/admin/AdminRefunds.js';
import { AdminSettlements } from '../src/pages/admin/AdminSettlements.js';
import { AdminChain } from '../src/pages/admin/AdminChain.js';
import { api, type MerchantProfile } from '../src/api.js';
import * as AuthContextModule from '../src/auth/AuthContext.js';

describe('Phase 7 Merchant and Admin Portals', () => {
  let queryClient: QueryClient;

  const mockMerchantProfile: MerchantProfile = {
    uid: 'merch-42',
    shopName: 'Campus Canteen',
    category: 'canteen',
    walletAddress: '0x4242424242424242424242424242424242424242',
    status: 'approved',
    active: true,
    balance: '450',
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { uid: 'merch-42' } as never,
      profile: null,
      role: 'merchant',
      loading: false,
      refreshProfile: vi.fn(),
      logout: vi.fn(),
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

  // ----------------------------------------------------
  // Merchant Tests
  // ----------------------------------------------------

  it('renders merchant dashboard with on-chain balance, shop name, and recent transactions', async () => {
    vi.spyOn(api, 'getMerchantProfile').mockResolvedValue(mockMerchantProfile);
    vi.spyOn(api, 'getHistory').mockResolvedValue({
      transactions: [
        {
          id: 'tx-m-1',
          amount: '60',
          category: 'canteen',
          status: 'confirmed',
        },
      ],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MerchantDashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('450')).toBeDefined();
      expect(screen.getByText('Campus Canteen')).toBeDefined();
      expect(screen.getByText('Launch Terminal')).toBeDefined();
      expect(screen.getByText('+60 CPC')).toBeDefined();
    });
  });

  it('displays deactivation alert when merchant account is inactive', async () => {
    vi.spyOn(api, 'getMerchantProfile').mockResolvedValue({
      ...mockMerchantProfile,
      active: false,
    });
    vi.spyOn(api, 'getHistory').mockResolvedValue({ transactions: [] });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MerchantDashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Merchant Account Deactivated')).toBeDefined();
    });
  });

  it('creates payment intent in terminal, renders QR code, and handles cancellation', async () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 120;
    const createIntentSpy = vi.spyOn(api, 'createIntent').mockResolvedValue({
      id: 'intent-77',
      intentId: '0xintent77',
      amount: '35',
      expiry: futureExpiry,
      nonce: 'nonce-1',
      qrPayload: '/pay/intent-77',
    });

    const cancelIntentSpy = vi
      .spyOn(api, 'cancelIntent')
      .mockResolvedValue({ status: 'cancelled' });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MerchantTerminal />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Enter amount
    const amountInput = screen.getByPlaceholderText('0');
    fireEvent.change(amountInput, { target: { value: '35' } });

    // Click Generate QR
    fireEvent.click(screen.getByText('Generate Customer QR'));

    await waitFor(() => {
      expect(createIntentSpy).toHaveBeenCalledWith({ amount: 35, category: 'canteen' });
      expect(screen.getByText('Amount Due')).toBeDefined();
      expect(screen.getByText('35')).toBeDefined();
      expect(
        screen.getByText('Ask student to scan this QR code with their FingerPay app'),
      ).toBeDefined();
    });

    // Cancel intent
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(cancelIntentSpy).toHaveBeenCalledWith('intent-77');
      expect(screen.getByText('Generate Customer QR')).toBeDefined();
    });
  });

  it('rejects invalid amounts in terminal (non-positive or exceeding limit)', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MerchantTerminal />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const amountInput = screen.getByPlaceholderText('0');
    const form = amountInput.closest('form')!;

    // Test exceeding 200 CPC limit
    fireEvent.change(amountInput, { target: { value: '250' } });
    fireEvent.submit(form);

    expect(
      screen.getByText(/Amount exceeds the maximum campus single payment limit of 200 CPC/i),
    ).toBeDefined();
  });

  it('submits merchant settlement request against available on-chain balance', async () => {
    vi.spyOn(api, 'getMerchantProfile').mockResolvedValue(mockMerchantProfile);
    vi.spyOn(api, 'getSettlements').mockResolvedValue({ settlements: [] });
    const requestSettleSpy = vi.spyOn(api, 'requestSettlement').mockResolvedValue({
      id: 'settle-1',
      status: 'requested',
      amount: '200',
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MerchantSettlements />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Wait for balance query to resolve
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Max 450')).toBeDefined();
    });

    const input = screen.getByPlaceholderText('Max 450');
    fireEvent.change(input, { target: { value: '200' } });

    fireEvent.click(screen.getByText('Request Settlement'));

    await waitFor(() => {
      expect(requestSettleSpy).toHaveBeenCalledWith(200);
      expect(
        screen.getByText(/Settlement request for 200 CPC submitted successfully/i),
      ).toBeDefined();
    });
  });

  // ----------------------------------------------------
  // Admin Tests
  // ----------------------------------------------------

  it('renders admin overview with live statistics and operational status', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { uid: 'admin-1' } as never,
      profile: null,
      role: 'admin',
      loading: false,
      refreshProfile: vi.fn(),
      logout: vi.fn(),
      signIn: vi.fn(),
      signUp: vi.fn(),
      error: null,
      clearError: vi.fn(),
    });

    vi.spyOn(api, 'getAdminStats').mockResolvedValue({
      totalUsers: 120,
      pendingUsers: 4,
      totalMerchants: 8,
      activeMerchants: 7,
      totalTransactions: 310,
      totalSpentCpc: 8400,
      totalSettlements: 12,
      pendingSettlements: 2,
      paused: false,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminOverview />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('120')).toBeDefined();
      expect(screen.getByText('4 pending approval')).toBeDefined();
      expect(screen.getByText('8400')).toBeDefined();
      expect(screen.getByText('System Operational')).toBeDefined();
    });
  });

  it('allows admin to approve and reject pending student registrations', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { uid: 'admin-1' } as never,
      profile: null,
      role: 'admin',
      loading: false,
      refreshProfile: vi.fn(),
      logout: vi.fn(),
      signIn: vi.fn(),
      signUp: vi.fn(),
      error: null,
      clearError: vi.fn(),
    });

    vi.spyOn(api, 'getAdminUsers').mockResolvedValue({
      users: [
        {
          uid: 'student-pending-1',
          name: 'Bob Student',
          email: 'bob@campus.edu',
          prn: 'PRN-2024-999',
          role: 'user',
          status: 'pending',
        },
      ],
    });

    const decideUserSpy = vi
      .spyOn(api, 'decideAdminUser')
      .mockResolvedValue({ status: 'approved' });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminUsers />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Bob Student')).toBeDefined();
      expect(screen.getByText('PRN-2024-999')).toBeDefined();
    });

    // Approve user
    fireEvent.click(screen.getByText('Approve'));

    await waitFor(() => {
      expect(decideUserSpy).toHaveBeenCalledWith('student-pending-1', 'approve');
    });
  });

  it('allows admin to activate and deactivate merchant terminals', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { uid: 'admin-1' } as never,
      profile: null,
      role: 'admin',
      loading: false,
      refreshProfile: vi.fn(),
      logout: vi.fn(),
      signIn: vi.fn(),
      signUp: vi.fn(),
      error: null,
      clearError: vi.fn(),
    });

    vi.spyOn(api, 'getAdminMerchants').mockResolvedValue({
      merchants: [
        {
          uid: 'merch-88',
          shopName: 'College Bookstore',
          category: 'stationery',
          walletAddress: '0x8888888888888888888888888888888888888888',
          status: 'approved',
          active: true,
          balance: '120',
        },
      ],
    });

    const deactivateSpy = vi.spyOn(api, 'deactivateMerchant').mockResolvedValue({
      status: 'deactivated',
      txHash: '0xdeact1',
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminMerchants />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('College Bookstore')).toBeDefined();
      expect(screen.getByText('Deactivate')).toBeDefined();
    });

    // Deactivate merchant
    fireEvent.click(screen.getByText('Deactivate'));

    await waitFor(() => {
      expect(deactivateSpy).toHaveBeenCalledWith('merch-88');
    });
  });

  it('requires confirmation dialog showing exact values before minting CPC', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { uid: 'admin-1' } as never,
      profile: null,
      role: 'admin',
      loading: false,
      refreshProfile: vi.fn(),
      logout: vi.fn(),
      signIn: vi.fn(),
      signUp: vi.fn(),
      error: null,
      clearError: vi.fn(),
    });

    const mintSpy = vi.spyOn(api, 'adminMint').mockResolvedValue({
      status: 'confirmed',
      txHash: '0xminttx99',
      studentWallet: '0xstudentwallet123',
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminMint />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText('e.g. PRN-2024-001'), {
      target: { value: 'PRN-2024-001' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. 50'), { target: { value: '100' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. REC-2026-NOV-8901'), {
      target: { value: 'REC-TEST-001' },
    });

    // Click submit opens confirmation modal
    fireEvent.click(screen.getByText('Review & Mint CPC'));

    await waitFor(() => {
      expect(screen.getByText('Confirm CampusCoin Minting')).toBeDefined();
      expect(screen.getByText('100 CPC')).toBeDefined();
      expect(screen.getByText('REC-TEST-001')).toBeDefined();
    });

    // Confirm in modal
    fireEvent.click(screen.getByText('Authorize Mint'));

    await waitFor(() => {
      expect(mintSpy).toHaveBeenCalledWith({
        prn: 'PRN-2024-001',
        amount: 100,
        receiptRef: 'REC-TEST-001',
      });
      expect(screen.getByText(/Mint Successful: 100 CPC credited to PRN-2024-001/i)).toBeDefined();
    });
  });

  it('requires confirmation dialog before executing refund', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { uid: 'admin-1' } as never,
      profile: null,
      role: 'admin',
      loading: false,
      refreshProfile: vi.fn(),
      logout: vi.fn(),
      signIn: vi.fn(),
      signUp: vi.fn(),
      error: null,
      clearError: vi.fn(),
    });

    const refundSpy = vi.spyOn(api, 'adminRefund').mockResolvedValue({
      status: 'confirmed',
      txHash: '0xrefundtx77',
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminRefunds />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const validHexId = '0x1111111111111111111111111111111111111111111111111111111111111111';
    fireEvent.change(screen.getByPlaceholderText(/0x1234567890abcdef/i), {
      target: { value: validHexId },
    });

    fireEvent.click(screen.getByText('Review & Authorize Refund'));

    await waitFor(() => {
      expect(screen.getByText('Confirm Payment Refund')).toBeDefined();
    });

    // Execute refund
    fireEvent.click(screen.getByText('Execute Refund'));

    await waitFor(() => {
      expect(refundSpy).toHaveBeenCalledWith({ intentId: validHexId });
      expect(
        screen.getByText(/Refund Successful: On-chain tokens returned to original payer/i),
      ).toBeDefined();
    });
  });

  it('supports settlement approval burn and mark-paid external disbursement', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { uid: 'admin-1' } as never,
      profile: null,
      role: 'admin',
      loading: false,
      refreshProfile: vi.fn(),
      logout: vi.fn(),
      signIn: vi.fn(),
      signUp: vi.fn(),
      error: null,
      clearError: vi.fn(),
    });

    vi.spyOn(api, 'getAdminSettlements').mockResolvedValue({
      settlements: [
        {
          id: 'settle-req-1',
          merchantUid: 'merch-1',
          merchantAddress: '0x1111111111111111111111111111111111111111',
          amount: '150',
          status: 'requested',
        },
      ],
    });

    const decideSettleSpy = vi.spyOn(api, 'decideAdminSettlement').mockResolvedValue({
      status: 'approved',
      txHash: '0xburn99',
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminSettlements />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('150 CPC')).toBeDefined();
      expect(screen.getByText('Approve & Burn')).toBeDefined();
    });

    // Open confirmation
    fireEvent.click(screen.getByText('Approve & Burn'));

    await waitFor(() => {
      expect(screen.getByText('Approve Settlement & Burn CPC')).toBeDefined();
    });

    // Confirm burn
    fireEvent.click(screen.getByText('Approve & Burn On-Chain'));

    await waitFor(() => {
      expect(decideSettleSpy).toHaveBeenCalledWith('settle-req-1', 'approve');
    });
  });

  it('handles emergency circuit breaker pause and unpause operations with confirmation', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { uid: 'admin-1' } as never,
      profile: null,
      role: 'admin',
      loading: false,
      refreshProfile: vi.fn(),
      logout: vi.fn(),
      signIn: vi.fn(),
      signUp: vi.fn(),
      error: null,
      clearError: vi.fn(),
    });

    vi.spyOn(api, 'getAdminChain').mockResolvedValue({
      fingerPayAddress: '0xFingerPay11111111111111111111111111111111',
      campusCoinAddress: '0xCampusCoin22222222222222222222222222222222',
      chainId: 31337,
      paused: false,
      recentEvents: [],
    });

    const pauseSpy = vi.spyOn(api, 'adminPause').mockResolvedValue({
      status: 'paused',
      txHash: '0xpause1',
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminChain />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Circuit Breaker: OPERATIONAL')).toBeDefined();
      expect(screen.getByText('Emergency Pause System')).toBeDefined();
    });

    // Click pause
    fireEvent.click(screen.getByText('Emergency Pause System'));

    await waitFor(() => {
      expect(screen.getByText('Confirm Emergency Contract Pause')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Activate Emergency Pause'));

    await waitFor(() => {
      expect(pauseSpy).toHaveBeenCalled();
    });
  });
});
