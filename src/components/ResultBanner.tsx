import { useEffect } from 'react';
import { playSound, stopMusic } from '@/lib/audio';

interface Props {
  winner: string | null;
  playerAddress: string;
  playerA: string;
  playerB: string;
  onPlayAgain: () => void;
}

export default function ResultBanner({ winner, playerAddress, playerA, playerB, onPlayAgain }: Props) {
  const winnerAddress = winner === 'player1' ? playerA : winner === 'player2' ? playerB : null;
  const isWinner = winnerAddress === playerAddress;

  useEffect(() => {
    stopMusic();
    playSound(isWinner ? 'win' : 'lose', 0.6);
  }, [isWinner]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0, 0, 0, 0.85)',
      zIndex: 100,
      gap: '24px',
    }}>
      <div className={isWinner ? 'text-glow-green' : 'text-glow-red'} style={{
        fontSize: '32px',
        color: isWinner ? '#88cc88' : '#ff4444',
        letterSpacing: '6px',
      }}>
        {isWinner ? 'VICTORY' : 'DEFEAT'}
      </div>
      <div style={{ color: '#666677', fontSize: '8px' }}>
        {winnerAddress
          ? `Winner: ${winnerAddress.slice(0, 6)}...${winnerAddress.slice(-4)}`
          : 'Draw'
        }
      </div>
      <button
        onClick={onPlayAgain}
        className="arcade-btn arcade-btn-green"
        style={{ padding: '12px 32px', fontSize: '10px' }}
      >
        PLAY AGAIN
      </button>
    </div>
  );
}
