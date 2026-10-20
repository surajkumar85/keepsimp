#!/bin/sh
# Makes the small sound files the audio tests read, with FFmpeg: half a
# second of a 440 Hz tone (left) and 660 Hz (right), in the formats the
# workspace reads, and the WAV each AIFF must equal sample for sample.
set -eu
cd "$(dirname "$0")"
tone="sine=frequency=440:duration=0.5:sample_rate=22050"
other="sine=frequency=660:duration=0.5:sample_rate=22050"
make() { out=$1; shift; ffmpeg -loglevel error -y -f lavfi -i "$tone" -f lavfi -i "$other" -filter_complex "[0][1]amerge=inputs=2" "$@" "$out"; }
make tone.mp3 -c:a libmp3lame -b:a 64k
make tone-mono.mp3 -ac 1 -c:a libmp3lame -b:a 32k
make tone.wav -c:a pcm_s16le
make tone-24.wav -c:a pcm_s24le
make tone-float.wav -c:a pcm_f32le
make tone-8.wav -c:a pcm_u8
make tone.aiff -c:a pcm_s16be
make tone-24.aiff -c:a pcm_s24be
make tone-8.aiff -c:a pcm_s8
make tone-sowt.aifc -f aiff -c:a pcm_s16le
make tone-float.aifc -f aiff -c:a pcm_f32be
make tone.flac -c:a flac
make tone.m4a -c:a aac -b:a 64k
make tone.opus -c:a libopus -b:a 48k
ffmpeg -loglevel error -y -i tone.m4a -c copy -movflags +faststart tone-faststart.m4a
ffmpeg -loglevel error -y -i tone.m4a -c copy -use_editlist 0 tone-noedit.m4a
# Speech for noise reduction, from eSpeak NG (brew install espeak-ng); its
# output is not covered by its licence, unlike the voices macOS comes with.
espeak-ng -v en-us -s 150 -p 45 -w speech.wav "The quick brown fox jumps over the lazy dog. Recording a voice note in a busy room is hard, so we remove the background noise on your own device."
ffmpeg -loglevel error -y -i speech.wav -ar 48000 -ac 1 -c:a flac -sample_fmt s16 speech.flac
rm speech.wav
