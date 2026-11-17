import { describe, expect, it } from 'vitest';

import { TrackPlaces } from './trackPlaces.js';

describe('where the styles’ tracks were left', () => {
  it('picks a style’s track up where it was left', () => {
    const places = new TrackPlaces();
    expect(places.from('style:chess', 'a/chess.mp3')).toBe(0);
    places.leave('style:chess', 'a/chess.mp3', 42.5);
    expect(places.from('style:chess', 'a/chess.mp3')).toBe(42.5);
    places.leave('style:chess', 'a/chess.mp3', 80);
    expect(places.from('style:chess', 'a/chess.mp3')).toBe(80);
    expect(places.from('style:subway', 'a/subway.mp3')).toBe(0);
  });

  it('starts the shared music from the top every time', () => {
    const places = new TrackPlaces();
    places.leave('music_battle', 'a/battle.mp3', 30);
    expect(places.from('music_battle', 'a/battle.mp3')).toBe(0);
  });

  it('keeps nothing of a track never really played', () => {
    const places = new TrackPlaces();
    places.leave('style:chess', 'a/chess.mp3', Number.NaN);
    places.leave('style:noir', 'a/noir.mp3', 0);
    expect(places.from('style:chess', 'a/chess.mp3')).toBe(0);
    expect(places.from('style:noir', 'a/noir.mp3')).toBe(0);
  });

  it('forgets every place for a new match', () => {
    const places = new TrackPlaces();
    places.leave('style:chess', 'a/chess.mp3', 42.5);
    places.clear();
    expect(places.from('style:chess', 'a/chess.mp3')).toBe(0);
  });
});
