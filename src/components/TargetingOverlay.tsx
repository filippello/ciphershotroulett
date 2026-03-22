import { useState, useCallback } from 'react';
import { playSound } from '@/lib/audio';
import type { Player, Target } from '@/game/core/types';

interface Props {
  myRole: Player;
  onSelect: (target: Target) => void;
  onHoverPlayer: (player: Player) => void;
  onLeavePlayer: (player: Player) => void;
}

/*
  Clickable zones match the Phaser player sprite positions (960×540 canvas):
  P1: center x=115 (12%), P2: center x=845 (88%)
  Y center: 400 (74%), sprite 300×420 → 31%×78%
*/
const ZONE_W = '31%';
const ZONE_H = '78%';
const ZONE_TOP = '35%';
const P1_LEFT = '-3.5%';
const P2_LEFT = '72.5%';

// Red crosshair cursor as inline SVG data-URI
const CROSSHAIR_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cline x1='16' y1='2' x2='16' y2='12' stroke='%23ff4444' stroke-width='2'/%3E%3Cline x1='16' y1='20' x2='16' y2='30' stroke='%23ff4444' stroke-width='2'/%3E%3Cline x1='2' y1='16' x2='12' y2='16' stroke='%23ff4444' stroke-width='2'/%3E%3Cline x1='20' y1='16' x2='30' y2='16' stroke='%23ff4444' stroke-width='2'/%3E%3Ccircle cx='16' cy='16' r='2' fill='%23ff4444'/%3E%3C/svg%3E") 16 16, crosshair`;

export default function TargetingOverlay({ myRole, onSelect, onHoverPlayer, onLeavePlayer }: Props) {
  const [hovered, setHovered] = useState<'p1' | 'p2' | null>(null);
  const [selected, setSelected] = useState(false);

  const handleHover = useCallback((player: 'p1' | 'p2') => {
    if (selected) return;
    setHovered(player);
    playSound('hover_button', 0.25);
    onHoverPlayer(player === 'p1' ? 'player1' : 'player2');
  }, [selected, onHoverPlayer]);

  const handleLeave = useCallback((player: 'p1' | 'p2') => {
    if (selected) return;
    setHovered(null);
    onLeavePlayer(player === 'p1' ? 'player1' : 'player2');
  }, [selected, onLeavePlayer]);

  const handleClick = useCallback((player: 'p1' | 'p2') => {
    if (selected) return;
    setSelected(true);
    playSound('choose_target', 0.5);
    const target: Target = (player === 'p1' && myRole === 'player1') || (player === 'p2' && myRole === 'player2')
      ? 'self'
      : 'opponent';
    setTimeout(() => onSelect(target), 150);
  }, [selected, myRole, onSelect]);

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 40,
      cursor: CROSSHAIR_SVG,
      pointerEvents: selected ? 'none' : 'auto',
    }}>
      {/* Dark vignette overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.45) 100%)',
        pointerEvents: 'none',
      }} />

      {/* Center text — flexbox for reliable centering */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 41,
        paddingBottom: '30%',
      }}>
        <div style={{
          fontSize: '42px',
          color: '#ff4444',
          textShadow: '-2px 0 #ff000066, 2px 0 #0044ff44, 0 0 30px #ff444488, 0 0 60px #ff444444',
          letterSpacing: '6px',
          animation: 'targetPulse 1.5s ease-in-out infinite',
        }}>
          YOUR TURN
        </div>
        <div style={{
          fontSize: '14px',
          color: '#ffcc44',
          textShadow: '0 0 15px #ffcc4466',
          letterSpacing: '3px',
          marginTop: '12px',
        }}>
          CHOOSE YOUR TARGET
        </div>
      </div>

      {/* P1 clickable zone */}
      <div
        onMouseEnter={() => handleHover('p1')}
        onMouseLeave={() => handleLeave('p1')}
        onClick={() => handleClick('p1')}
        style={{
          position: 'absolute',
          left: P1_LEFT,
          top: ZONE_TOP,
          width: ZONE_W,
          height: ZONE_H,
          cursor: CROSSHAIR_SVG,
          zIndex: 42,
        }}
      >
        {hovered === 'p1' && (
          <div style={{
            position: 'absolute',
            top: '-6%',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '18px',
            color: myRole === 'player1' ? '#ffcc44' : '#ff4444',
            textShadow: `0 0 20px ${myRole === 'player1' ? '#ffcc4488' : '#ff444488'}, 0 0 40px ${myRole === 'player1' ? '#ffcc4444' : '#ff444444'}`,
            letterSpacing: '3px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}>
            {myRole === 'player1' ? 'YOURSELF' : 'OPPONENT'}
          </div>
        )}
      </div>

      {/* P2 clickable zone */}
      <div
        onMouseEnter={() => handleHover('p2')}
        onMouseLeave={() => handleLeave('p2')}
        onClick={() => handleClick('p2')}
        style={{
          position: 'absolute',
          left: P2_LEFT,
          top: ZONE_TOP,
          width: ZONE_W,
          height: ZONE_H,
          cursor: CROSSHAIR_SVG,
          zIndex: 42,
        }}
      >
        {hovered === 'p2' && (
          <div style={{
            position: 'absolute',
            top: '-6%',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '18px',
            color: myRole === 'player2' ? '#ffcc44' : '#ff4444',
            textShadow: `0 0 20px ${myRole === 'player2' ? '#ffcc4488' : '#ff444488'}, 0 0 40px ${myRole === 'player2' ? '#ffcc4444' : '#ff444444'}`,
            letterSpacing: '3px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}>
            {myRole === 'player2' ? 'YOURSELF' : 'OPPONENT'}
          </div>
        )}
      </div>

      <style>{`
        @keyframes targetPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
