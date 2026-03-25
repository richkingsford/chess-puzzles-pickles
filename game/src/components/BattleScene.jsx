import React from 'react';
import character1Video from '../assets/character1.mp4';
import character2Video from '../assets/character2.mp4';

const HpBar = ({ current, max, side }) => {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const isLow = pct <= 25;
  const isMid = pct <= 50 && !isLow;

  const barColor = isLow
    ? 'bg-red-500'
    : isMid
      ? 'bg-yellow-500'
      : 'bg-emerald-500';

  const glowColor = isLow
    ? 'shadow-red-500/40'
    : isMid
      ? 'shadow-yellow-500/30'
      : 'shadow-emerald-500/30';

  return (
    <div className={`flex flex-col gap-0.5 ${side === 'right' ? 'items-end' : 'items-start'}`}>
      <span className="text-[10px] font-bold text-slate-400 tabular-nums">
        {current} / {max}
      </span>
      <div className={`w-20 h-2 rounded-full bg-slate-700 overflow-hidden shadow-sm ${glowColor}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
          style={{ width: `${pct}%`, float: side === 'right' ? 'right' : 'left' }}
        />
      </div>
    </div>
  );
};

const CharacterSprite = ({ videoSrc, isHit, isAttacking, flip, label }) => {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      <div
        className={[
          'battle-character',
          isHit ? 'battle-hit' : '',
          isAttacking ? 'battle-attack' : '',
          flip ? 'battle-flip' : '',
        ].filter(Boolean).join(' ')}
      >
        <div className="battle-sprite-frame">
          <video
            src={videoSrc}
            loop
            autoPlay
            muted
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>
      </div>
    </div>
  );
};

const BattleScene = ({ playerHp, enemyHp, maxHp, playerHit, enemyHit, playerAttacking }) => {
  return (
    <div className="battle-scene">
      <div className="flex items-end justify-between px-3 w-full max-w-md mx-auto">
        {/* Player (cat) - left side */}
        <div className="flex flex-col items-center gap-0.5">
          <HpBar current={playerHp} max={maxHp} side="left" />
          <CharacterSprite
            videoSrc={character1Video}
            isHit={playerHit}
            isAttacking={playerAttacking}
            flip={false}
            label="You"
          />
        </div>

        {/* VS spark */}
        <div className="battle-vs">⚔</div>

        {/* Enemy (angry puppy) - right side, flipped */}
        <div className="flex flex-col items-center gap-0.5">
          <HpBar current={enemyHp} max={maxHp} side="right" />
          <CharacterSprite
            videoSrc={character2Video}
            isHit={enemyHit}
            isAttacking={false}
            flip={true}
            label="Enemy"
          />
        </div>
      </div>
    </div>
  );
};

export default BattleScene;
