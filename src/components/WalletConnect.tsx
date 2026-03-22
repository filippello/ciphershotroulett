import { useState } from 'react';
import { hasWalletProvider, connectWallet } from '@/lib/wallet';

interface Props {
  onConnected: (address: string) => void;
}

export default function WalletConnect({ onConnected }: Props) {
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const hasProvider = hasWalletProvider();

  const handleConnect = async () => {
    setError('');
    setConnecting(true);
    try {
      const { address } = await connectWallet();
      onConnected(address);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      gap: '32px',
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 className="crt-title" style={{ fontSize: '36px', margin: 0, letterSpacing: '4px' }}>
          CIPHERSHOT
        </h1>
        <p style={{ color: '#666677', fontSize: '8px', marginTop: '12px', letterSpacing: '1px' }}>
          A duel of bluffs and bullets
        </p>
      </div>

      {hasProvider ? (
        <button
          onClick={handleConnect}
          disabled={connecting}
          className={`arcade-btn ${connecting ? 'arcade-btn-neutral' : 'arcade-btn-green'}`}
          style={{ padding: '14px 32px', fontSize: '10px' }}
        >
          {connecting ? 'CONNECTING...' : 'CONNECT WALLET'}
        </button>
      ) : (
        <div style={{ textAlign: 'center', color: '#ff6666', fontSize: '8px', lineHeight: '1.8' }}>
          No Solana wallet detected.<br />
          Install Phantom, Solflare, or Backpack.
        </div>
      )}

      {error && (
        <div style={{ color: '#ff4444', fontSize: '7px', maxWidth: '400px', textAlign: 'center' }}>
          {error}
        </div>
      )}

      <p style={{ color: '#444455', fontSize: '7px', maxWidth: '340px', textAlign: 'center', lineHeight: '1.8' }}>
        Connect your Solana wallet to enter the arena. Your address becomes your identity.
      </p>
    </div>
  );
}
