"use client"

import { useState } from "react"

/**
 * The tutorial player. Videos are streamed, not kept for offline use, so when
 * one cannot load the page says so and points at the written steps.
 */
export function TutorialVideo({
  video,
  poster,
  captions,
}: {
  video: string
  poster: string
  captions: string
}) {
  const [failed, setFailed] = useState(false)
  return (
    <>
      <video
        controls
        playsInline
        preload="none"
        poster={poster}
        width={1920}
        height={1080}
        aria-describedby="tutorial-steps"
        className="aspect-video h-auto w-full rounded-xl border bg-muted"
        onLoadedData={() => setFailed(false)}
      >
        <source src={video} type="video/mp4" onError={() => setFailed(true)} />
        <track kind="captions" src={captions} srcLang="en" label="English" />
        Your browser cannot play this video.{" "}
        <a href={video} download>
          Download the tutorial
        </a>
        .
      </video>
      {failed && (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          The video could not load. It needs a connection; the written steps
          here cover the same ground.
        </p>
      )}
    </>
  )
}
