import { useState, useCallback, useRef } from 'react';

const STARTING_HP = 100;
const CORRECT_MOVE_DAMAGE = 8;
const HINT_PENALTY_DAMAGE = 15;
const FREE_HINTS = 2;
const MIN_PLAYER_HP = 1;

export const useBattleState = () => {
  const [playerHp, setPlayerHp] = useState(STARTING_HP);
  const [enemyHp, setEnemyHp] = useState(STARTING_HP);
  const [playerHit, setPlayerHit] = useState(false);
  const [enemyHit, setEnemyHit] = useState(false);
  const [playerAttacking, setPlayerAttacking] = useState(false);
  const playerHitTimer = useRef(null);
  const enemyHitTimer = useRef(null);
  const attackTimer = useRef(null);

  const clearTimers = useCallback(() => {
    clearTimeout(playerHitTimer.current);
    clearTimeout(enemyHitTimer.current);
    clearTimeout(attackTimer.current);
  }, []);

  const dealDamageToEnemy = useCallback(() => {
    setPlayerAttacking(true);
    clearTimeout(attackTimer.current);
    attackTimer.current = setTimeout(() => {
      setPlayerAttacking(false);
      setEnemyHit(true);
      setEnemyHp(prev => Math.max(0, prev - CORRECT_MOVE_DAMAGE));
      clearTimeout(enemyHitTimer.current);
      enemyHitTimer.current = setTimeout(() => setEnemyHit(false), 400);
    }, 200);
  }, []);

  const dealDamageToPlayer = useCallback(() => {
    setPlayerHit(true);
    setPlayerHp(prev => Math.max(MIN_PLAYER_HP, prev - HINT_PENALTY_DAMAGE));
    clearTimeout(playerHitTimer.current);
    playerHitTimer.current = setTimeout(() => setPlayerHit(false), 400);
  }, []);

  const onCorrectMove = useCallback(() => {
    dealDamageToEnemy();
  }, [dealDamageToEnemy]);

  const onHintUsed = useCallback((hintNumber) => {
    if (hintNumber > FREE_HINTS) {
      dealDamageToPlayer();
    }
  }, [dealDamageToPlayer]);

  const reset = useCallback(() => {
    clearTimers();
    setPlayerHp(STARTING_HP);
    setEnemyHp(STARTING_HP);
    setPlayerHit(false);
    setEnemyHit(false);
    setPlayerAttacking(false);
  }, [clearTimers]);

  return {
    playerHp,
    enemyHp,
    maxHp: STARTING_HP,
    playerHit,
    enemyHit,
    playerAttacking,
    freeHints: FREE_HINTS,
    onCorrectMove,
    onHintUsed,
    reset,
  };
};
