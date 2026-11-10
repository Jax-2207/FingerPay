import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { AlertCircle, Camera, ArrowRight, ArrowLeft } from 'lucide-react';

export function Scan() {
  const navigate = useNavigate();
  const [manualInput, setManualInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const extractIntentId = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    // Direct intentId (starts with 0x)
    if (trimmed.startsWith('0x') && trimmed.length > 10) {
      return trimmed;
    }

    // URL path containing /pay/:intentId
    const match = trimmed.match(/\/pay\/([^/?#]+)/);
    if (match && match[1]) {
      return match[1];
    }

    // Query parameter containing ?intentId=... or ?id=...
    const urlMatch = trimmed.match(/[?&](?:intentId|id)=([^&#]+)/);
    if (urlMatch && urlMatch[1]) {
      return decodeURIComponent(urlMatch[1]);
    }

    // Standard string fallback if length is sufficient
    if (trimmed.length >= 8 && !trimmed.includes(' ')) {
      return trimmed;
    }

    return null;
  };

  const handleScanSuccess = (decodedText: string) => {
    const id = extractIntentId(decodedText);
    if (id) {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
      navigate(`/pay/${encodeURIComponent(id)}`);
    } else {
      setError('Scanned QR code does not contain a valid FingerPay payment intent.');
    }
  };

  const handleManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const id = extractIntentId(manualInput);
    if (id) {
      navigate(`/pay/${encodeURIComponent(id)}`);
    } else {
      setError('Please enter a valid payment intent ID or payment URL.');
    }
  };

  useEffect(() => {
    const qrRegionId = 'qr-reader';
    const scanner = new Html5Qrcode(qrRegionId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        handleScanSuccess,
        () => {
          // ignore scan frame errors
        },
      )
      .then(() => setCameraActive(true))
      .catch(() => {
        // Camera permission denied or not available
        setCameraActive(false);
      });

    return () => {
      if (scanner.isScanning) {
        scanner.stop().catch(() => {});
      }
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/')}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm border border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-bold text-slate-900">Scan Merchant QR</h2>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* QR Camera Viewport */}
      <div className="relative overflow-hidden rounded-2xl bg-black aspect-square max-w-sm mx-auto flex items-center justify-center shadow-md">
        <div id="qr-reader" className="w-full h-full"></div>
        {!cameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-white p-6 text-center">
            <Camera className="h-12 w-12 text-slate-400 mb-2" />
            <div className="text-sm font-semibold">Camera scanner unavailable</div>
            <p className="mt-1 text-xs text-slate-400">
              Camera access is restricted or not supported in this environment. Use manual entry
              below.
            </p>
          </div>
        )}
      </div>

      {/* Manual Intent Input Fallback */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
        <h3 className="text-sm font-bold text-slate-900 mb-1">Manual Intent Entry</h3>
        <p className="text-xs text-slate-500 mb-3">
          Paste the payment intent URL or ID from the merchant terminal:
        </p>

        <form onSubmit={handleManualSubmit} className="space-y-3">
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="e.g. 0x8a9b... or /pay/0x..."
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-mono focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
          />

          <button
            type="submit"
            disabled={!manualInput.trim()}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50"
          >
            <span>Proceed to Payment</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
