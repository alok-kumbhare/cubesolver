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
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
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
