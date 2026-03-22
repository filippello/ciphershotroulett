import { useState, useCallback } from 'react';
import { playSound } from '@/lib/audio';
import type { Card, CardType } from '@/game/core/types';

const CARD_IMAGES: Record<string, string> = {
  bluff: '/assets/cards/card_bluff.png',
  redirect: '/assets/cards/card_redirect.png',
};

interface Props {
  cards: Card[];
  onSelect: (cardType: CardType) => void;
}

export default function CardSelectOverlay({ cards, onSelect }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selected, setSelected] = useState(false);

  const available = cards.filter(c => !c.used);
  const total = available.length;

  const handleHover = useCallback((id: string) => {
    if (selected) return;
    setHoveredId(id);
    playSound('hover_button', 0.2);
  }, [selected]);

  const handleLeave = useCallback(() => {
    if (selected) return;
    setHoveredId(null);
  }, [selected]);

  const handleClick = useCallback((card: Card) => {
    if (selected) return;
    setSelected(true);
    setHoveredId(card.id);
    playSound('card_submit', 0.5);
    setTimeout(() => onSelect(card.type), 200);
  }, [selected, onSelect]);

  // Fan layout: cards spread in an arc from center
  const getCardStyle = (index: number): React.CSSProperties => {
    const mid = (total - 1) / 2;
    const offset = index - mid;
    const angle = offset * 8; // degrees rotation per card
    const translateX = offset * 80; // horizontal spread
    const translateY = Math.abs(offset) * 12; // arc curve
    const isHovered = available[index].id === hoveredId;

    return {
      width: '120px',
      height: '170px',
      borderRadius: '8px',
      overflow: 'hidden',
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      transform: `translateX(${translateX}px) translateY(${isHovered ? translateY - 30 : translateY}px) rotate(${angle}deg)`,
      border: isHovered ? '3px solid #ffcc44' : '3px solid transparent',
      boxShadow: isHovered
        ? '0 0 20px #ffcc4466, 0 0 40px #ffcc4433, 0 8px 24px rgba(0,0,0,0.6)'
        : '0 4px 12px rgba(0,0,0,0.5)',
      zIndex: isHovered ? 10 : index,
      filter: isHovered ? 'brightness(1.2)' : 'brightness(0.9)',
    };
  };

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 40,
      pointerEvents: selected ? 'none' : 'auto',
    }}>
      {/* Dark overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.3) 20%, rgba(0,0,0,0.7) 100%)',
        pointerEvents: 'none',
      }} />

      {/* Title text */}
      <div style={{
        position: 'absolute',
        top: '8%',
        left: 0,
        right: 0,
        textAlign: 'center',
        pointerEvents: 'none',
        zIndex: 41,
      }}>
        <div style={{
          fontSize: '28px',
          color: '#ff4444',
          textShadow: '-2px 0 #ff000066, 2px 0 #0044ff44, 0 0 30px #ff444488',
          letterSpacing: '4px',
        }}>
          RESPOND
        </div>
        <div style={{
          fontSize: '11px',
          color: '#ffcc44',
          textShadow: '0 0 15px #ffcc4466',
          letterSpacing: '2px',
          marginTop: '10px',
        }}>
          PLAY A CARD
        </div>
      </div>

      {/* Card fan — centered */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 42,
      }}>
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {available.map((card, i) => (
            <div
              key={card.id}
              onMouseEnter={() => handleHover(card.id)}
              onMouseLeave={handleLeave}
              onClick={() => handleClick(card)}
              style={{
                ...getCardStyle(i),
                position: 'absolute',
                pointerEvents: 'auto',
              }}
            >
              <img
                src={CARD_IMAGES[card.type]}
                alt={card.type}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Hovered card label */}
      {hoveredId && (
        <div style={{
          position: 'absolute',
          bottom: '10%',
          left: 0,
          right: 0,
          textAlign: 'center',
          pointerEvents: 'none',
          zIndex: 43,
        }}>
          {(() => {
            const card = available.find(c => c.id === hoveredId);
            if (!card) return null;
            const isBluff = card.type === 'bluff';
            return (
              <div style={{
                fontSize: '22px',
                color: isBluff ? '#88cc88' : '#cc88cc',
                textShadow: `0 0 15px ${isBluff ? '#88cc8866' : '#cc88cc66'}`,
                letterSpacing: '3px',
                textTransform: 'uppercase',
              }}>
                {card.type}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
