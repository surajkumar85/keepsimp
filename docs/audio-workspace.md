# Audio workspace

Updated 15 October 2026. Applies to `/dashboard/audio-editor/` and its doors. The workspace is built in eight phases (the plan is at the end). **Phase 1 is built:** converting and taking sound out of videos, many files at once, each file checked before it is offered.

## What it does (phase 1)

- **One workspace, several doors.** The Audio editor is the tool; the Audio converter (`/dashboard/audio-converter/`) and the Audio extractor (`/dashboard/audio-extractor/`) are doors into it (`partOf: "audio-editor"` in `lib/catalogue.ts`), each with its own title, help and article. The extractor starts on "Same as the file". The Audio trimmer stays a planned card until phase 2.
- **Open** up to 50 files at once, by drop, picker, paste or the samples: MP3, M4A/AAC, Opus, Ogg Vorbis, FLAC, WAV, AIFF, and the sound of MP4, MOV, WebM and MKV videos. Files are told apart by their first bytes (`lib/audio/formats.ts`); a file that is not sound or video, or one nothing here can decode, says why and does not hold up the rest.
- **Each file** shows its kind, codec, length, sample rate, channels, average bitrate, size, tags and cover art, an overview waveform drawn from 2,000 peaks gathered while it is decoded (`lib/audio/peaks.ts`), and a player for the original and the result.
- **Formats:** MP3 (LAME, constant bitrate), M4A (AAC), Opus (in Ogg, always 48 kHz), FLAC (16 or 24 bits), WAV (16-bit, 24-bit or 32-bit float), M4R (an iPhone ringtone; at most 40 s, which the page warns of), and "Same as the file".
- **Quality** presets per codec, stereo then mono, in kbit/s (KeepSimp's own choices): MP3 96/64, 192/96, 320/160; AAC 96/64, 160/96, 256/128; Opus 48/32, 96/64, 160/96. Custom picks from each codec's list. Below 32 kHz an MP3 is MPEG-2, which holds at most 160 kbit/s; the plan says so.
- **Sample rate and channels:** the file's own or one chosen; the nearest a codec can hold is used and named. Lossy formats here are mono or stereo, so more channels are mixed down, with a note.
- **"Same as the file"** copies the sound from the file itself (never from what the page decoded) without decoding it (AAC into M4A, MP3, Opus and Vorbis into Ogg, FLAC, PCM into WAV) unless the rate, the channels, a depth or a size limit mean it must change; then it is encoded again in its own kind. Vorbis that must change becomes Opus (only Firefox encodes Vorbis), and sound that cannot be kept (AC-3, DTS, ALAC) becomes AAC; the page says which.
- **Tags and cover art** go into the new file where its format holds them, or none when the switch is off.
- **File size limit:** MP3, M4A and Opus are written at the highest bitrate whose size, less 3% and 8 KB for the container, fits (`lib/audio/target-size.ts`); lossless formats say they cannot be fitted.
- **Download** one file from the list, or all as one ZIP.
- **Offline:** the workspace, its worker and the encoders are build files, so they are in the offline copy; the samples are in `public/samples/`.

Every choice made for the person (a rate a codec cannot hold, a mix-down, a capped bitrate, a fitted size, a copy) is worked out in one place, `planFor` in `lib/audio/settings.ts`, and shown under the player as a sentence.

## How it is built

- **Mediabunny** (already used by the animation converter) reads and writes every container, decodes and encodes through WebCodecs, copies tracks, resamples and remixes, and reads and writes tags. Only `lib/audio/mediabunny-audio.ts` touches it, and it is handed the library, so the same code runs in the worker and in Node.
- **Encoders** come from Mediabunny's extensions, which it prefers to a browser's own once registered: LAME (`@mediabunny/mp3-encoder`) and libFLAC (`@mediabunny/flac-encoder`) always, since the main browsers have none and WebKit on Linux has its own (through GStreamer) that lose the end of the sound; for AAC the browser's own (Apple's is the best there is) when a short trial (`aacEncoding`) gives every sample back, otherwise FFmpeg's (`@mediabunny/aac-encoder`, a known 1,024 samples of priming). Each is imported when first needed and starts a worker of its own from inside the audio worker.
- **Patience:** some decoders stop giving samples without an error (WebKit on Linux). Every wait on decoding has a limit (`patiently`, 15 s): a file that cannot be probed is decoded by the page, the waveform and the check give up, and a conversion with no progress for 30 s is reported and its worker replaced.
- **The worker** (`audio.worker.ts`) reads a file (facts first, then peaks) or writes one by a plan, then decodes the result again for the check. The page runs at most two (`audioPoolSize`) through the shared `WorkerPool`.
- **Streaming:** sound is decoded and encoded chunk by chunk; a file is never held as samples, so long files take time, not memory. Peaks are gathered the same way.
- **Files the worker cannot decode:** a browser may say it decodes a codec and then fail on the first packet (Safari with FLAC), so a file's first second is decoded to find out (`decodes`). When it cannot, the page decodes it with `decodeAudioData` (which plays what `<audio>` plays) into a WAV of floats (`wavFromPlanes`), makes its peaks itself, and the worker writes from that WAV with the original's tags. AIFF, which Mediabunny does not read, is turned into the WAV it equals (`wavFromAiff`, checked byte for byte against FFmpeg for 8, 16 and 24 bits, little-endian AIFF-C and float).

