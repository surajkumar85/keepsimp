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
  editList: {
    title: "Apple: QuickTime file format, edit list atoms",
    url: "https://developer.apple.com/documentation/quicktime-file-format/edit_list_atom",
  },
  apple: {
    title: "Apple: HLS authoring specification for Apple devices",
    url: "https://developer.apple.com/documentation/http-live-streaming/hls-authoring-specification-for-apple-devices",
  },
}

export const videoPosts: readonly BlogPost[] = [
  {
    published: "2026-10-23",
    slug: "compress-video-to-a-size",
    title: "Under the limit, and still worth watching.",
    searchTitle: "How to compress a video to 25, 10 or 8 MB, without uploading",
    description:
      "Make a video fit under 25, 10 or 8 MB in your browser: how the bitrate, frame rate and size are chosen, and how close the result looks. No uploads.",
    keywords: [
      "compress video",
      "compress video to 25 MB",
      "compress video to 10 MB",
      "compress video to 8 MB",
      "reduce video file size",
      "video compressor no upload",
      "make video smaller",
    ],
    category: "A little know-how",
    readingTime: "5 min read",
    image: "/images/video-compress-guide.svg",
    imageAlt:
      "A large video file passing through a 25 MB limit and coming out as a smaller MP4, checked and looking very close",
    tool: "video-compressor",
    intro:
      "A chat app, an email or a form says the video is too big. Most online compressors want the whole file uploaded first, then make you wait. KeepSimp's video compressor works on your device: it works out what a file needs to fit, writes it, and checks it before you download it.",
    sections: [
      {
        id: "budget",
        title: "A size is a budget of bits.",
        paragraphs: [
          "A file's size is roughly its bitrate times its length. To fit a 2-minute video under 25 MB, the picture and the sound together get about 1.7 Mbit/s. The compressor gives the sound its share first (it converts the sound smaller when it would take more than a fifth), and the picture gets the rest.",
          "Too few bits for a large picture make it blocky. When the budget leaves fewer than 0.05 bits for each pixel of each frame in H.264 (about what HandBrake's sharing presets work to), the compressor first lowers more than 30 frames a second to 30, then makes the picture smaller, step by step, until it fits well. The sentence under the player says what it chose and why.",
        ],
        links: [
          {
            label: "Open the video compressor",
            href: "/dashboard/video-compressor/",
          },
        ],
      },
      {
        id: "passes",
        title: "Written, checked, and written again if it misses.",
        paragraphs: [
          "Browser encoders do not always keep to the bitrate they are given. So each file is watched as it is written: if the bytes so far say it will end up too large, writing stops and starts again with a corrected bitrate; a pass that ends too large is written again too, three passes at most. A result is never offered as fitting when it does not.",
          "Each file is then opened again: its size held to the limit, its length to the original's, its first and last frames decoded. A file already under its limit is copied as it is, with nothing taken from it.",
        ],
      },
      {
        id: "looks",
        title: "How close it looks.",
        paragraphs: [
          "Smaller should not mean worse than it needs to. After writing, frames are drawn from the original and the result at the same six moments and compared with SSIM, a measure of how much of the picture's structure is kept. The page says it in words (very close, close, a little softer) and in numbers, the average and the lowest frame.",
          "SSIM is a reading, not a promise: six frames stand for the whole, and a fast scene may lose more than a still one. If it reads softer than you want, choose a larger limit, or a better codec such as HEVC or AV1 where your browser writes them.",
        ],
      },
      {
        id: "limits",
        title: "Which limit to choose.",
        paragraphs: [
          "Apps change their limits, so check the one you are sending to. The compressor offers 8, 10, 25, 50 and 100 MB, half or a quarter of each file, or a size of your own, where 1 MB is 1,048,576 bytes. If a limit is too small even at 240p, the page says how small the video can be made, or you can leave the sound out to make room.",
          "For the smallest files that still play everywhere, keep MP4 with H.264. HEVC and AV1 need fewer bits for the same look, but some devices cannot play them.",
        ],
        links: [
          {
            label: "Guide: converting video, in full",
            href: "/blog/convert-video-without-uploading/",
          },
        ],
      },
    ],
    sources: [
      {
        title: "HandBrake: official presets",
        url: "https://handbrake.fr/docs/en/latest/technical/official-presets.html",
      },
      {
        title:
          "Wang et al.: image quality assessment, from error visibility to structural similarity",
        url: "https://ieeexplore.ieee.org/document/1284395",
      },
      sources.mediabunny,
    ],
  },
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
  {
    published: "2026-10-23",
    slug: "trim-video-without-losing-quality",
    title: "Keep the part that matters. Lose nothing else.",
    searchTitle: "How to trim a video without losing quality, for free",
    description:
      "Cut an MP4, MOV, WebM or MKV to the part you want in your browser: copied without encoding, or exact to the frame. Cut out several parts and save frames. No uploads.",
    keywords: [
      "trim video",
      "cut video",
      "trim video without losing quality",
      "lossless video cutter",
      "cut mp4 online",
      "remove part of a video",
      "save frame from video",
    ],
    category: "A little know-how",
    readingTime: "4 min read",
    image: "/images/video-trim-guide.svg",
    imageAlt:
      "A video's timeline with two parts kept and the middle cut out, joined into one shorter MP4, copied without encoding",
    tool: "video-trimmer",
    intro:
      "A recording runs on before the part you want, or has a stretch in the middle nobody needs. Most video tools re-encode the whole file to cut it, which takes time and costs quality. KeepSimp's video trimmer copies what you keep as it is when it can, cuts exactly to the frame when you ask, and does it all on your device.",
    sections: [
      {
        id: "keyframes",
        title: "Why a lossless cut lands on a keyframe.",
        paragraphs: [
          "A video does not store every frame whole. Now and then it holds a whole picture, a keyframe, and the frames between are written as changes from the ones around them. That is how a video stays small, and it is why a copy can only begin where a whole picture is: a frame written as a change means nothing without the frames it changes.",
          "So a lossless cut is moved out to the keyframes around it, and the trimmer says how much more that keeps; the keyframes are marked under its timeline. There is one exception: an MP4 or MOV with one part kept starts exactly where you asked, because the file can say where to start playing (an edit list) while it keeps the earlier frames only to be decoded.",
        ],
        links: [
          {
            label: "Open the video trimmer",
            href: "/dashboard/video-trimmer/",
          },
        ],
      },
      {
        id: "exact",
        title: "When you need the exact frame.",
        paragraphs: [
          "Choose Exact and the trimmer cuts to the frame and the sound to the sample. The picture is then encoded again, with the quality chosen in the settings (Original keeps close to its bitrate), so it takes longer and is no longer bit for bit the source. Where parts are joined, the sound fades over 4 ms on each side so a cut does not click.",
          "If you change anything else about the picture, a size, a frame rate or a format that cannot hold it, the picture is encoded anyway, so the cut is made exact at no extra cost. The sentence under the player says which.",
        ],
      },
      {
        id: "how",
        title: "How to trim.",
        paragraphs: [
          "Open the video trimmer and drop your video. Set a start and an end, by typing a time such as 1:07.25, dragging, or pressing I and O at the playhead, then Keep the selection or Cut it out. Do it again to cut out more; Undo and Redo go back and forth, and Play what is kept plays the parts one after another.",
          "The file is written as soon as the edits settle, opened again and checked, its length held to the parts kept, before you can download it. Save this frame (Shift + S) saves the frame at the playhead as a PNG, read from the file at its full size.",
        ],
        links: [
          {
            label: "Guide: converting video, in full",
            href: "/blog/convert-video-without-uploading/",
          },
        ],
      },
      {
        id: "limits",
        title: "What it keeps, and what it does not.",
        paragraphs: [
          "The picture and the sound are kept, and copied wherever they can be; the file's subtitles and chapters are not. Lossless cuts of WebM and MKV are made at keyframes at both ends, and a cut always ends at a keyframe or the end of the file, so a copy may run a little past the end you set. Choose Exact when that matters.",
          "Nothing is uploaded. The video is read a piece at a time and written to your browser's private storage on this device, so a long recording is trimmed without filling the memory.",
        ],
      },
    ],
    sources: [sources.editList, sources.mediabunny, sources.webcodecs],
  },
]
