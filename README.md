# Piano Path

A practice app for learning to read music, sight-read and play by ear on your own digital piano. It runs in Chrome and connects to the piano over Bluetooth MIDI or a USB cable.

## Use it on an Android tablet

1. Open the app's https:// address in **Chrome**.
2. Tap **⋮ → Add to Home screen** (or **Install app**). It then opens like a normal app and works offline.
3. Switch on the piano's Bluetooth (MIDI). Don't pair it in Android Settings.
4. In the app, tap **Connect piano → Find my piano**. Allow "Nearby devices" or Location if Chrome asks; Android needs that to scan for Bluetooth.
5. Optional: **Settings → Timing calibration** so rhythm and sight-reading scores allow for Bluetooth delay.

No piano nearby? Use the on-screen keys, or on a laptop the keys `A W S E D F T G Y H U J K` (C4 to C5; `Z`/`X` change octave).

## What's in it

19 skills in five strands (ear; keys, scales and chords; reading; sight-reading and playing by ear; repertoire), 96 stages from beginner to early-intermediate. Intermediate stages (marked in amber) include two-octave and hands-together scales, arpeggios, sixteenths, triplets and 6/8, hands-together sight-reading with dynamics, accompanying a tune by ear, and a piece-learning mode (hands separately, loop bars, wait-for-me, automatic tempo steps, MusicXML import). Tap a locked stage number to take a placement test.

## How it teaches

- **Sound before symbol**: every daily session starts with ear training.
- **Spaced repetition** (Leitner boxes): missed items come back sooner.
- **Mastery and fluency goals**: a stage unlocks the next at 90% accuracy within a time goal.
- **Interleaved practice**: each session mixes ear, keys/theory, reading and sight-reading.
- **Functional ear training**: notes and chords are heard in a key (do-re-mi, I-IV-V).
- **Pulse-first sight-reading**: look first, then play with a click and keep going.
- **Correct-response practice**: after a mistake you play the right answer before moving on.

Progress is stored in the browser on the device.

## Files

Plain HTML, CSS and JavaScript with no build step: `index.html`, `js/` (music theory and notation, piano input, lessons, app), `sw.js` (offline cache), `manifest.webmanifest`, `icons/`.
