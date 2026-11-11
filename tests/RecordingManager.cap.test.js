import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RecordingManager, MAX_DURATION_MS } from '../src/managers/RecordingManager.js';

// Minimal MediaRecorder / MediaStream fakes: jsdom has neither.
class FakeRecorder {
  constructor() { this.state = 'inactive'; this.listeners = {}; }
  static isTypeSupported(type) { return type === 'video/webm'; }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    (this.listeners.dataavailable || []).forEach(fn => fn({ data: new Blob(['x']) }));
    (this.listeners.stop || []).forEach(fn => fn());
  }
}

function fakeStream() {
  const track = { stop: vi.fn(), addEventListener: vi.fn() };
  return { track, getTracks: () => [track], getVideoTracks: () => [track], getAudioTracks: () => [track] };
}

describe('RecordingManager — 60 s hard cap', () => {
  let screen;
  beforeEach(() => {
    vi.useFakeTimers();
    screen = fakeStream();
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    vi.stubGlobal('MediaStream', class { constructor(tracks) { this.tracks = tracks; } });
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue(screen), getUserMedia: vi.fn() } });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('auto-stops at 60 s, hands over a video/webm blob and releases the screen', async () => {
    const rm = new RecordingManager();
    const onStop = vi.fn();
    const ticks = [];
    rm.onStop = onStop;
    rm.onTick = (s) => ticks.push(s);

    expect(await rm.startRecording()).toBe(true);
    expect(ticks[0]).toBe(60);

    vi.advanceTimersByTime(MAX_DURATION_MS - 1);
    expect(rm.isRecording).toBe(true);
    expect(onStop).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(rm.isRecording).toBe(false);
    expect(onStop).toHaveBeenCalledTimes(1);
    const { blob, duration } = onStop.mock.calls[0][0];
    expect(blob.type).toBe('video/webm');
    expect(duration).toBeLessThanOrEqual(MAX_DURATION_MS);
    expect(screen.track.stop).toHaveBeenCalled();
    expect(MAX_DURATION_MS).toBe(60000);
  });

  it('records without narration when the mic is denied', async () => {
    navigator.mediaDevices.getUserMedia.mockRejectedValue(new Error('denied'));
    const rm = new RecordingManager();
    expect(await rm.startRecording({ withMic: true })).toBe(true);
    expect(rm.isRecording).toBe(true);
    rm.destroy();
    expect(screen.track.stop).toHaveBeenCalled();
  });

  it('returns false when the share picker is cancelled', async () => {
    navigator.mediaDevices.getDisplayMedia.mockRejectedValue(new Error('NotAllowedError'));
    expect(await new RecordingManager().startRecording()).toBe(false);
  });
});
