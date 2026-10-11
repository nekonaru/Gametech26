import { createGame } from './game/main.js';
import { registerServiceWorker } from './core/sw.js';

async function main(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const loadingScreen = document.getElementById('loading-screen') as HTMLDivElement;
  const loadingBar = document.getElementById('loading-bar-fill') as HTMLDivElement;
  const loadingStatus = document.getElementById('loading-status') as HTMLDivElement;

  const updateLoading = (progress: number, status: string) => {
    loadingBar.style.width = `${progress}%`;
    loadingStatus.textContent = status;
  };

  updateLoading(10, 'Menginisialisasi game...');

  try {
    const game = await createGame(canvas);

    updateLoading(100, 'Siap!');
    loadingScreen.classList.add('hidden');

    window.addEventListener('beforeunload', async () => {
      await game.dispose();
    });

    console.log('Asap yang Tak Padam - Game initialized successfully');
  } catch (error) {
    console.error('Failed to initialize game:', error);
    loadingStatus.textContent = 'Error: ' + (error as Error).message;
    loadingStatus.style.color = '#ff4444';
  }
}

main();
registerServiceWorker();