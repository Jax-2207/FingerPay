// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Scan } from '../src/pages/Scan.js';

const scannerState = vi.hoisted(() => ({
  instances: [] as string[],
  scannedFiles: [] as File[],
  decodedText: 'https://fingerpay.campus.edu/pay/0x1234567890abcdef',
  shouldReject: false,
}));

vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class {
    isScanning = false;

    constructor(elementId: string) {
      scannerState.instances.push(elementId);
    }

    start() {
      return Promise.reject(new Error('Camera is unavailable in the test environment'));
    }

    stop() {
      return Promise.resolve();
    }

    scanFile(file: File) {
      scannerState.scannedFiles.push(file);
      if (scannerState.shouldReject) {
        return Promise.reject(new Error('No QR code found'));
      }
      return Promise.resolve(scannerState.decodedText);
    }
  },
}));

function renderScan() {
  return render(
    <MemoryRouter initialEntries={['/scan']}>
      <Routes>
        <Route path="/scan" element={<Scan />} />
        <Route path="/pay/:intentId" element={<div data-testid="pay-screen">Pay screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('student QR image scanning', () => {
  beforeEach(() => {
    cleanup();
    scannerState.instances = [];
    scannerState.scannedFiles = [];
    scannerState.decodedText = 'https://fingerpay.campus.edu/pay/0x1234567890abcdef';
    scannerState.shouldReject = false;
  });

  it('scans the selected image locally and routes a valid payment URL to the pay screen', async () => {
    renderScan();
    const file = new File(['qr image'], 'merchant-qr.png', { type: 'image/png' });

    fireEvent.change(screen.getByLabelText('Choose a QR image'), {
      target: { files: [file] },
    });

    await waitFor(() => expect(screen.getByTestId('pay-screen')).toBeDefined());
    expect(scannerState.instances).toContain('qr-reader');
    expect(scannerState.instances).toContain('qr-file-reader');
    expect(scannerState.scannedFiles).toEqual([file]);
  });

  it('shows an error for a decoded QR that is not a payment intent', async () => {
    scannerState.decodedText = 'https://example.com';
    renderScan();

    fireEvent.change(screen.getByLabelText('Choose a QR image'), {
      target: { files: [new File(['qr image'], 'other.png', { type: 'image/png' })] },
    });

    expect(
      await screen.findByText('Scanned QR code does not contain a valid FingerPay payment intent.'),
    ).toBeDefined();
    expect(screen.queryByTestId('pay-screen')).toBeNull();
  });

  it('shows an error if the image cannot be decoded', async () => {
    scannerState.shouldReject = true;
    renderScan();

    fireEvent.change(screen.getByLabelText('Choose a QR image'), {
      target: { files: [new File(['not a qr'], 'unreadable.png', { type: 'image/png' })] },
    });

    expect(
      await screen.findByText(
        'Could not read a QR code from that image. Try another image or use manual entry.',
      ),
    ).toBeDefined();
    expect(screen.queryByTestId('pay-screen')).toBeNull();
  });

  it('rejects known non-image and oversized files before decoding', async () => {
    renderScan();
    const input = screen.getByLabelText('Choose a QR image');

    fireEvent.change(input, {
      target: { files: [new File(['text'], 'notes.txt', { type: 'text/plain' })] },
    });
    expect(
      await screen.findByText('Choose an image file containing a FingerPay payment QR code.'),
    ).toBeDefined();
    expect(scannerState.scannedFiles).toHaveLength(0);

    fireEvent.change(input, {
      target: {
        files: [
          new File([new ArrayBuffer(10 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }),
        ],
      },
    });
    expect(await screen.findByText('Choose a QR image smaller than 10 MiB.')).toBeDefined();
    expect(scannerState.scannedFiles).toHaveLength(0);
  });
});
