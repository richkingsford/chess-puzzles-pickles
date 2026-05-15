export const PLAYER_NAME_STORAGE_KEY = 'pickle-player-name';

export const PLAYER_NAMES = [
  'Disco Viking Platypus',
  'Galactic Taco Wizard',
  'Quantum Donut Knight',
  'Flamingo Karate Detective',
  'Space Panda Barbarian',
  'Turbo Sloth Ranger',
  'Glitter Zombie Astronaut',
  'Laser Chicken Warlord',
  'Banana Samurai Dolphin',
  'Caffeinated Walrus Monk',
  'Mystic Burrito Pirate',
  'Time-Traveling Ferret Ninja',
  'Cosmic Potato Gladiator',
  'Electric Koala Mage',
  'Turbo Unicorn Cowboy',
  'Rainbow Yeti Sorcerer',
  'Stealthy Penguin Shaman',
  'Robo Octopus Samurai',
  'Chaotic Muffin Bard',
  'Pancake Viking Robot',
  'Disco Mole Champion',
  'Turbo Banana Alchemist',
  'Galactic Tofu Knight',
  'Sparkle Platypus Pirate',
  'Sneaky Narwhal Wizard',
  'Lava Chicken Paladin',
  'Space Burrito Ninja',
  'Quantum Penguin Gladiator',
  'Glitter Hamster Sorcerer',
  'Funky Wombat Overlord',
  'Rainbow T-Rex Ranger',
  'Galactic Waffle Mystic',
  'Cyber Pigeon Knight',
  'Turbo Lizard Shaman',
  'Disco Donkey Warlock',
  'Ninja Cactus Cowboy',
  'Electric Tofu Pirate',
  'Chaotic Lobster Wizard',
  'Quantum Taco Prophet',
  'Space Alpaca Knight',
  'Robo Muffin Gladiator',
  'Glitter Shark Wizard',
  'Sneaky Platypus Paladin',
  'Turbo Marshmallow Ninja',
  'Space Hamster Captain',
  'Chaotic Cactus Mage',
  'Galactic Pancake Assassin',
  'Quantum Raccoon Overlord',
  'Disco Burrito Crusader',
  'Ninja Banana Bard',
  'Electric Llama Prophet',
  'Sparkle Sloth Samurai',
  'Space Cookie Ranger',
  'Galactic Ferret Sorcerer',
  'Turbo Owl Shaman',
  'Jellyfish Knight Commander',
  'Quantum Nacho Druid',
  'Glitter Falcon Paladin',
  'Ninja Donut Gladiator',
  'Chaotic Pigeon Pirate',
  'Space Corgi Ranger',
  'Galactic Cupcake Warlord',
  'Rainbow Hedgehog Monk',
  'Disco Pancake Knight',
  'Turbo Penguin Alchemist',
  'Quantum Marshmallow Warrior',
  'Sparkle Giraffe Mystic',
  'Robo Taco Commander',
  'Galactic Otter Prophet',
  'Electric Frog Sorcerer',
  'Ninja Waffle Barbarian',
  'Chaotic Banana Wizard',
  'Turbo Mole Knight',
  'Space Flamingo Ranger',
  'Disco Tofu Druid',
  'Quantum Muffin Mage',
  'Sneaky Wombat Pirate',
  'Glitter Burrito Gladiator',
  'Galactic Cactus Samurai',
  'Electric Narwhal Wizard',
  'Robo Pancake Ranger',
  'Space Donut Sorcerer',
  'Turbo Platypus Monk',
  'Ninja Potato Prophet',
  'Chaotic Walrus Alchemist',
  'Galactic Cookie Ninja',
  'Rainbow Lizard Knight',
  'Quantum Burrito Ranger',
  'Disco Penguin Samurai',
  'Electric Yeti Wizard',
  'Turbo Raccoon Overlord'
];

export const getRandomPlayerName = () => (
  PLAYER_NAMES[Math.floor(Math.random() * PLAYER_NAMES.length)]
);

export const getOrCreatePlayerName = () => {
  try {
    const existingName = localStorage.getItem(PLAYER_NAME_STORAGE_KEY);
    if (existingName && existingName !== 'Player') {
      return existingName;
    }

    const nextName = getRandomPlayerName();
    localStorage.setItem(PLAYER_NAME_STORAGE_KEY, nextName);
    return nextName;
  } catch {
    return getRandomPlayerName();
  }
};
