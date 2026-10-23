#!/bin/sh
# Writes the video behind "Try a sample" in the video compressor, with FFmpeg:
# six seconds of a slowly zooming Mandelbrot set at 960 × 540, kept shallow so the file stays small (it is in the offline copy), busy enough that
# compressing it shows something, with the audio samples' tune as its sound.
# Written at a high quality on purpose, so there is something to take away.
# Run from the repository, after scripts/sample-audio.sh.
set -eu
out=public/samples
ffmpeg -loglevel error -y \
  -f lavfi -i "mandelbrot=size=960x540:rate=30:start_scale=3:end_scale=1:end_pts=180:maxiter=200" \
  -i "$out/keepsimp-tune.flac" -map 0:v -map 1:a -t 6 \
  -c:v libx264 -pix_fmt yuv420p -crf 27 -preset slow -g 60 \
  -c:a aac -b:a 128k -movflags +faststart \
  -metadata title="A zooming Mandelbrot set" -metadata artist="KeepSimp" \
  "$out/keepsimp-scene.mp4"
ls -la "$out/keepsimp-scene.mp4"
