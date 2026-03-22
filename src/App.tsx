import { useState, useCallback } from 'react';
import WalletConnect from '@/components/WalletConnect';
import MatchmakingLobby from '@/components/MatchmakingLobby';
import GameScreen from '@/components/GameScreen';
import ResultBanner from '@/components/ResultBanner';
import { useGameStore } from '@/game/store';
import type { MatchFoundEvent } from '@/lib/matchmaking';

type AppScreen = 'connect' | 'lobby' | 'game';

interface MatchInfo {
  matchId: string;
  playerA: string;
  playerB: string;
}

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('connect');
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [showResult, setShowResult] = useState(false);
  const gameState = useGameStore((s) => s.gameState);
  const resetGame = useGameStore((s) => s.resetGame);

  const handleWalletConnected = (address: string) => {
    setWalletAddress(address);
    setScreen('lobby');
  };

  const handleDisconnect = () => {
    setWalletAddress(null);
    setMatch(null);
    setShowResult(false);
    setScreen('connect');
  };

  const handleMatchFound = useCallback((event: MatchFoundEvent) => {
    resetGame();
    setMatch({
      matchId: event.matchId,
      playerA: event.playerA,
      playerB: event.playerB,
    });
    setShowResult(false);
    setScreen('game');
  }, [resetGame]);

  const handleLeaveMatch = () => {
    setMatch(null);
    setShowResult(false);
    setScreen('lobby');
  };

  const handlePlayAgain = () => {
    setShowResult(false);
    setMatch(null);
    setScreen('lobby');
  };

  // Show result banner when game ends
  const isGameOver = gameState.phase === 'gameOver' && screen === 'game';
  if (isGameOver && !showResult) {
    setTimeout(() => setShowResult(true), 2000);
  }

  if (screen === 'connect' || !walletAddress) {
    return <WalletConnect onConnected={handleWalletConnected} />;
  }

  if (screen === 'lobby' || !match) {
    return (
      <MatchmakingLobby
        playerAddress={walletAddress}
        onMatchFound={handleMatchFound}
        onDisconnect={handleDisconnect}
      />
    );
  }

  return (
    <>
      <GameScreen
        matchId={match.matchId}
        playerAddress={walletAddress}
        playerA={match.playerA}
        playerB={match.playerB}
        onLeaveMatch={handleLeaveMatch}
      />
      {showResult && (
        <ResultBanner
          winner={gameState.winner}
          playerAddress={walletAddress}
          playerA={match.playerA}
          playerB={match.playerB}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </>
  );
}
