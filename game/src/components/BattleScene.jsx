import React from 'react';
import character1Video from '../assets/character1.mp4';
import character2Video from '../assets/character2.mp4';
import enemyImage from '../assets/character_barbarian.jpg';

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

const CharacterSprite = ({
  videoSrc,
  imageSrc,
  isHit,
  isAttacking,
  flip,
  label,
  highlighted = false,
  muted = false,
  meta = null
}) => (
  <div className={`flex flex-col items-center gap-0.5 ${muted ? 'opacity-45 grayscale' : ''}`}>
    <span className={`max-w-20 truncate text-[10px] font-semibold uppercase tracking-wider ${highlighted ? 'text-emerald-200' : 'text-slate-500'}`}>
      {label}
    </span>
    <div
      className={[
        'battle-character',
        isHit ? 'battle-hit' : '',
        isAttacking ? 'battle-attack' : '',
        flip ? 'battle-flip' : '',
        highlighted ? 'battle-character-self' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="battle-sprite-frame">
        {videoSrc ? (
          <video
            src={videoSrc}
            loop
            autoPlay
            muted
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <img
            src={imageSrc}
            alt=""
            draggable="false"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </div>
    </div>
    {meta && (
      <span className="text-[10px] font-semibold tabular-nums text-slate-400">{meta}</span>
    )}
  </div>
);

const getCharacterVideo = (characterId) => (
  characterId === 'character2' ? character2Video : character1Video
);

const BattleScene = ({
  playerHp,
  enemyHp,
  maxHp,
  playerHit,
  enemyHit,
  playerAttacking,
  allies = null,
  localPlayerId = null,
  activeAttackPlayerId = null,
  roomStatus = null,
  localPlayerName = 'Mystic Burrito Pirate'
}) => {
  const isMultiplayer = Array.isArray(allies);
  const allySlots = isMultiplayer
    ? [
        ...allies,
        ...Array.from({ length: Math.max(0, 2 - allies.length) }, (_, index) => ({
          id: `waiting-${index}`,
          name: 'Waiting',
          connected: false,
          characterId: index === 0 ? 'character1' : 'character2',
          damage: 0
        }))
      ].slice(0, 2)
    : null;
  const enemyPct = Math.max(0, Math.min(100, (enemyHp / maxHp) * 100));

  return (
    <div className="battle-scene">
      <div className="flex items-end justify-between px-3 w-full max-w-md mx-auto">
        {isMultiplayer ? (
          <div className="flex flex-col items-start gap-1">
            <div className="flex items-end gap-1.5">
              {allySlots.map((player) => {
                const isSelf = player.id === localPlayerId;
                const isWaiting = String(player.id).startsWith('waiting-');
                const isAttacking = player.id === activeAttackPlayerId;

                return (
                  <CharacterSprite
                    key={player.id}
                    videoSrc={getCharacterVideo(player.characterId)}
                    isHit={false}
                    isAttacking={isAttacking}
                    flip={false}
                    label={player.name}
                    highlighted={isSelf}
                    muted={!player.connected || isWaiting}
                    meta={isWaiting ? null : `${player.damage || 0} dmg`}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-0.5">
            <HpBar current={playerHp} max={maxHp} side="left" />
            <CharacterSprite
              videoSrc={character1Video}
              isHit={playerHit}
              isAttacking={playerAttacking}
              flip={false}
              label={localPlayerName}
            />
          </div>
        )}

        <div className="battle-vs">VS</div>

        <div className="flex flex-col items-center gap-0.5">
          <HpBar current={enemyHp} max={maxHp} side="right" />
          <CharacterSprite
            imageSrc={enemyImage}
            isHit={enemyHit}
            isAttacking={false}
            flip={true}
            label={roomStatus === 'defeated' ? 'Defeated' : 'Enemy'}
            muted={enemyPct <= 0}
          />
        </div>
      </div>
    </div>
  );
};

export default BattleScene;
