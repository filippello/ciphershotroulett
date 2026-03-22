import { useGameStore } from '@/game/store';

export default function HUD() {
  const { currentShooter, currentShotIndex, chamber, phase } = useGameStore((s) => s.gameState);
  const animating = useGameStore((s) => s.animating);

  const playerName = currentShooter === 'player1' ? 'Player 1' : 'Player 2';

  return (
    <div className="hud-bar" style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      color: '#8888aa',
    }}>
      <div>
        <span className="text-glow-red" style={{ color: '#ff4444' }}>SHOOTER:</span> {playerName}
      </div>
      <div>
        SHOT {currentShotIndex + 1} / {chamber.length}
      </div>
      <div>
        {animating ? '⟳ RESOLVING...' : phase.toUpperCase().replace(/([A-Z])/g, ' $1')}
      </div>
    </div>
  );
}
