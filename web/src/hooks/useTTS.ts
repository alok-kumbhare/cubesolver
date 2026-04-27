import { useEffect, useRef } from 'react';

export interface TTSOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
}

export interface TTS {
  speak: (text: string, opts?: TTSOptions) => void;
  cancel: () => void;
  supported: boolean;
}

export function useTTS(enabled: boolean): TTS {
  const supported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;
  const lastTextRef = useRef<string>('');

  useEffect(() => {
    if (!enabled && supported) window.speechSynthesis.cancel();
  }, [enabled, supported]);

  function speak(text: string, opts: TTSOptions = {}) {
    if (!supported || !enabled || !text) return;
    if (text === lastTextRef.current) return;
    lastTextRef.current = text;
    // Strip symbols that screen-reader voices pronounce literally
    // (e.g. "↻" → "open circle arrow", "🔄" → "arrows counter-clockwise").
    // We keep the visual arrows in the on-screen text — only the spoken
    // form is sanitized.
    const spoken = text
      .replace(/[\u2190-\u21FF\u2300-\u23FF\u2B00-\u2BFF]/g, '') // arrows / misc tech / misc symbols
      .replace(/\p{Extended_Pictographic}/gu, '') // emoji
      .replace(/\s+/g, ' ')
      .trim();
    if (!spoken) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(spoken);
    u.rate = opts.rate ?? 0.95;
    u.pitch = opts.pitch ?? 1.1;
    u.volume = opts.volume ?? 1;
    window.speechSynthesis.speak(u);
  }

  function cancel() {
    if (supported) window.speechSynthesis.cancel();
    lastTextRef.current = '';
  }

  return { speak, cancel, supported };
}