### Gapless sound

Encoders put samples before the sound and pad its end. Here every file is exactly as long as its sound:

- **Reading.** AAC in MP4, Opus and Vorbis say so in their containers, which Mediabunny follows (priming comes before time 0; the track's length is the sound's). MP3 says so only in the LAME header, which Mediabunny does not read: `mp3Gapless` reads the encoder delay, the padding and the frame count, and the decoded samples kept start after the delay plus the 529 every MP3 decoder adds (`mp3Kept`). FFmpeg decodes the same count from every fixture.
- **Writing MP3.** Mediabunny writes a Xing frame without the LAME extension, so players would add about 50 ms of silence. `lameTagged` rewrites that frame: the frame count, the byte count, and the extension with LAME's delay (576), the padding and its CRC. The seeking table is dropped to make room; a file at one bitrate seeks without it. FFmpeg then decodes exactly the samples of the source.
- **Writing AAC.** Browser encoders hand out packets from time 0 with their priming inside, and encoders differ (Apple's puts 2,112 samples, FFmpeg's 1,024). `aacPriming` measures this browser's: 8,192 samples of noise are encoded and decoded, and where they come back is the priming. `withEditList` (`lib/audio/mp4-edit.ts`) then writes the MP4 edit list (start after the priming, play the sound's length), moving chunk offsets when the movie box comes first. Browsers and FFmpeg follow edit lists; Apple's own players have long assumed 2,112 samples and read iTunes' own tag instead, which is not written ([Apple](https://developer.apple.com/documentation/quicktime-file-format/appendix_g_audio_priming_handling_encoder_delay_in_aac)).
- **Writing Opus.** The Ogg file declares a pre-skip of 312 samples, which most encoders put first; WebKit on Linux puts none and declares 312 all the same, so players cut the start. `opusDelay` measures the encoder's real delay with a burst of noise (`signedLag` finds it either way), and the file's pre-skip is set to it. Its last page's granule position also counted the padding at the end, so players played it. `withOpusEnd` (`lib/audio/ogg-end.ts`) sets that granule to the pre-skip plus the sound's samples at 48 kHz and writes the page's checksum again; FFmpeg then decodes exactly the sound.
- **Exact lengths.** Every encoded file is cut to the planned number of samples in the per-sample hook: resampling can make one more.

### Exact samples for lossless formats

Decoders hand out floats; Mediabunny's conversion to whole numbers scales by one less than full scale and truncates, which lowered every positive sample by one. For FLAC and integer WAV the hook turns floats into whole numbers itself (`asIntegers`: times full scale, rounded, clamped), from the decoder's own floats, so FLAC from FLAC is the same samples as the original.

### The check

Each result is opened again and decoded from start to end (`hearAudio`, with the same gapless rules), and `checkResult` holds its length (within about two codec frames, or 0.25 s for copied sound, which is cut on frames), sample rate and channels against the plan; an MP3 more than 20% under its bitrate (tags and cover only add bytes), and a silent result from a sound source, are reported. When the browser cannot decode the format written (FLAC in Safari), the page says it was not listened to here.

### Things found while building

- `new Quality(number)` is not a bitrate in Mediabunny: an MP3 "at 192 kbit/s" came out at 34. `new Quality({ bitrate })` is; and Opus refused the former outright. The MP3 bitrate check was added because the length check could not see this.
- **Cancelling a conversion can wait for ever** while an encoder's own worker is busy (Mediabunny's `Output.cancel` waits on a lock the conversion holds). A worker that stops a job therefore says `retired`, and `WorkerPool` ends it and starts another; ending it ends the encoder's worker too. Before this, about one run in four of the browser suite stalled.
- **The pool asks for its next job before the page draws again,** so it saw a file that had just finished as still waiting and wrote it twice. The page's dispatch now updates the pool's view of the files at once.
- **Downloads use a second, untyped link to the same bytes:** with `audio/mp4`, Firefox saves an M4R as `.mp4`, and Safari on a phone opens sound to play instead of saving it. The page plays from the typed link.
- **The player has a fixed height,** since it grows when it has read a file and moved the list under it.
- Port 4190 is ManageSieve, which Firefox and WebKit refuse to load.

## Tests

- **Unit, 100%:** `formats.test.ts`, `settings.test.ts` (every plan rule), `gapless.test.ts` (headers read and written by hand and from FFmpeg, peaks, the check, size fitting), `wav.test.ts` (AIFF against FFmpeg, WAV writing), `mp4-edit.test.ts` (real M4As judged by FFmpeg, hand-made boxes for 64-bit lists and offsets), `queue.test.ts`.
- **Engine in Node** (`audio.node.test.ts`): reading WAV, AIFF and MP3 facts; writing WAV at another depth and rate, FLAC at 16 and 24 bits (FFmpeg decodes the very samples of the source), gapless MP3 at its bitrate (FFmpeg decodes exactly the source's length), tags kept, dropped and given, and copying. Node has no WebCodecs, so AAC and Opus are covered in the browser.
- **Browser** (`e2e/audio-workspace.spec.ts`, five profiles): the samples to gapless MP3 with tags and cover (exact sample count by FFmpeg) and a ZIP; every format read back by FFprobe and FFmpeg (AAC exact through the edit list, FLAC bit for bit, WAV 24-bit mono at 22.05 kHz exact); the extractor copying a video's AAC packet for packet, then MP3; AIFF, a file that is not sound, tags off and a size limit; axe in both themes, 320 px, the keyboard and no outside requests. `e2e/offline.spec.ts` converts the samples to MP3 with the server stopped.
- Fixtures: `tests/fixtures/audio/make.sh` (FFmpeg); samples: `scripts/sample-audio.sh`.

## The plan

1. **The workspace, converting and extracting.** Built.
2. **The waveform editor:** trim, cut, silence, split, fades, volume, as steps with undo; ringtone presets. Doors: Audio trimmer, Ringtone maker.
3. **Loudness and dynamics:** BS.1770-5 meter, normalising to named targets with a true-peak limiter, volume boost, compressor, equaliser, silence trimming. Doors: Normalize audio, Volume booster.
4. **Joining and splitting.** Doors: Join audio, Audio splitter.
5. **Speed, pitch and channels,** reverse, karaoke (said to be what it is). Door: Change audio speed.
6. **Noise reduction and repair:** RNNoise, hum, rumble, clicks, sibilance. Door: Remove background noise.
7. **Recording and tags.** Doors: Voice recorder, Edit audio tags.
8. **Words and pictures:** transcription with Whisper on the device, a spectrogram, audio to video. Doors: Transcribe audio, Audio to video.
