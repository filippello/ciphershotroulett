import { useEffect, useRef, useState, useCallback } from 'react';
import Phaser from 'phaser';
import { createGameConfig } from '@/game/phaser/config';
import { GameScene } from '@/game/phaser/GameScene';
import { useGameStore } from '@/game/store';
import { connectToMatch } from '@/lib/matchmaking';
import type { CardType, Player } from '@/game/core/types';
import { getResponder } from '@/game/core/engine';
import { playSound, stopLoop, startMusic, stopMusic } from '@/lib/audio';
import HUD from './HUD';
import ActionPanel from './ActionPanel';
import CardDisplay from './CardDisplay';
import ShotHistory from './ShotHistory';
import SuspenseOverlay from './SuspenseOverlay';
import TargetingOverlay from './TargetingOverlay';
import CardSelectOverlay from './CardSelectOverlay';

interface Props {
  matchId: string;
  playerAddress: string;
  playerA: string;
  playerB: string;
  onLeaveMatch: () => void;
}

export default function GameScreen({ matchId, playerAddress, playerA, playerB, onLeaveMatch }: Props) {
  const gameState = useGameStore((s) => s.gameState);
  const animating = useGameStore((s) => s.animating);
  const txPending = useGameStore((s) => s.txPending);
  const receiveState = useGameStore((s) => s.receiveState);
  const setAnimating = useGameStore((s) => s.setAnimating);
  const setConnection = useGameStore((s) => s.setConnection);
  const chooseTarget = useGameStore((s) => s.chooseTarget);
  const respondWithCard = useGameStore((s) => s.respondWithCard);
  const isPlayerA = playerAddress === playerA;
  const myRole: Player = isPlayerA ? 'player1' : 'player2';

  // Phaser refs
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  // Suspense state
  const [showSuspense, setShowSuspense] = useState(false);
  const [suspenseCard, setSuspenseCard] = useState<CardType | null>(null);
  const prevAnimatingRef = useRef(false);
  const prevShotIndexRef = useRef(gameState.currentShotIndex);

  // Targeting state — track if we already chose to avoid re-showing overlay
  const [targetSelected, setTargetSelected] = useState(false);

  // Card select state
  const [cardSelected, setCardSelected] = useState(false);

  // Init Phaser
  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const config = createGameConfig('phaser-container');
    const game = new Phaser.Game(config);
    gameRef.current = game;

    game.events.on('ready', () => {
      const scene = game.scene.getScene('GameScene') as GameScene;
      if (scene) {
        scene.events.on('scene-ready', () => {
          scene.updateChamberDisplay(7, 0);
        });
      }
    });

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  // Sync Phaser visuals + trigger suspense on new shot
  useEffect(() => {
    if (!gameRef.current) return;
    const scene = gameRef.current.scene.getScene('GameScene') as GameScene;
    if (!scene || !scene.scene.isActive()) return;

    if (gameState.currentShotIndex === 0 && prevShotIndexRef.current > 0) {
      scene.resetVisuals();
    }
    prevShotIndexRef.current = gameState.currentShotIndex;

    scene.highlightShooter(gameState.currentShooter);
    scene.updateChamberDisplay(gameState.chamber.length, gameState.currentShotIndex);

    // New shot resolved — start suspense countdown
    if (animating && !prevAnimatingRef.current && gameState.lastResult) {
      setSuspenseCard(gameState.lastResult.cardPlayed);
      setShowSuspense(true);
    }
    prevAnimatingRef.current = animating;
  }, [gameState, animating]);

  // Reset selection states when phase changes
  useEffect(() => {
    if (gameState.phase !== 'choosingTarget') {
      setTargetSelected(false);
    }
    if (gameState.phase !== 'respondingCard') {
      setCardSelected(false);
    }
  }, [gameState.phase]);

  // Show targeting overlay?
  const isMyTurnToShoot = gameState.currentShooter === myRole;
  const showTargeting = gameState.phase === 'choosingTarget'
    && isMyTurnToShoot
    && !animating
    && !txPending
    && !targetSelected;

  const handleTargetSelect = useCallback((target: 'self' | 'opponent') => {
    setTargetSelected(true);
    if (gameRef.current) {
      const scene = gameRef.current.scene.getScene('GameScene') as GameScene;
      if (scene && scene.scene.isActive()) {
        scene.unhighlightTarget('player1');
        scene.unhighlightTarget('player2');
      }
    }
    chooseTarget(target);
  }, [chooseTarget]);

  // Card select overlay
  const responder = getResponder(gameState.currentShooter);
  const isMyTurnToRespond = responder === myRole;
  const showCardSelect = gameState.phase === 'respondingCard'
    && isMyTurnToRespond
    && !animating
    && !txPending
    && !cardSelected;
  const myCards = gameState.players[myRole].cards;

  const handleCardSelect = useCallback((cardType: CardType) => {
    setCardSelected(true);
    respondWithCard(cardType);
  }, [respondWithCard]);

  const handleHoverPlayer = useCallback((player: 'player1' | 'player2') => {
    if (!gameRef.current) return;
    const scene = gameRef.current.scene.getScene('GameScene') as GameScene;
    if (scene && scene.scene.isActive()) {
      scene.highlightTarget(player);
    }
  }, []);

  const handleLeavePlayer = useCallback((player: 'player1' | 'player2') => {
    if (!gameRef.current) return;
    const scene = gameRef.current.scene.getScene('GameScene') as GameScene;
    if (scene && scene.scene.isActive()) {
      scene.unhighlightTarget(player);
    }
  }, []);

  // After suspense completes — play shot animation
  const handleSuspenseComplete = useCallback(() => {
    setShowSuspense(false);

    if (!gameRef.current || !gameState.lastResult) return;
    const scene = gameRef.current.scene.getScene('GameScene') as GameScene;
    if (!scene || !scene.scene.isActive()) return;

    const result = gameState.lastResult;
    scene.animateAim(result.shooter, result.originalTarget);

    setTimeout(() => {
      if (result.killed) {
        playSound('shot_live', 0.7);
      } else {
        playSound('shot_blank', 0.6);
      }
      scene.animateShot(result.killed, () => {
        if (result.killed) {
          scene.showKill(result.finalTarget);
          playSound('kill', 0.6);
        } else {
          playSound('chamber_advance', 0.5);
        }
        setTimeout(() => {
          scene.resetGunPosition();
          if (!result.killed) {
            playSound('turn_start', 0.4);
          }
          setAnimating(false);
        }, result.killed ? 1500 : 500);
      });
    }, 500);
  }, [gameState.lastResult, setAnimating]);

  // Match found — play sound, stop queue loop, start music
  useEffect(() => {
    stopLoop();
    playSound('match_found', 0.6);
    const t = setTimeout(() => startMusic(0.2), 800);
    return () => {
      clearTimeout(t);
      stopMusic();
    };
  }, []);

  // Establish game connection on mount
  useEffect(() => {
    const conn = connectToMatch(
      matchId,
      playerAddress,
      (newState) => receiveState(newState),
      (err) => console.error('Match connection error:', err),
    );
    setConnection(conn);

    return () => {
      conn.close();
      setConnection(null);
    };
  }, [matchId, playerAddress, receiveState, setConnection]);

  return (
    <main className="crt-panel" style={{
      display: 'flex',
      flexDirection: 'column',
      maxWidth: '960px',
      width: '100%',
      height: '100vh',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <div className="hud-bar" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        color: '#444455',
        fontSize: '7px',
      }}>
        <span>Match: {matchId.slice(0, 8)}...</span>
        <span>
          You are <span style={{ color: isPlayerA ? '#88cc88' : '#cc88cc' }}>
            {isPlayerA ? 'P1 (shooter first)' : 'P2'}
          </span>
        </span>
        {gameState.phase === 'gameOver' && (
          <button
            onClick={onLeaveMatch}
            className="arcade-btn arcade-btn-neutral"
            style={{ padding: '2px 10px', fontSize: '7px' }}
          >
            LEAVE
          </button>
        )}
      </div>
      <HUD />
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div
          id="phaser-container"
          ref={containerRef}
          style={{ width: '100%', height: '100%' }}
        />
        {showTargeting && (
          <TargetingOverlay
            myRole={myRole}
            onSelect={handleTargetSelect}
            onHoverPlayer={handleHoverPlayer}
            onLeavePlayer={handleLeavePlayer}
          />
        )}
        {showCardSelect && (
          <CardSelectOverlay
            cards={myCards}
            onSelect={handleCardSelect}
          />
        )}
        {showSuspense && (
          <SuspenseOverlay
            cardPlayed={suspenseCard}
            onComplete={handleSuspenseComplete}
          />
        )}
      </div>
      <CardDisplay myRole={myRole} />
      <ActionPanel playerAddress={playerAddress} playerA={playerA} playerB={playerB} />
      <ShotHistory />
    </main>
  );
}
