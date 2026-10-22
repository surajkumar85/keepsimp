import type { BlogPost } from "./blog"

const sources = {
  youtube: {
    title: "YouTube Help: recommended upload encoding settings",
    url: "https://support.google.com/youtube/answer/1722171",
  },
  webcodecs: {
    title: "MDN: WebCodecs API",
    url: "https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API",
  },
  mediabunny: {
    title: "Mediabunny: converting media files",
    url: "https://mediabunny.dev/guide/converting-media-files",
  },
  apple: {
    title: "Apple: HLS authoring specification for Apple devices",
    url: "https://developer.apple.com/documentation/http-live-streaming/hls-authoring-specification-for-apple-devices",
  },
}

export const videoPosts: readonly BlogPost[] = [
  {
    published: "2026-10-23",
    slug: "convert-video-without-uploading",
    title: "Any video, in the format you need.",
    searchTitle: "How to convert video online for free, without uploading",
    description:
      "Convert video to MP4, WebM, MOV or MKV in your browser: when it is copied and when it is encoded, which format and quality to choose. Nothing is uploaded.",
    keywords: [
      "video converter",
      "convert video online free",
      "convert video without uploading",
      "change video format",
      "video converter no upload",
      "resize video",
      "change video frame rate",
      "rotate video",
    ],
    category: "A little know-how",
    readingTime: "5 min read",
    image: "/images/video-convert-guide.svg",
    imageAlt:
      "A video frame becoming three files, MP4, WebM and MKV, each with a tick, with a note that what did not have to change was copied",
    tool: "video-editor",
    intro:
      "Most online video converters want the whole file uploaded, make you wait in a queue, and cap what you can send. A video is the largest file most people have, and often the most private. KeepSimp's video editor converts it inside your browser, on your own device, at any length, and says plainly what it did to your picture and sound.",
    sections: [
      {
        id: "copy",
        title: "Copy first. Encode only what must change.",
        paragraphs: [
          "A video file is a container (MP4, MOV, WebM, MKV) holding a picture and sound in codecs (H.264, HEVC, VP9 and AV1 for the picture; AAC and Opus for the sound). Changing the container is often all that is needed, and then the picture can be copied into the new file exactly as it was: nothing is lost, and an hour of video takes seconds.",
          "The picture is encoded again only when something about it changes: a quality you choose, a smaller size, a lower frame rate, another codec, or a format that cannot hold the one it has. The editor says which happened, and why, in a sentence under the player before anything is written.",
        ],
      },
      {
        id: "format",
        title: "Which format to choose.",
        paragraphs: [
          "MP4 with H.264 plays on every phone, computer, TV and website: choose it when you do not know where the video is going. WebM (VP9 or AV1 with Opus sound) is made for the web and plays in every browser and on Android, but not in QuickTime. MOV is for Apple's Final Cut, iMovie and QuickTime. MKV holds almost anything as it is, so choose it when a file must not be encoded again.",
          "HEVC makes files about half the size of H.264 for the same look and plays on Apple devices and most phones; AV1 is smaller still and plays on recent devices. Some players lack both, so the editor uses them only when you choose them.",
        ],
        links: [
          {
            label: "Open the video editor",
            href: "/dashboard/video-editor/",
          },
        ],
      },
      {
        id: "quality",
        title: "Quality, size and frame rate.",
        paragraphs: [
          "High uses YouTube's recommended upload bitrate for the picture's size and frame rate, for example 8 Mbit/s for 1080p at 30 frames a second. Balanced is half of that and Small a quarter: our own choices, for sharing and sending. A video is never given more than it already holds, so a small file does not grow.",
          "Size sets the shorter side at most (1080p, 720p, 480p and so on), keeping the shape of the picture, and frame rate sets the most frames a second. Neither is ever raised. A turn is written as a setting that players follow in MP4 and MOV, so turning a copied video loses nothing.",
        ],
      },
      {
        id: "how",
        title: "How to convert.",
        paragraphs: [
          "Open the video editor and drop your videos: MP4, MOV, WebM, MKV or MPEG-TS, up to twenty at once. Choose a format and change what you need. Each video is converted as soon as it is read; play the original or the result, and download one or all of them as a ZIP.",
          "Every result is opened again before it is offered: its format, codec, size, frame rate and sound are held to what was asked, its length to the original's, and its first and last frames and its sound are decoded. If anything is not as asked, the page says what.",
        ],
        links: [
          {
            label: "Guide: MOV, WebM or MKV to MP4",
            href: "/blog/convert-mov-webm-mkv-to-mp4/",
          },
        ],
      },
      {
        id: "limits",
        title: "What your browser decides.",
        paragraphs: [
          "The picture is encoded by your browser's own encoder (WebCodecs), often on your device's graphics hardware. Browsers differ: HEVC is written only on some hardware and in Safari, AV1 not in Safari, and Firefox on Android writes no video at all. The editor asks your browser what it can write at each size and offers what it can; copying needs no encoder.",
          "HDR video is written without tone mapping, so its colours may look flat on some screens, and a file's own subtitles and chapters are not kept. Results are written to your browser's private storage on this device while they are made, so long videos do not fill the memory, and removed when you close the page (or, if the browser stops first, the next time the editor opens).",
        ],
      },
    ],
    sources: [
      sources.youtube,
      sources.webcodecs,
      sources.mediabunny,
      sources.apple,
    ],
  },
  {
    published: "2026-10-23",
    slug: "convert-mov-webm-mkv-to-mp4",
    title: "From MOV, WebM or MKV to an MP4 that plays everywhere.",
    searchTitle: "Convert MOV, WebM or MKV to MP4 for free, without uploading",
    description:
      "Turn iPhone MOVs, WebM screen recordings and MKV files into MP4s that play everywhere, copied as they are when they can be, in your browser. No uploads.",
    keywords: [
      "MOV to MP4",
      "WebM to MP4",
      "MKV to MP4",
      "convert iPhone video to MP4",
      "HEVC to H.264",
      "MP4 converter",
      "video converter no upload",
    ],
    category: "A little know-how",
    readingTime: "4 min read",
    image: "/images/video-mp4-guide.svg",
    imageAlt:
      "Three files, MOV, WebM and MKV, joining into one MP4 that a phone, a laptop and a TV all play",
    tool: "video-converter",
    intro:
      "A video plays on your phone and nowhere else; a site refuses a screen recording; a TV will not open a camera's file. Usually the answer is an MP4, and often the picture inside does not need to change at all. Here is how to make one on your own device, and when it has to be encoded again.",
    sections: [
      {
        id: "mov",
        title: "MOV to MP4, from an iPhone or a Mac.",
        paragraphs: [
          "An iPhone records MOV files with HEVC pictures (or H.264 when Most Compatible is chosen in its camera settings). MOV and MP4 are close relatives, so an H.264 or HEVC picture is copied into the MP4 as it is, in seconds, with nothing lost. The phone's turn stays a setting that players follow.",
          "HEVC plays on Apple devices and most recent phones and computers, but not everywhere. For a file that must play on anything, choose H.264 as the codec: the picture is then encoded again, at YouTube's recommended bitrate for its size.",
        ],
      },
      {
        id: "webm",
        title: "WebM to MP4, from a screen recorder or the web.",
        paragraphs: [
          "WebM files hold VP8, VP9 or AV1 pictures and Opus sound. An MP4 can hold VP9 and AV1, but QuickTime and older devices cannot play them there, so by default the picture is encoded again as H.264 and the sound as AAC: the MP4 then plays everywhere. If you only need it to play in browsers, choose VP9 or AV1 as the codec and it is copied instead.",
        ],
      },
      {
        id: "mkv",
        title: "MKV to MP4, from a camera, a game or a download.",
        paragraphs: [
          "MKV holds almost any codec. When its picture is H.264 or HEVC it is copied into the MP4 as it is. Sound in AC-3 or DTS, common in films, does not play everywhere in an MP4, so it is converted to AAC; if your browser cannot play that sound, the page says so and offers to keep it as MKV or leave it out.",
        ],
        links: [
          {
            label: "Open the Video converter",
            href: "/dashboard/video-converter/",
          },
        ],
      },
      {
        id: "how",
        title: "How to do it.",
        paragraphs: [
          "Open the Video converter, drop your files and leave the format on MP4. The sentence under the player says whether the picture is copied or encoded again and why. Each file is converted as soon as it is read, checked, and offered for download, alone or in a ZIP with the others.",
          "The MP4 has its index at the start (fast start), as YouTube asks, so it starts playing before it has all loaded. Nothing is uploaded: the files never leave your device.",
        ],
        links: [
          {
            label: "Guide: converting video, in full",
            href: "/blog/convert-video-without-uploading/",
          },
        ],
      },
    ],
    sources: [sources.youtube, sources.mediabunny, sources.webcodecs],
  },
]
