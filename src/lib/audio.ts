const SOUNDS = {
  match_found: '/assets/sounds/match_found.mp3',
  turn_start: '/assets/sounds/turn_start.mp3',
  choose_target: '/assets/sounds/choose_target.mp3',
  card_submit: '/assets/sounds/card_submit.mp3',
  countdown_tick: '/assets/sounds/countdown_tick.mp3',
  countdown_final: '/assets/sounds/countdown_final.mp3',
  card_reveal: '/assets/sounds/card_reveal.mp3',
  shot_live: '/assets/sounds/shot_live.mp3',
  shot_blank: '/assets/sounds/shot_blank.mp3',
  kill: '/assets/sounds/kill.mp3',
  win: '/assets/sounds/win.mp3',
  lose: '/assets/sounds/lose.mp3',
  hover_button: '/assets/sounds/hover_button.mp3',
  click_button: '/assets/sounds/click_button.mp3',
  queue_waiting: '/assets/sounds/queue_waiting.mp3',
  chamber_advance: '/assets/sounds/chamber_advance.mp3',
  redirect_reveal: '/assets/sounds/redirect_reveal.mp3',
  bluff_reveal: '/assets/sounds/bluff_reveal.mp3',
} as const;

export type SoundName = keyof typeof SOUNDS;

// Preload audio buffers
const preloaded = new Map<string, HTMLAudioElement>();

function preload(name: SoundName): void {
  const src = SOUNDS[name];
  if (!preloaded.has(src)) {
    const audio = new Audio(src);
    audio.preload = 'auto';
    preloaded.set(src, audio);
  }
}

// Preload all sounds on module load
Object.keys(SOUNDS).forEach((name) => preload(name as SoundName));

// Unlock audio on first user interaction
let unlocked = false;
function unlock() {
  if (unlocked) return;
  unlocked = true;
  // Play a silent buffer to unlock audio context
  const silent = new Audio();
  silent.play().catch(() => {});
  document.removeEventListener('click', unlock);
  document.removeEventListener('touchstart', unlock);
  document.removeEventListener('keydown', unlock);
}
document.addEventListener('click', unlock);
document.addEventListener('touchstart', unlock);
document.addEventListener('keydown', unlock);

let loopingAudio: HTMLAudioElement | null = null;

// --- Background music (loaded on demand, not preloaded) ---
const MUSIC_TRACKS = [
  '/assets/sounds/musicshot1.mp3',
  '/assets/sounds/musicshot2.mp3',
];

let musicAudio: HTMLAudioElement | null = null;

export function startMusic(volume = 0.25): void {
  stopMusic();
  try {
    // Pick a random track
    const src = MUSIC_TRACKS[Math.floor(Math.random() * MUSIC_TRACKS.length)];
    const audio = new Audio(src);
    audio.volume = volume;
    // When the track ends, loop it
    audio.addEventListener('ended', () => {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    });
    audio.play().catch(() => {});
    musicAudio = audio;
  } catch {}
}

export function stopMusic(): void {
  if (musicAudio) {
    musicAudio.pause();
    musicAudio.currentTime = 0;
    musicAudio = null;
  }
}

export function playSound(name: SoundName, volume = 0.5): void {
  try {
    const src = SOUNDS[name];
    // Clone from preloaded so multiple sounds can play simultaneously
    const base = preloaded.get(src);
    const audio = base ? base.cloneNode(true) as HTMLAudioElement : new Audio(src);
    audio.volume = volume;
    audio.play().catch(() => {});
  } catch {}
}

export function playLoop(name: SoundName, volume = 0.15): void {
  stopLoop();
  try {
    const audio = new Audio(SOUNDS[name]);
    audio.volume = volume;
    audio.loop = true;
    audio.play().catch(() => {});
    loopingAudio = audio;
  } catch {}
}

export function stopLoop(): void {
  if (loopingAudio) {
    loopingAudio.pause();
    loopingAudio.currentTime = 0;
    loopingAudio = null;
  }
}
