import { useGameStore } from '@/game/store';
import { getResponder } from '@/game/core/engine';
import type { Player } from '@/game/core/types';

interface Props {
  playerAddress: string;
  playerA: string;
  playerB: string;
}

export default function ActionPanel({ playerAddress, playerA, playerB }: Props) {
  const gameState = useGameStore((s) => s.gameState);
  const animating = useGameStore((s) => s.animating);
  const txPending = useGameStore((s) => s.txPending);

  const { phase, currentShooter, players, winner } = gameState;
  const responder = getResponder(currentShooter);

  // Map wallet address to player role
  const myRole: Player = playerAddress === playerA ? 'player1' : 'player2';
  const isMyTurnToShoot = currentShooter === myRole;
  const isMyTurnToRespond = responder === myRole;

  const shooterName = currentShooter === 'player1' ? 'P1' : 'P2';
  const responderName = responder === 'player1' ? 'P1' : 'P2';

  const panelStyle: React.CSSProperties = {
    padding: '8px 16px',
    background: 'linear-gradient(180deg, #0d0d1a, #0a0a16)',
    borderTop: '2px solid #2a2a3e',
    textAlign: 'center',
  };

  if (phase === 'gameOver') {
    const iWon = winner === myRole;
    return (
      <div style={panelStyle}>
        <div className={iWon ? 'text-glow-green' : 'text-glow-red'} style={{
          color: iWon ? '#88cc88' : '#ff4444',
          fontSize: '16px',
        }}>
          {iWon ? 'YOU WIN' : 'YOU LOSE'}
        </div>
      </div>
    );
  }

  // Transaction pending (Solana mode)
  if (txPending) {
    return (
      <div style={{ ...panelStyle, color: '#ffcc44', fontSize: '8px' }}>
        <span style={{ animation: 'pulse 1s infinite' }}>
          Sending transaction...
        </span>
      </div>
    );
  }

  if (animating || phase === 'resolving') {
    return (
      <div style={{ ...panelStyle, color: '#666677', fontSize: '8px' }}>
        Resolving shot...
      </div>
    );
  }

  if (phase === 'choosingTarget') {
    if (!isMyTurnToShoot) {
      return (
        <div style={{ ...panelStyle, color: '#666677', fontSize: '8px' }}>
          Waiting for {shooterName} to choose target...
        </div>
      );
    }

    return (
      <div style={{ ...panelStyle, color: '#ff4444', fontSize: '8px' }}>
        Click on a player to shoot
      </div>
    );
  }

  if (phase === 'respondingCard') {
    if (!isMyTurnToRespond) {
      return (
        <div style={{ ...panelStyle, color: '#666677', fontSize: '8px' }}>
          Waiting for {responderName} to play a card...
        </div>
      );
    }

    return (
      <div style={{ ...panelStyle, color: '#ffcc44', fontSize: '8px' }}>
        Choose a card from your hand
      </div>
    );
  }

  return null;
}
