#!/bin/sh
# Writes the files behind "Try a sample" in the audio workspace, with FFmpeg:
# a short tune as FLAC, with tags and the KeepSimp mark as its cover, and a
# short video with AAC sound to take the sound out of. Run from the repository.
set -eu
out=public/samples
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
# A few bars of a soft arpeggio: each note fades out, left and right a little apart.
note() { echo "0.25*sin(2*PI*$1*t)*exp(-3*mod(t,0.5))*between(t,$2,$2+0.5)"; }
left="$(note 261.63 0)+$(note 329.63 0.5)+$(note 392.00 1)+$(note 523.25 1.5)+$(note 392.00 2)+$(note 329.63 2.5)+$(note 293.66 3)+$(note 349.23 3.5)+$(note 440.00 4)+$(note 587.33 4.5)+$(note 440.00 5)+$(note 349.23 5.5)+$(note 261.63 6)+$(note 329.63 6.5)+$(note 392.00 7)+$(note 523.25 7.5)"
right="$(echo "$left" | sed 's/0.25\*/0.22*/g')"
ffmpeg -loglevel error -y -f lavfi -i "aevalsrc=exprs='$left|$right':s=44100:d=8" -c:a pcm_s16le "$work/tune.wav"
ffmpeg -loglevel error -y -i "$work/tune.wav" -i public/icons/icon-192.png \
  -map 0:a -map 1:v -c:a flac -c:v copy -disposition:v attached_pic \
  -metadata title="A short tune" -metadata artist="KeepSimp" \
  -metadata album="Samples" -metadata date=2026 -metadata genre="Demo" \
  "$out/keepsimp-tune.flac"
ffmpeg -loglevel error -y -f lavfi -i "testsrc2=size=320x180:rate=15:duration=6" \
  -i "$work/tune.wav" -t 6 -c:v libx264 -pix_fmt yuv420p -crf 32 -preset veryslow \
  -c:a aac -b:a 96k -movflags +faststart -shortest "$out/keepsimp-clip.mp4"
ls -la "$out/keepsimp-tune.flac" "$out/keepsimp-clip.mp4"
