import Phaser from 'phaser';
import { GameScene } from './render/GameScene';
import { UIManager } from './ui/UIManager';
import { initAuth } from './ui/AuthModal';

// Initialize auth early
initAuth();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#0a0a0f',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [GameScene],
  render: {
    pixelArt: false,
    antialias: true,
  },
  audio: {
    noAudio: true,
  },
  input: {
    keyboard: true,
    mouse: true,
  },
};

const game = new Phaser.Game(config);

// Wait for scene to be ready, then initialize UI
game.events.once('ready', () => {
  const checkScene = () => {
    const scene = game.scene.getScene('GameScene') as GameScene;
    if (scene && scene.state) {
      new UIManager(scene);
    } else {
      setTimeout(checkScene, 100);
    }
  };
  checkScene();
});

// Handle resize
window.addEventListener('resize', () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});

// Prevent context menu
window.addEventListener('contextmenu', (e) => e.preventDefault());
